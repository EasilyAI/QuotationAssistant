"""
Search API Lambda Handler - Router

Main entry point that routes requests to appropriate endpoint handlers.
"""

import os
import logging
from typing import Dict, Any

from .utils import create_response
from .search import handle_search
from .autocomplete import handle_autocomplete
from .product import handle_get_product
from .batch_search import handle_batch_search

# Configure logging
logger = logging.getLogger(__name__)
logger.setLevel(os.getenv('LOG_LEVEL', 'INFO'))


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Main Lambda handler for Search API.
    
    Routes requests to appropriate handlers based on path.
    
    Args:
        event: API Gateway event
        context: Lambda context
        
    Returns:
        API Gateway response
    """
    logger.info(f"Request: {event.get('requestContext', {}).get('http', {}).get('method')} {event.get('rawPath')}")
    
    # Handle OPTIONS for CORS
    if event.get('requestContext', {}).get('http', {}).get('method') == 'OPTIONS':
        return create_response(200, '')
    
    # Verify authentication (API key or Cognito token)
    try:
        from shared.api_key_auth import verify_api_key, create_unauthorized_response
        
        # Check for Cognito token first (Authorization: Bearer <token>)
        headers = event.get('headers', {}) or {}
        # Try different case variations of the Authorization header
        auth_header = None
        for key in headers:
            if key.lower() == 'authorization':
                auth_header = headers[key]
                break
        
        has_cognito_token = False
        if auth_header and isinstance(auth_header, str) and auth_header.startswith('Bearer '):
            token = auth_header[7:].strip()
            if token:
                # If we have a Bearer token, check if it's a valid JWT structure
                # (basic check - actual verification would be done by API Gateway authorizer)
                parts = token.split('.')
                if len(parts) == 3:  # JWT has 3 parts
                    has_cognito_token = True
                    logger.info("Request authenticated with Cognito Bearer token")
        
        # If no Cognito token, check for API key
        if not has_cognito_token:
            is_valid, error_msg = verify_api_key(event, 'product-search', require_ip_whitelist=False)
            if not is_valid:
                return create_unauthorized_response(error_msg or "Invalid or missing API key")
            logger.info("Request authenticated with API key")
    except ImportError:
        logger.warning("Shared auth module not available, skipping authentication verification")
        # In development, allow without auth if module not available
    
    # Route based on path
    path = event.get('rawPath', '').lower()
    method = event.get('requestContext', {}).get('http', {}).get('method', '').upper()
    
    if '/batch-search' in path:
        logger.info(f"Redirecting to batch search service")
        return handle_batch_search(event)
    elif '/search' in path:
        logger.info(f"Redirecting to search service")
        return handle_search(event)
    elif '/autocomplete' in path:
        logger.info(f"Redirecting to autocomplete service")
        return handle_autocomplete(event)
    elif '/product' in path:
        logger.info(f"Redirecting to get product service")
        return handle_get_product(event)
    else:
        return create_response(404, {
            'error': 'Not found',
            'message': 'Valid endpoints: /search, /autocomplete, /product/{orderingNumber}, /batch-search',
            'available_endpoints': [
                'GET /search?q=<query>&category=<category>&size=<size>',
                'GET /autocomplete?q=<prefix>&category=<category>&size=<size>',
                'GET /product/{orderingNumber}',
                'POST /batch-search'
            ]
        })
