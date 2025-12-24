"""
Batch search endpoint handler.
"""

import logging
import os
import json
from typing import Dict, Any, List
from concurrent.futures import ThreadPoolExecutor, as_completed

from .utils import create_response, get_search_service
from .rerank_openai import rerank_results

# Configure logging
logger = logging.getLogger(__name__)
logger.setLevel(os.getenv('LOG_LEVEL', 'INFO'))


def get_request_body(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    Extract request body from API Gateway event.
    
    Args:
        event: API Gateway event
        
    Returns:
        Parsed request body as dict
    """
    body = event.get('body', '{}')
    
    if isinstance(body, str):
        try:
            return json.loads(body)
        except json.JSONDecodeError:
            return {}
    
    return body if isinstance(body, dict) else {}


def handle_batch_search(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    Handle /batch-search POST requests.
    
    Request body:
    - items (required): Array of items to search, each with:
      - orderingNumber (optional): Ordering number/SKU to search by
      - description (required if no orderingNumber): Description to search by
      - quantity (required): Quantity needed
      - productCategory (required): Product category
    - size (optional): Number of results to retrieve before optional re-ranking (default 30, max 100)
    - min_score (optional): Minimum similarity score (0-1)
    - use_ai (optional): Whether to enable LLM-based re-ranking (default: true, only for description searches)
    - result_size (optional): Number of results to return after re-ranking (default: 5)
    
    Args:
        event: API Gateway event
        
    Returns:
        API Gateway response with batch search results
    """
    try:
        body = get_request_body(event)
        items = body.get('items', [])
        
        if not items or not isinstance(items, list):
            return create_response(400, {
                'error': 'Missing or invalid items array'
            })
        
        # Extract optional parameters
        size = int(body.get('size', 30))
        size = min(max(size, 1), 100)  # Clamp between 1-100
        
        min_score = float(body.get('min_score', 0.0))
        min_score = max(0.0, min(1.0, min_score))  # Clamp between 0-1
        
        # Optional AI re-ranking controls
        use_ai_param = body.get('use_ai')
        should_use_ai = True
        if use_ai_param is not None:
            should_use_ai = str(use_ai_param).strip().lower() not in {'false', '0', 'no'}
        
        result_size_param = body.get('result_size')
        num_results_to_return = 5
        if result_size_param is not None:
            try:
                num_results_to_return = int(result_size_param)
            except ValueError:
                raise ValueError("result_size must be an integer")
        
        # Clamp number of results to return
        num_results_to_return = max(1, min(num_results_to_return, size))
        
        logger.info(
            "Batch search parameters: items = %d, size = %s, "
            "min_score = %s, use_ai = %s, result_size = %s",
            len(items),
            size,
            min_score,
            should_use_ai,
            num_results_to_return,
        )
        
        # Execute batch searches in parallel
        service = get_search_service()
        results = _execute_batch_searches(
            service=service,
            items=items,
            size=size,
            min_score=min_score,
            should_use_ai=should_use_ai,
            num_results_to_return=num_results_to_return
        )
        
        # Calculate summary statistics
        total_items = len(items)
        items_with_matches = sum(1 for r in results if r.get('matches') and len(r['matches']) > 0)
        items_without_matches = total_items - items_with_matches
        
        # Format response
        response_body = {
            'results': results,
            'summary': {
                'total': total_items,
                'found': items_with_matches,
                'notFound': items_without_matches
            }
        }
        
        return create_response(200, response_body)
        
    except ValueError as e:
        logger.error(f"Validation error: {str(e)}")
        return create_response(400, {
            'error': 'Invalid parameter',
            'message': str(e)
        })
    except Exception as e:
        logger.error(f"Batch search error: {str(e)}", exc_info=True)
        return create_response(500, {
            'error': 'Internal server error',
            'message': str(e)
        })


def _execute_batch_searches(
    service,
    items: List[Dict[str, Any]],
    size: int,
    min_score: float,
    should_use_ai: bool,
    num_results_to_return: int
) -> List[Dict[str, Any]]:
    """
    Execute batch searches in parallel.
    
    Args:
        service: SearchService instance
        items: List of items to search
        size: Number of results to retrieve
        min_score: Minimum similarity score
        should_use_ai: Whether to use AI re-ranking
        num_results_to_return: Number of results to return after re-ranking
        
    Returns:
        List of search results, one per item
    """
    results = []
    
    def search_item(item: Dict[str, Any], index: int) -> Dict[str, Any]:
        """
        Search a single item.
        
        This function is not redundant with search.py's handle_search - it serves a different purpose:
        - It's a wrapper for batch processing that handles search hierarchy (ordering number vs description)
        - It formats results specifically for batch response structure
        - It handles per-item error handling without failing the entire batch
        - It's designed to run in parallel via ThreadPoolExecutor
        
        The underlying search service (SearchService.vector_search) is reused from search.py.
        """
        ordering_number = item.get('orderingNumber', '').strip() if item.get('orderingNumber') else None
        description = item.get('description', '').strip() if item.get('description') else None
        category = item.get('productCategory') or item.get('productType')
        quantity = item.get('quantity', 1)
        
        # Validate item has at least one search term
        if not ordering_number and not description:
            logger.warning(f"Item {index} has neither orderingNumber nor description, skipping")
            return {
                'itemIndex': index,
                'query': ordering_number or description or 'N/A',
                'category': category,
                'quantity': quantity,
                'matches': [],
                'error': 'Item must have either orderingNumber or description'
            }
        
        try:
            # Search hierarchy: if ordering number exists, search by ordering number
            # Otherwise, search by description
            if ordering_number:
                # Search by ordering number (exact/prefix match via text_query)
                logger.info(
                    "Searching item %d by ordering number: '%s' (category: %s)",
                    index,
                    ordering_number,
                    category
                )
                search_results = service.vector_search(
                    query=ordering_number,
                    limit=size,
                    category=category,
                    min_score=min_score,
                    text_query=ordering_number  # Force text search for ordering number (supports prefix matching via PREFIX tokenizer)
                )
                
                # If no results and query is short (likely a prefix), also try autocomplete-style search
                if len(search_results) == 0 and len(ordering_number) >= 2:
                    logger.info(
                        "No results from vector search, trying autocomplete-style prefix search for '%s'",
                        ordering_number
                    )
                    autocomplete_results = service.autocomplete(
                        prefix=ordering_number,
                        limit=size,
                        category=category
                    )
                    # Convert autocomplete results to match vector_search format
                    if autocomplete_results:
                        search_results = [{
                            'orderingNumber': item.get('orderingNumber', ''),
                            'category': item.get('category', category or ''),
                            'score': 0.9,  # High score for prefix matches
                            'relevance': 'high',
                            'searchText': item.get('searchText', '')
                        } for item in autocomplete_results]
                
                # No re-ranking for ordering number searches (exact/prefix match)
                search_results = search_results[:num_results_to_return]
            else:
                # Search by description (vector search)
                logger.info(
                    "Searching item %d by description: '%s' (category: %s)",
                    index,
                    description,
                    category
                )
                search_results = service.vector_search(
                    query=description,
                    limit=size,
                    category=category,
                    min_score=min_score
                )
                
                # Apply re-ranking only for description-based searches
                if should_use_ai and len(search_results) > 5:
                    logger.info(
                        "Invoking OpenAI re-ranking for item %d with %d candidates (top %d)",
                        index,
                        len(search_results),
                        num_results_to_return,
                    )
                    search_results = rerank_results(
                        query=description,
                        results=search_results,
                        top_k=num_results_to_return
                    )
                else:
                    # If we are not re-ranking, still respect the requested number of results to return
                    search_results = search_results[:num_results_to_return]
            
            # Format matches to match frontend expectations
            formatted_matches = []
            for match in search_results:
                formatted_matches.append({
                    'id': f'M{index}-{len(formatted_matches) + 1}',
                    'productName': match.get('searchText', ''),
                    'orderingNo': match.get('orderingNumber', ''),
                    'confidence': int(match.get('score', 0) * 100) if match.get('score') else 0,
                    'type': match.get('category', category or ''),
                    'specifications': match.get('searchText', ''),
                    'score': match.get('score', 0),
                    'relevance': match.get('relevance', 'low')
                })
            
            return {
                'itemIndex': index,
                'query': ordering_number or description,
                'category': category,
                'quantity': quantity,
                'matches': formatted_matches
            }
            
        except Exception as e:
            logger.error(f"Error searching item {index}: {str(e)}", exc_info=True)
            return {
                'itemIndex': index,
                'query': ordering_number or description or 'N/A',
                'category': category,
                'quantity': quantity,
                'matches': [],
                'error': str(e)
            }
    
    # Execute searches in parallel using ThreadPoolExecutor
    # Using threads since the search service uses synchronous Qdrant client
    max_workers = min(len(items), 10)  # Limit concurrent searches to avoid overwhelming the system
    
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        # Submit all search tasks
        future_to_item = {
            executor.submit(search_item, item, idx): (item, idx)
            for idx, item in enumerate(items)
        }
        
        # Collect results as they complete
        item_results = {}
        for future in as_completed(future_to_item):
            try:
                result = future.result()
                item_results[result['itemIndex']] = result
            except Exception as e:
                item, idx = future_to_item[future]
                logger.error(f"Failed to get result for item {idx}: {str(e)}")
                item_results[idx] = {
                    'itemIndex': idx,
                    'query': item.get('orderingNumber') or item.get('description') or 'N/A',
                    'category': item.get('productCategory') or item.get('productType'),
                    'quantity': item.get('quantity', 1),
                    'matches': [],
                    'error': str(e)
                }
    
    # Return results in original order
    return [item_results[i] for i in range(len(items))]

