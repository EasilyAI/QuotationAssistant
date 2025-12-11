"""
Search endpoint handler.
"""

import logging
from typing import Dict, Any

from .utils import get_query_params, create_response, get_search_service

# Configure logging
logger = logging.getLogger(__name__)


def handle_search(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    Handle /search requests.
    
    Query parameters:
    - q (required): Search query
    - category (optional): Filter by category
    - size (optional): Number of results (default 30, max 100)
    - min_score (optional): Minimum similarity score (0-1)
    
    Args:
        event: API Gateway event
        
    Returns:
        API Gateway response with search results
    """
    try:
        params = get_query_params(event)
        query = params.get('q', '').strip()
        
        if not query:
            return create_response(400, {
                'error': 'Missing required parameter: q'
            })
        
        # Extract optional parameters
        category = params.get('category', '').strip() or None
        size = int(params.get('size', 30))
        size = min(max(size, 1), 100)  # Clamp between 1-100
        
        min_score = float(params.get('min_score', 0.0))
        min_score = max(0.0, min(1.0, min_score))  # Clamp between 0-1
        
        logger.info(f"Search: q='{query}', category={category}, size={size}")
        
        # Execute search
        service = get_search_service()
        results = service.vector_search(
            query=query,
            limit=size,
            category=category,
            min_score=min_score
        )
        
        # Format response
        response_body = {
            'query': query,
            'category': category,
            'results': results,
            'count': len(results),
            'total': len(results)
        }
        
        return create_response(200, response_body)
        
    except ValueError as e:
        logger.error(f"Validation error: {str(e)}")
        return create_response(400, {
            'error': 'Invalid parameter',
            'message': str(e)
        })
    except Exception as e:
        logger.error(f"Search error: {str(e)}", exc_info=True)
        return create_response(500, {
            'error': 'Internal server error',
            'message': str(e)
        })

