"""
Line item business logic service.
"""

import os
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime
from decimal import Decimal
import boto3

from schemas.quotation_model import create_line_item
from services.quotation_service import (
    get_quotation,
    update_quotation_totals,
    update_quotation_with_lines_and_totals,
    get_quotations_table
)
from services.price_service import (
    calculate_line_final_price,
    refresh_line_prices,
    apply_global_margin_to_lines,
    calculate_quotation_totals
)

logger = logging.getLogger(__name__)
logger.setLevel(os.getenv('LOG_LEVEL', 'INFO'))


def add_line_item(quotation_id: str, line_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Add a line item to quotation.
    
    Args:
        quotation_id: Quotation ID
        line_data: Line item data
    
    Returns:
        Updated quotation or None if not found
    """
    quotation = get_quotation(quotation_id)
    if not quotation:
        logger.warning(f"[ADD_LINE] Quotation {quotation_id} not found")
        return None
    
    logger.info(f"[ADD_LINE] Adding line to quotation {quotation_id}")
    
    # Convert numeric values to Decimal if needed
    quantity = line_data.get('quantity', 1.0)
    if not isinstance(quantity, Decimal):
        quantity = Decimal(str(quantity))
    
    # Handle base_price - None indicates price not found
    base_price = line_data.get('base_price')
    if base_price is not None and not isinstance(base_price, Decimal):
        base_price = Decimal(str(base_price))
    
    margin_pct = line_data.get('margin_pct')
    if margin_pct is not None and not isinstance(margin_pct, Decimal):
        margin_pct = Decimal(str(margin_pct))
    
    final_price = line_data.get('final_price')
    if final_price is not None and not isinstance(final_price, Decimal):
        final_price = Decimal(str(final_price))
    
    # Create line item
    line = create_line_item(
        ordering_number=line_data.get('ordering_number'),
        product_name=line_data.get('product_name', 'Item'),
        description=line_data.get('description'),
        quantity=float(quantity),
        base_price=float(base_price) if base_price is not None else None,
        margin_pct=float(margin_pct) if margin_pct is not None else None,
        final_price=float(final_price) if final_price is not None else None,
        drawing_link=line_data.get('drawing_link'),
        catalog_link=line_data.get('catalog_link'),
        notes=line_data.get('notes'),
        source=line_data.get('source', 'manual'),
        product_ref=line_data.get('product_ref'),
        original_request=line_data.get('original_request')
    )
    
    # Calculate final_price if not provided and base_price exists
    if line.get('final_price') is None and line.get('base_price') is not None:
        global_margin = quotation.get('global_margin_pct', Decimal('0.0'))
        line['final_price'] = calculate_line_final_price(
            line['base_price'],
            line.get('margin_pct'),
            global_margin
        )
    
    # Add to lines array
    lines = quotation.get('lines', [])
    lines.append(line)
    
    logger.info(f"[ADD_LINE] Line added with ID {line['line_id']}")
    
    # Update quotation with lines and totals in a single operation
    updated_quotation = update_quotation_with_lines_and_totals(
        quotation_id,
        lines,
        quotation  # Pass quotation to avoid re-fetching
    )
    
    if updated_quotation:
        logger.info(f"[ADD_LINE] Successfully updated quotation {quotation_id[:8]}...")
    else:
        logger.error(f"[ADD_LINE] Failed to update quotation {quotation_id[:8]}...")
    
    return updated_quotation


def add_batch_line_items(quotation_id: str, lines_data: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """
    Add multiple line items to quotation (for product-search-api integration).
    
    Args:
        quotation_id: Quotation ID
        lines_data: List of line item data
    
    Returns:
        Updated quotation or None if not found
    """
    quotation = get_quotation(quotation_id)
    if not quotation:
        logger.warning(f"[BATCH_ADD] Quotation {quotation_id} not found")
        return None
    
    logger.info(f"[BATCH_ADD] Adding {len(lines_data)} lines to quotation {quotation_id[:8]}...")
    
    global_margin = quotation.get('global_margin_pct', Decimal('0.0'))
    existing_lines = quotation.get('lines', [])
    new_lines = []
    
    for idx, line_data in enumerate(lines_data):
        try:
            # Handle base_price - None indicates price not found
            base_price = line_data.get('base_price') or line_data.get('price')
            
            # Validate and convert quantity
            quantity = line_data.get('quantity', 1.0)
            if quantity is None:
                quantity = 1.0
            try:
                quantity = float(quantity)
                if quantity <= 0:
                    quantity = 1.0
            except (ValueError, TypeError):
                logger.warning(f"[BATCH_ADD] Invalid quantity for line {idx}: {quantity}, using default 1.0")
                quantity = 1.0
            
            # Validate and convert base_price
            base_price_float = None
            if base_price is not None:
                try:
                    base_price_float = float(base_price)
                    if base_price_float < 0:
                        logger.warning(f"[BATCH_ADD] Negative base_price for line {idx}: {base_price_float}, setting to None")
                        base_price_float = None
                except (ValueError, TypeError):
                    logger.warning(f"[BATCH_ADD] Invalid base_price for line {idx}: {base_price}, setting to None")
                    base_price_float = None
            
            # Validate and convert margin_pct
            margin_pct = line_data.get('margin_pct') or line_data.get('margin')
            margin_pct_float = None
            if margin_pct is not None:
                try:
                    margin_pct_float = float(margin_pct)
                    # If margin is > 1, assume it's a percentage and convert to decimal
                    if margin_pct_float > 1:
                        margin_pct_float = margin_pct_float / 100
                    if margin_pct_float < 0 or margin_pct_float > 1:
                        logger.warning(f"[BATCH_ADD] Invalid margin_pct for line {idx}: {margin_pct_float}, setting to None")
                        margin_pct_float = None
                except (ValueError, TypeError):
                    logger.warning(f"[BATCH_ADD] Invalid margin_pct for line {idx}: {margin_pct}, setting to None")
                    margin_pct_float = None
            
            # Create line item from product snapshot
            line = create_line_item(
                ordering_number=line_data.get('ordering_number') or line_data.get('orderingNo', ''),
                product_name=line_data.get('product_name') or line_data.get('productName', 'Item'),
                description=line_data.get('description') or line_data.get('specs', ''),
                quantity=quantity,
                base_price=base_price_float,
                margin_pct=margin_pct_float,
                drawing_link=line_data.get('drawing_link') or line_data.get('sketchFile'),
                catalog_link=line_data.get('catalog_link') or line_data.get('catalogLink'),
                notes=line_data.get('notes'),
                source='search',
                product_ref=line_data.get('product_ref') or {'product_id': line_data.get('product_id')},
                original_request=line_data.get('original_request', '')
            )
        except Exception as e:
            logger.error(f"[BATCH_ADD] Error processing line {idx}: {str(e)} | Data: {line_data}", exc_info=True)
            # Skip this line and continue with others
            continue
        
        # Calculate final_price only if base_price is set
        if line.get('base_price') is not None:
            line['final_price'] = calculate_line_final_price(
                line['base_price'],
                line.get('margin_pct'),
                global_margin
            )
        
        new_lines.append(line)
    
    # Combine with existing lines
    all_lines = existing_lines + new_lines
    
    # Update quotation with lines and totals in a single operation
    updated_quotation = update_quotation_with_lines_and_totals(
        quotation_id,
        all_lines,
        quotation  # Pass quotation to avoid re-fetching
    )
    
    if updated_quotation:
        logger.info(f"[BATCH_ADD] Successfully updated quotation {quotation_id[:8]}... with {len(new_lines)} new lines")
    else:
        logger.error(f"[BATCH_ADD] Failed to update quotation {quotation_id[:8]}...")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
    
    return updated_quotation


def update_line_item(
    quotation_id: str,
    line_id: str,
    line_data: Dict[str, Any]
) -> Optional[Dict[str, Any]]:
    """
    Update a line item in quotation.
    
    Args:
        quotation_id: Quotation ID
        line_id: Line item ID
        line_data: Updated line item data
    
    Returns:
        Updated quotation or None if not found
    """
    quotation = get_quotation(quotation_id)
    if not quotation:
        logger.warning(f"[UPDATE_LINE] Quotation {quotation_id} not found")
        return None
    
    lines = quotation.get('lines', [])
    line_index = None
    
    for idx, line in enumerate(lines):
        if line.get('line_id') == line_id:
            line_index = idx
            break
    
    if line_index is None:
        logger.warning(f"[UPDATE_LINE] Line {line_id} not found in quotation {quotation_id}")
        return None
    
    logger.info(f"[UPDATE_LINE] Updating line {line_id} in quotation {quotation_id}")
    
    # Update line fields
    line = lines[line_index]
    updatable_fields = [
        'ordering_number', 'product_name', 'description', 'quantity',
        'base_price', 'margin_pct', 'drawing_link', 'catalog_link', 'notes',
        'original_request'
    ]
    
    for field in updatable_fields:
        if field in line_data:
            value = line_data[field]
            # Convert numeric fields to Decimal
            if field in ['base_price', 'margin_pct', 'quantity'] and value is not None:
                value = Decimal(str(value))
            line[field] = value
    
    # Recalculate final_price if price-related fields changed
    base_price = line.get('base_price')
    if base_price is not None and any(field in line_data for field in ['base_price', 'margin_pct']):
        global_margin = quotation.get('global_margin_pct', Decimal('0.0'))
        if not isinstance(base_price, Decimal):
            base_price = Decimal(str(base_price))
        margin_pct = line.get('margin_pct')
        if margin_pct is not None and not isinstance(margin_pct, Decimal):
            margin_pct = Decimal(str(margin_pct))
        line['final_price'] = calculate_line_final_price(
            base_price,
            margin_pct,
            global_margin
        )
        logger.info(f"[UPDATE_LINE] Recalculated final_price: {line['final_price']}")
    
    # Manual final_price override
    if 'final_price' in line_data:
        line['final_price'] = line_data['final_price']
    
    line['updated_at'] = datetime.utcnow().isoformat() + "Z"
    
    # Update quotation with lines and totals in a single operation
    updated_quotation = update_quotation_with_lines_and_totals(
        quotation_id,
        lines,
        quotation  # Pass quotation to avoid re-fetching
    )
    
    if updated_quotation:
        logger.info(f"[UPDATE_LINE] Successfully updated quotation {quotation_id[:8]}...")
    else:
        logger.error(f"[UPDATE_LINE] Failed to update quotation {quotation_id[:8]}...")
    
    return updated_quotation


def delete_line_item(quotation_id: str, line_id: str) -> Optional[Dict[str, Any]]:
    """
    Delete a line item from quotation.
    
    Args:
        quotation_id: Quotation ID
        line_id: Line item ID
    
    Returns:
        Updated quotation or None if not found
    """
    quotation = get_quotation(quotation_id)
    if not quotation:
        return None
    
    lines = quotation.get('lines', [])
    updated_lines = [line for line in lines if line.get('line_id') != line_id]
    
    if len(updated_lines) == len(lines):
        return None  # Line not found
    
    # Update quotation with lines and totals in a single operation
    updated_quotation = update_quotation_with_lines_and_totals(
        quotation_id,
        updated_lines,
        quotation  # Pass quotation to avoid re-fetching
    )
    
    if updated_quotation:
        logger.info(f"[DELETE_LINE] Successfully updated quotation {quotation_id[:8]}...")
    else:
        logger.error(f"[DELETE_LINE] Failed to update quotation {quotation_id[:8]}...")
    
    return updated_quotation


def apply_global_margin(quotation_id: str, global_margin_pct: Decimal) -> Optional[Dict[str, Any]]:
    """
    Apply global margin to all lines in quotation.
    
    Args:
        quotation_id: Quotation ID
        global_margin_pct: Global margin percentage (0..1)
    
    Returns:
        Updated quotation or None if not found
    """
    quotation = get_quotation(quotation_id)
    if not quotation:
        return None
    
    lines = quotation.get('lines', [])
    updated_lines = apply_global_margin_to_lines(lines, global_margin_pct)
    
    # Update quotation with new margin, lines, and totals in a single operation
    # First, update the quotation's global_margin_pct in memory for totals calculation
    quotation['global_margin_pct'] = global_margin_pct
    
    # Calculate totals with updated margin
    vat_rate = quotation.get('vat_rate', Decimal('0.18'))
    if not isinstance(vat_rate, Decimal):
        vat_rate = Decimal(str(vat_rate))
    
    totals = calculate_quotation_totals(updated_lines, vat_rate, global_margin_pct)
    
    table = get_quotations_table()
    try:
        response = table.update_item(
            Key={'quotation_id': quotation_id},
            UpdateExpression="SET #lines = :lines, #global_margin_pct = :margin, #totals = :totals, #updated_at = :updated_at",
            ExpressionAttributeNames={
                '#lines': 'lines',
                '#global_margin_pct': 'global_margin_pct',
                '#totals': 'totals',
                '#updated_at': 'updated_at'
            },
            ExpressionAttributeValues={
                ':lines': updated_lines,
                ':margin': global_margin_pct,
                ':totals': totals,
                ':updated_at': datetime.utcnow().isoformat() + "Z"
            },
            ReturnValues='ALL_NEW'
        )
        return response.get('Attributes')
    except Exception as e:
        logger.error(f"Error applying global margin to quotation {quotation_id}: {str(e)}")
        return None


def refresh_prices(quotation_id: str) -> Optional[Dict[str, Any]]:
    """
    Refresh base prices for all lines with ordering_number.
    
    Args:
        quotation_id: Quotation ID
    
    Returns:
        Updated quotation or None if not found
    """
    quotation = get_quotation(quotation_id)
    if not quotation:
        return None
    
    global_margin = quotation.get('global_margin_pct', Decimal('0.0'))
    if not isinstance(global_margin, Decimal):
        global_margin = Decimal(str(global_margin))
    
    lines = quotation.get('lines', [])
    updated_lines = refresh_line_prices(lines, global_margin)
    
    # Update quotation with lines and totals in a single operation
    updated_quotation = update_quotation_with_lines_and_totals(
        quotation_id,
        updated_lines,
        quotation  # Pass quotation to avoid re-fetching
    )
    
    if updated_quotation:
        logger.info(f"[REFRESH_PRICES] Successfully updated quotation {quotation_id[:8]}...")
    else:
        logger.error(f"[REFRESH_PRICES] Failed to update quotation {quotation_id[:8]}...")
    
    return updated_quotation

