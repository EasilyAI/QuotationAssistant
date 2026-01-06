"""
Price calculation and refresh service.
"""

import os
import logging
from typing import Dict, Any, List, Optional, Union
from decimal import Decimal, ROUND_HALF_UP
import sys

# Add shared directory to path
SERVICE_ROOT = os.path.dirname(os.path.dirname(__file__))
REPO_ROOT = os.path.abspath(os.path.join(SERVICE_ROOT, ".."))
SHARED_DIR = os.path.abspath(os.path.join(REPO_ROOT, "shared"))

for path in {SERVICE_ROOT, REPO_ROOT, SHARED_DIR}:
    if path not in sys.path:
        sys.path.append(path)

try:
    from shared.product_service import fetch_product
except ImportError:
    logger = logging.getLogger(__name__)
    logger.warning("Could not import shared.product_service - price refresh will be limited")
    fetch_product = None

logger = logging.getLogger(__name__)
logger.setLevel(os.getenv('LOG_LEVEL', 'INFO'))


def calculate_line_final_price(
    base_price: Decimal,
    margin_pct: Optional[Decimal],
    global_margin_pct: Decimal
) -> Decimal:
    """
    Calculate final price for a line item.
    
    Formula: final_price = base_price * (1 + margin_pct) * (1 + global_margin_pct)
    If margin_pct is None, use only global_margin_pct.
    
    Args:
        base_price: Base price from price list (Decimal)
        margin_pct: Per-line margin percentage (0..1) or None (Decimal)
        global_margin_pct: Global margin percentage (0..1) (Decimal)
    
    Returns:
        Final price (Decimal)
    """
    # Safely convert all inputs to Decimal
    base_price = _to_decimal(base_price)
    if base_price is None:
        base_price = Decimal('0.0')
    
    global_margin_pct = _to_decimal(global_margin_pct)
    if global_margin_pct is None:
        global_margin_pct = Decimal('0.0')
    
    if margin_pct is not None:
        margin_pct = _to_decimal(margin_pct)
        if margin_pct is None:
            margin_pct = Decimal('0.0')
        # Use per-line margin
        return (base_price * (Decimal('1') + margin_pct) * (Decimal('1') + global_margin_pct)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    else:
        # Use only global margin
        return (base_price * (Decimal('1') + global_margin_pct)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


def calculate_quotation_totals(
    lines: List[Dict[str, Any]],
    vat_rate: Decimal,
    global_margin_pct: Decimal
) -> Dict[str, Decimal]:
    """
    Calculate quotation totals (subtotal, vat_total, total).
    
    Args:
        lines: List of line items
        vat_rate: VAT rate (0..1) (Decimal)
        global_margin_pct: Global margin percentage (0..1) (Decimal)
    
    Returns:
        Dict with subtotal, vat_total, total (all Decimal)
    """
    # Ensure inputs are Decimal
    if not isinstance(vat_rate, Decimal):
        vat_rate = Decimal(str(vat_rate))
    if not isinstance(global_margin_pct, Decimal):
        global_margin_pct = Decimal(str(global_margin_pct))
    
    subtotal = Decimal('0.0')
    
    for line in lines:
        # Safely convert base_price - None means price not found, use 0
        base_price = _to_decimal(line.get('base_price'))
        if base_price is None:
            base_price = Decimal('0.0')
        
        # Safely convert quantity
        quantity = _to_decimal(line.get('quantity'))
        if quantity is None:
            quantity = Decimal('1.0')
        
        # Safely convert margin_pct - None is valid
        margin_pct = _to_decimal(line.get('margin_pct'))
        
        # Calculate final price per unit only if base_price is valid
        if base_price > 0:
            final_price_per_unit = calculate_line_final_price(
                base_price,
                margin_pct,
                global_margin_pct
            )
        else:
            # No base price, check if final_price is set manually
            final_price_per_unit = _to_decimal(line.get('final_price'))
            if final_price_per_unit is None:
                final_price_per_unit = Decimal('0.0')
        
        # Override with manual final_price if set
        if line.get('final_price') is not None:
            manual_final_price = _to_decimal(line.get('final_price'))
            if manual_final_price is not None:
                final_price_per_unit = manual_final_price
        
        # Add to subtotal
        subtotal += final_price_per_unit * quantity
    
    # Calculate VAT and total
    vat_total = (subtotal * vat_rate).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    total = (subtotal + vat_total).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    subtotal = subtotal.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    
    return {
        "subtotal": subtotal,
        "vat_total": vat_total,
        "total": total
    }


def refresh_line_prices(
    lines: List[Dict[str, Any]],
    global_margin_pct: Decimal
) -> List[Dict[str, Any]]:
    """
    Refresh base prices for lines with ordering_number by fetching from product service.
    
    Args:
        lines: List of line items
        global_margin_pct: Global margin percentage for recalculation
    
    Returns:
        Updated list of line items
    """
    if not fetch_product:
        logger.warning("fetch_product not available - skipping price refresh")
        return lines
    
    updated_lines = []
    
    for line in lines:
        ordering_number = line.get('ordering_number', '').strip()
        
        if not ordering_number:
            # No ordering number, skip refresh
            updated_lines.append(line)
            continue
        
        try:
            # Fetch product with current price
            product = fetch_product(ordering_number)
            current_price_data = product.get('currentPrice')
            
            # Preserve existing base_price in case price fetch fails
            existing_base_price = line.get('base_price')
            
            # Check if we have price data and a valid price value
            # Note: price can be 0 (free item), so we check for None specifically
            price_value = None
            if current_price_data:
                price_value = current_price_data.get('price')
            
            if price_value is not None:
                # We have a price value (could be 0 for free items)
                new_base_price = _to_decimal(price_value)
                
                # Only update if conversion succeeded
                if new_base_price is not None:
                    line['base_price'] = new_base_price
                    logger.info(f"Updated base_price for {ordering_number}: {line['base_price']}")
                else:
                    # Conversion failed, preserve existing or log warning
                    if existing_base_price is None:
                        logger.warning(f"Failed to convert price value for {ordering_number}, no existing price to preserve")
                    else:
                        logger.warning(f"Failed to convert price value for {ordering_number}, preserving existing price: {existing_base_price}")
            else:
                # No price value found (current_price_data is None or price key missing/None)
                if existing_base_price is None:
                    logger.warning(f"No current price found for {ordering_number} and no existing price to preserve")
                else:
                    logger.info(f"No current price found for {ordering_number}, preserving existing price: {existing_base_price}")
            
            # Recalculate final_price using safe conversion
            margin_pct = _to_decimal(line.get('margin_pct'))
            
            base_price = _to_decimal(line.get('base_price'))
            if base_price is None:
                base_price = Decimal('0.0')
            
            global_margin_pct_safe = _to_decimal(global_margin_pct)
            if global_margin_pct_safe is None:
                global_margin_pct_safe = Decimal('0.0')
            
            if base_price > 0:
                line['final_price'] = calculate_line_final_price(
                    base_price,
                    margin_pct,
                    global_margin_pct_safe
                )
            else:
                # No base price, set final_price to 0
                line['final_price'] = Decimal('0.0')
            
        except Exception as e:
            logger.error(f"Error refreshing price for {ordering_number}: {str(e)}")
            # Keep original line on error
        
        updated_lines.append(line)
    
    return updated_lines


def _to_decimal(value) -> Optional[Decimal]:
    """
    Safely convert a value to Decimal, handling DynamoDB Decimals and various edge cases.
    
    Returns None if conversion fails or value is None.
    """
    if value is None:
        return None
    
    if isinstance(value, Decimal):
        return value
    
    try:
        # Convert to string first to handle various numeric types
        return Decimal(str(float(value)))
    except (ValueError, TypeError, Exception):
        return None


def apply_global_margin_to_lines(
    lines: List[Dict[str, Any]],
    global_margin_pct: Decimal
) -> List[Dict[str, Any]]:
    """
    Apply global margin to all lines by updating their margin_pct and recalculating final_price.
    
    Args:
        lines: List of line items
        global_margin_pct: Global margin percentage (0..1)
    
    Returns:
        Updated list of line items with new margin_pct values
    """
    # Safely convert global_margin_pct
    if not isinstance(global_margin_pct, Decimal):
        try:
            global_margin_pct = Decimal(str(float(global_margin_pct)))
        except (ValueError, TypeError, Exception) as e:
            logger.error(f"Invalid global_margin_pct value: {global_margin_pct}, error: {e}")
            return lines
    
    logger.info(f"Applying global margin {global_margin_pct} to {len(lines)} lines")
    
    updated_lines = []
    
    for line in lines:
        # Make a copy of the line to avoid mutating the original
        updated_line = dict(line)
        
        base_price = _to_decimal(updated_line.get('base_price'))
        
        # Skip lines without valid base_price
        if base_price is None:
            updated_lines.append(updated_line)
            continue
        
        # Update the line's margin_pct to match the global margin
        updated_line['margin_pct'] = global_margin_pct
        
        # Recalculate final_price using the new margin
        # Note: We use 0 for global_margin in calculation since we're applying margin_pct directly
        updated_line['final_price'] = calculate_line_final_price(
            base_price,
            global_margin_pct,
            Decimal('0.0')  # No additional global margin since we applied it to line
        )
        
        updated_lines.append(updated_line)
    
    logger.info(f"Updated {len(updated_lines)} lines with new margin")
    return updated_lines

