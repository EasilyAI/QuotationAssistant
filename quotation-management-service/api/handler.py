"""
Main API handler - routes requests to appropriate endpoint handlers.
"""

import os
import logging
from typing import Dict, Any

from api.utils import handle_cors_preflight, verify_api_key, create_response
from api.quotations import (
    handle_create_quotation,
    handle_get_quotations,
    handle_get_quotation,
    handle_update_quotation,
    handle_update_status,
    handle_delete_quotation
)
from api.lines import (
    handle_add_line,
    handle_update_line,
    handle_delete_line,
    handle_batch_add_lines,
    handle_apply_margin,
    handle_refresh_prices
)
from api.exports import (
    handle_export_stock_check,
    handle_export_priority_import,
    handle_get_export_download
)
from api.email import handle_email_draft

# Configure logging
logger = logging.getLogger(__name__)
# logger.setLevel(os.getenv('LOG_LEVEL', 'INFO'))
logger.setLevel('[Quotation Handler]')


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Main Lambda handler for Quotation Management API.
    
    Routes requests to appropriate handlers based on path and method.
    
    Args:
        event: API Gateway event
        context: Lambda context
        
    Returns:
        API Gateway response
    """
    logger.info(f"Request method: {event.get('requestContext', {}).get('http', {}).get('method')}")
    logger.info(f"Request path: {event.get('rawPath')}")
    
    # Handle CORS preflight
    cors_response = handle_cors_preflight(event)
    if cors_response:
        return cors_response
    
    # Verify API key
    if not verify_api_key(event):
        return create_response(401, {'error': 'Unauthorized', 'message': 'Invalid or missing API key'})
    
    # Route based on path and method
    path = event.get('rawPath', '').lower()
    method = event.get('requestContext', {}).get('http', {}).get('method', '').upper()
    
    # Quotation Management
    if path == '/quotations' and method == 'POST':
        return handle_create_quotation(event)

    elif path == '/quotations' and method == 'GET':
        return handle_get_quotations(event)

    elif path.startswith('/quotations/') and method == 'GET':
        return handle_get_quotation(event)

    elif path.startswith('/quotations/') and path.endswith('/status') and method == 'PATCH':
        return handle_update_status(event)

    elif path.startswith('/quotations/') and not any(x in path for x in ['/lines', '/exports', '/email-draft']) and method == 'PUT':
        return handle_update_quotation(event)
    
    elif path.startswith('/quotations/') and not any(x in path for x in ['/lines', '/exports', '/email-draft']) and method == 'DELETE':
        return handle_delete_quotation(event)
    
    # Line Items
    elif path.endswith('/lines/batch') and method == 'POST':
        return handle_batch_add_lines(event)

    elif path.endswith('/lines/apply-margin') and method == 'PATCH':
        return handle_apply_margin(event)

    elif path.endswith('/lines/refresh-prices') and method == 'POST':
        return handle_refresh_prices(event)

    elif '/lines/' in path and method == 'PUT':
        return handle_update_line(event)

    elif '/lines/' in path and method == 'DELETE':
        return handle_delete_line(event)
        
    elif path.endswith('/lines') and method == 'POST':
        return handle_add_line(event)
    
    # Exports
    elif path.endswith('/exports/stock-check') and method == 'POST':
        return handle_export_stock_check(event)
    elif path.endswith('/exports/priority-import') and method == 'POST':
        return handle_export_priority_import(event)
    elif '/exports/' in path and '/download' in path and method == 'GET':
        return handle_get_export_download(event)
    
    # Email Draft
    elif path.endswith('/email-draft') and method == 'POST':
        return handle_email_draft(event)
    
    else:
        return create_response(404, {
            'error': 'Not found',
            'message': 'Invalid endpoint or method',
            'path': path,
            'method': method
        })

