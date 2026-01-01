"""
Line item endpoint handlers.

NOTE: For bulk operations (adding/updating/deleting multiple items at once),
consider using the new full-state replacement endpoint instead:
PUT /quotations/{quotationId}/full-state

This endpoint replaces the entire quotation state atomically, which is more
efficient and simpler for operations that affect multiple line items.

These individual line item endpoints remain available for:
- Single item operations
- Incremental updates from other parts of the system
- Backward compatibility
"""

import os
import logging
from typing import Dict, Any

from api.utils import get_path_parameter, get_request_body, create_response
from schemas.validation import validate_line_item, validate_batch_lines
from services.line_service import (
    add_line_item,
    add_batch_line_items,
    update_line_item,
    delete_line_item,
    apply_global_margin,
    refresh_prices
)

logger = logging.getLogger(__name__)
logger.setLevel(os.getenv('LOG_LEVEL', 'INFO'))


def handle_add_line(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    Handle POST /quotations/{quotationId}/lines - Add line item.
    """
    try:
        quotation_id = get_path_parameter(event, 'quotationId')
        
        if not quotation_id:
            return create_response(400, {'error': 'Missing quotationId'})
        
        body = get_request_body(event)
        
        # Validate request
        is_valid, error = validate_line_item(body)
        if not is_valid:
            return create_response(400, {'error': 'Validation error', 'message': error})
        
        # Add line item
        quotation = add_line_item(quotation_id, body)
        
        if not quotation:
            return create_response(404, {'error': 'Quotation not found'})
        
        return create_response(200, quotation)
        
    except Exception as e:
        logger.error(f"Error adding line item: {str(e)}", exc_info=True)
        return create_response(500, {'error': 'Internal server error', 'message': 'Failed to add line item'})


def handle_batch_add_lines(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    Handle POST /quotations/{quotationId}/lines/batch - Batch add line items.
    
    For product-search-api integration.
    """
    try:
        quotation_id = get_path_parameter(event, 'quotationId')
        
        if not quotation_id:
            return create_response(400, {'error': 'Missing quotationId'})
        
        body = get_request_body(event)
        
        # Validate request
        is_valid, error = validate_batch_lines(body)
        if not is_valid:
            return create_response(400, {'error': 'Validation error', 'message': error})
        
        # Add batch line items
        quotation = add_batch_line_items(quotation_id, body.get('lines', []))
        
        if not quotation:
            return create_response(404, {'error': 'Quotation not found'})
        
        return create_response(200, quotation)
        
    except Exception as e:
        logger.error(f"Error adding batch line items: {str(e)}", exc_info=True)
        return create_response(500, {'error': 'Internal server error', 'message': 'Operation failed'})


def handle_update_line(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    Handle PUT /quotations/{quotationId}/lines/{lineId} - Update line item.
    """
    try:
        quotation_id = get_path_parameter(event, 'quotationId')
        line_id = get_path_parameter(event, 'lineId')
        
        if not quotation_id:
            return create_response(400, {'error': 'Missing quotationId'})
        if not line_id:
            return create_response(400, {'error': 'Missing lineId'})
        
        body = get_request_body(event)
        
        logger.info(f"[LINE-UPDATE] Quotation: {quotation_id[:8]}... | Line: {line_id[:8]}...")
        
        # Update line item
        quotation = update_line_item(quotation_id, line_id, body)
        
        if not quotation:
            return create_response(404, {'error': 'Quotation or line item not found'})
        
        return create_response(200, quotation)
        
    except Exception as e:
        logger.error(f"Error updating line item: {str(e)}", exc_info=True)
        return create_response(500, {'error': 'Internal server error', 'message': 'Operation failed'})


def handle_delete_line(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    Handle DELETE /quotations/{quotationId}/lines/{lineId} - Delete line item.
    """
    try:
        quotation_id = get_path_parameter(event, 'quotationId')
        line_id = get_path_parameter(event, 'lineId')
        
        if not quotation_id:
            return create_response(400, {'error': 'Missing quotationId'})
        if not line_id:
            return create_response(400, {'error': 'Missing lineId'})
        
        # Delete line item
        quotation = delete_line_item(quotation_id, line_id)
        
        if not quotation:
            return create_response(404, {'error': 'Quotation or line item not found'})
        
        return create_response(200, quotation)
        
    except Exception as e:
        logger.error(f"Error deleting line item: {str(e)}", exc_info=True)
        return create_response(500, {'error': 'Internal server error', 'message': 'Operation failed'})


def handle_apply_margin(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    Handle PATCH /quotations/{quotationId}/lines/apply-margin - Apply global margin.
    """
    try:
        quotation_id = get_path_parameter(event, 'quotationId')
        
        if not quotation_id:
            return create_response(400, {'error': 'Missing quotationId'})
        
        body = get_request_body(event)
        
        if 'global_margin_pct' not in body:
            return create_response(400, {'error': 'Missing global_margin_pct field'})
        
        try:
            from decimal import Decimal
            global_margin_pct = Decimal(str(body['global_margin_pct']))
            if global_margin_pct < 0 or global_margin_pct > 1:
                return create_response(400, {'error': 'global_margin_pct must be between 0 and 1'})
        except (ValueError, TypeError) as e:
            return create_response(400, {'error': 'global_margin_pct must be a number'})
        
        # Apply global margin
        quotation = apply_global_margin(quotation_id, global_margin_pct)
        
        if not quotation:
            return create_response(404, {'error': 'Quotation not found'})
        
        return create_response(200, quotation)
        
    except Exception as e:
        logger.error(f"Error applying global margin: {str(e)}", exc_info=True)
        return create_response(500, {'error': 'Internal server error', 'message': 'Operation failed'})


def handle_refresh_prices(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    Handle POST /quotations/{quotationId}/lines/refresh-prices - Refresh base prices.
    """
    try:
        quotation_id = get_path_parameter(event, 'quotationId')
        
        if not quotation_id:
            return create_response(400, {'error': 'Missing quotationId'})
        
        # Refresh prices
        quotation = refresh_prices(quotation_id)
        
        if not quotation:
            return create_response(404, {'error': 'Quotation not found'})
        
        return create_response(200, quotation)
        
    except Exception as e:
        logger.error(f"Error refreshing prices: {str(e)}", exc_info=True)
        return create_response(500, {'error': 'Internal server error', 'message': 'Operation failed'})

