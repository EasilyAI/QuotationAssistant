"""
Search endpoint handler.
"""

import logging
import os
from typing import Dict, Any

from .utils import get_query_params, create_response, get_search_service
from .rerank_openai import rerank_results

# Configure logging
logger = logging.getLogger(__name__)
logger.setLevel(os.getenv('LOG_LEVEL', 'INFO'))


def handle_search(
    event: Dict[str, Any],
    should_use_ai: bool = True,
    num_results_to_return: int = 5,
) -> Dict[str, Any]:
    """
    Handle /search requests.
    
    Query parameters:
    - q (required): Search query
    - category (optional): Filter by category
    - size (optional): Number of results to retrieve before optional re-ranking (default 30, max 100)
    - min_score (optional): Minimum similarity score (0-1)
    - use_ai (optional): Whether to enable LLM-based re-ranking (default: true)
    - result_size (optional): Number of results to return after re-ranking (default: 5)
    
    Args:
        event: API Gateway event
        
    Returns:
        API Gateway response with search results
    """
    try:
        params = get_query_params(event)
        query = params.get('q', '').strip()
        
        logger.info(f"Request path parameters = {params}")

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

        # Optional AI re-ranking controls from query params (override defaults if provided)
        use_ai_param = params.get('use_ai')
        if use_ai_param is not None:
            # Accept common truthy/falsey strings
            should_use_ai = str(use_ai_param).strip().lower() not in {'false', '0', 'no'}

        result_size_param = params.get('result_size')
        if result_size_param is not None:
            try:
                num_results_to_return = int(result_size_param)
            except ValueError:
                raise ValueError("result_size must be an integer")

        # Clamp number of results to return
        num_results_to_return = max(1, min(num_results_to_return, size))
        
        logger.info(
            "Search query parameters = q = %s, category = %s, size = %s, "
            "min_score = %s, use_ai = %s, result_size = %s",
            query,
            category,
            size,
            min_score,
            should_use_ai,
            num_results_to_return,
        )
        
        # Execute search
        service = get_search_service()
        results = service.vector_search(
            query=query,
            limit=size,
            category=category,
            min_score=min_score
        )

        # Optional LLM-based re-ranking (only if enough results to matter)
        if should_use_ai and len(results) > 5:
            logger.info(
                "Invoking OpenAI re-ranking for query '%s' with %d candidates (top %d)",
                query,
                len(results),
                num_results_to_return,
            )
            results = rerank_results(query=query, results=results, top_k=num_results_to_return)
        else:
            # If we are not re-ranking, still respect the requested number of results to return
            results = results[:num_results_to_return]
        
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
            'message': 'Failed to process search request'
        })

