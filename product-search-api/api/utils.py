"""
Shared utility functions for the Search API.
"""

import os
import json
import logging
from typing import Dict, Any
from urllib.parse import parse_qs
import sys

# Add parent and shared directories to path
SERVICE_ROOT = os.path.dirname(os.path.dirname(__file__))
REPO_ROOT = os.path.abspath(os.path.join(SERVICE_ROOT, ".."))
SHARED_DIR = os.path.abspath(os.path.join(REPO_ROOT, "shared"))

for path in {SERVICE_ROOT, REPO_ROOT, SHARED_DIR}:
    if path not in sys.path:
        sys.path.append(path)

from .qdrant_search import SearchService

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

