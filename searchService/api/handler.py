"""
Search API Lambda Handler

Provides REST API endpoints for product search and autocomplete.
"""

import os
import json
import logging
from typing import Dict, Any
from urllib.parse import parse_qs
import sys

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.dirname(__file__)))

from .qdrant_search import SearchService

# Note: SearchService uses embedding_bedrock (Bedrock for embeddings)

# Configure logging
logger = logging.getLogger(__name__)
logger.setLevel(os.getenv('LOG_LEVEL', 'INFO'))

# Global search service (reused across invocations)
search_service = None


def get_search_service() -> SearchService:
    """Get or create search service singleton."""
    global search_service
    
    if search_service is None:
        search_service = SearchService()
    
    return search_service


def get_query_params(event: Dict[str, Any]) -> Dict[str, str]:
    """
    Extract query parameters from API Gateway event.
    
    Args:
        event: API Gateway event
        
    Returns:
        Dict of query parameters
    """
    params = {}
    
    # HTTP API v2 format
    if 'queryStringParameters' in event and event['queryStringParameters']:
        params = event['queryStringParameters']
    
    # Handle URL-encoded parameters
    elif 'rawQueryString' in event:
        parsed = parse_qs(event['rawQueryString'])
        params = {k: v[0] if len(v) == 1 else v for k, v in parsed.items()}
    
    return params


def create_response(
    status_code: int,
    body: Any,
    headers: Dict[str, str] = None
) -> Dict[str, Any]:
    """
    Create standardized API Gateway response.
    
    Args:
        status_code: HTTP status code
        body: Response body
        headers: Optional additional headers
        
    Returns:
        API Gateway response
    """
    default_headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    }
    
    if headers:
        default_headers.update(headers)
    
    return {
        'statusCode': status_code,
        'headers': default_headers,
        'body': json.dumps(body) if not isinstance(body, str) else body
    }


def handle_search(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    Handle /search requests.
    
    Query params:
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


def handle_autocomplete(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    Handle /autocomplete requests.
    
    Query params:
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
        
        if len(query) < 2:
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
            'message': str(e)
        })


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
    
    if '/search' in path:
        return handle_search(event)
    elif '/autocomplete' in path:
        return handle_autocomplete(event)
    else:
        return create_response(404, {
            'error': 'Not found',
            'message': 'Valid endpoints: /search, /autocomplete',
            'available_endpoints': [
                'GET /search?q=<query>&category=<category>&size=<size>',
                'GET /autocomplete?q=<prefix>&category=<category>&size=<size>'
            ]
        })

