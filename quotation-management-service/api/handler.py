"""
Main API handler - routes requests to appropriate endpoint handlers.
"""

import os
import logging
from typing import Dict, Any

from api.utils import handle_cors_preflight, verify_auth, create_response
from api.quotations import (
    handle_create_quotation,
    handle_get_quotations,
    handle_get_quotation,
    handle_update_quotation,
    handle_update_status,
    handle_delete_quotation,
    handle_replace_quotation_state
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
from api.email import handle_email_draft, handle_send_email

# Configure logging
logger = logging.getLogger(__name__)
logger.setLevel(os.getenv('LOG_LEVEL', 'INFO'))

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
    method = event.get('requestContext', {}).get('http', {}).get('method', 'UNKNOWN')
    path = event.get('rawPath', 'UNKNOWN')
    
    # Normalize path - remove duplicate /quotations if present
    # Handle cases like /quotations/quotations or /quotations/quotations/...
    original_path = path
    while path.startswith('/quotations/quotations'):
        path = path.replace('/quotations/quotations', '/quotations', 1)
    
    if path != original_path:
        logger.warning(f"[HANDLER] Normalized duplicate path from {original_path} to {path}")
    
    logger.info(f"[HANDLER] Request method: {method}")
    logger.info(f"[HANDLER] Request path: {path}")
    
    # Log headers for debugging (but mask sensitive values)
    headers = event.get('headers', {}) or {}
    logger.info(f"[HANDLER] Headers present: {list(headers.keys())}")
    
    # Check for API key in headers (log presence, not value)
    api_key_headers = ['x-api-key', 'X-Api-Key', 'X-API-Key']
    api_key_present = any(h in headers for h in api_key_headers)
    logger.info(f"[HANDLER] API key header present: {api_key_present}")
    
    # Check for Authorization header
    auth_header_present = any(k.lower() == 'authorization' for k in headers.keys())
    logger.info(f"[HANDLER] Authorization header present: {auth_header_present}")
    
    # Handle CORS preflight
    cors_response = handle_cors_preflight(event)
    if cors_response:
        logger.info(f"[HANDLER] CORS preflight request, returning 200")
        return cors_response
    
    # Verify authentication (Cognito token or API key)
    logger.info(f"[HANDLER] Verifying authentication...")
    from api.utils import verify_auth
    auth_valid = verify_auth(event)
    logger.info(f"[HANDLER] Authentication verification result: {auth_valid}")
    
    if not auth_valid:
        logger.warning(f"[HANDLER] Authentication failed for {method} {path}")
        # Log more details about why it failed
        if not api_key_present and not auth_header_present:
            logger.warning(f"[HANDLER] No authentication headers found (neither API key nor Authorization)")
        elif auth_header_present and not api_key_present:
            logger.warning(f"[HANDLER] Authorization header present but token validation failed")
        return create_response(401, {'error': 'Unauthorized', 'message': 'Invalid or missing authentication'})
    
    # Route based on normalized path and method (use already normalized path)
    path = path.lower()
    method = method.upper()
    
    # Quotation Management
    if path == '/quotations' and method == 'POST':
        return handle_create_quotation(event)

    elif path == '/quotations' and method == 'GET':
        return handle_get_quotations(event)

    elif path.startswith('/quotations/') and method == 'GET':
        return handle_get_quotation(event)

    elif path.startswith('/quotations/') and path.endswith('/status') and method == 'PATCH':
        return handle_update_status(event)

    elif path.startswith('/quotations/') and path.endswith('/full-state') and method == 'PUT':
        return handle_replace_quotation_state(event)

    elif path.startswith('/quotations/') and not any(x in path for x in ['/lines', '/exports', '/email-draft', '/full-state']) and method == 'PUT':
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
    
    # Send Email
    elif path.endswith('/send-email') and method == 'POST':
        return handle_send_email(event)
    
    else:
        return create_response(404, {
            'error': 'Not found',
            'message': 'Invalid endpoint or method',
            'path': path,
            'method': method
        })

