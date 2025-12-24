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
