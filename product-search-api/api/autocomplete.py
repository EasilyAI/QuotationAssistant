"""
Autocomplete endpoint handler.
"""

import logging
from typing import Dict, Any

from .utils import get_query_params, create_response, get_search_service

# Configure logging
logger = logging.getLogger(__name__)


def handle_autocomplete(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    Handle /autocomplete requests.
    
    Query parameters:
    - q (required): Search prefix (min 2 characters)
    - category (optional): Filter by category
    - size (optional): Number of suggestions (default 10, max 20)
    
    Args:
        event: API Gateway event
        
    Returns:
        API Gateway response with autocomplete suggestions
    """
    try:
        params = get_query_params(event)
        query = params.get('q', '').strip()
        
        if not query:
            return create_response(400, {
                'error': 'Missing required parameter: q'
            })
        
        if len(query) < 1:
            return create_response(200, {
                'query': query,
                'suggestions': [],
                'count': 0
            })
        
        # Extract optional parameters
        category = params.get('category', '').strip() or None
        size = int(params.get('size', 10))
        size = min(max(size, 1), 20)  # Clamp between 1-20
        
        logger.info(f"Autocomplete: q='{query}', category={category}, size={size}")
        
        # Execute autocomplete
        service = get_search_service()
        suggestions = service.autocomplete(
            prefix=query,
            limit=size,
            category=category
        )
        
        # Format response
        response_body = {
            'query': query,
            'suggestions': suggestions,
            'count': len(suggestions)
        }
        
        return create_response(200, response_body)
        
    except ValueError as e:
        logger.error(f"Validation error: {str(e)}")
        return create_response(400, {
            'error': 'Invalid parameter',
            'message': str(e)
        })
    except Exception as e:
        logger.error(f"Autocomplete error: {str(e)}", exc_info=True)
        return create_response(500, {
            'error': 'Internal server error',
            'message': 'Failed to process autocomplete request'
        })

