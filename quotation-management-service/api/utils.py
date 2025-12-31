"""
Shared utility functions for the Quotation Management API.
"""

import os
import json
import logging
from typing import Dict, Any, Optional
from urllib.parse import parse_qs
import sys

# Add parent and shared directories to path
SERVICE_ROOT = os.path.dirname(os.path.dirname(__file__))
REPO_ROOT = os.path.abspath(os.path.join(SERVICE_ROOT, ".."))
SHARED_DIR = os.path.abspath(os.path.join(REPO_ROOT, "shared"))

for path in {SERVICE_ROOT, REPO_ROOT, SHARED_DIR}:
    if path not in sys.path:
        sys.path.append(path)

# Configure logging
logger = logging.getLogger(__name__)
logger.setLevel(os.getenv('LOG_LEVEL', 'INFO'))


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


def get_path_parameter(event: Dict[str, Any], param_name: str) -> Optional[str]:
    """
    Extract path parameter from API Gateway event.
    
    Args:
        event: API Gateway event
        param_name: Parameter name
        
    Returns:
        Parameter value or None
    """
    path_params = event.get('pathParameters') or {}
    return path_params.get(param_name) or path_params.get(param_name.lower())


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


def create_response(
    status_code: int,
    body: Any,
    headers: Optional[Dict[str, str]] = None
) -> Dict[str, Any]:
    """
    Create standardized API Gateway response with security headers.
    
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
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Api-Key',
        # Security headers
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
    }
    
    if headers:
        default_headers.update(headers)
    
    return {
        'statusCode': status_code,
        'headers': default_headers,
        'body': json.dumps(body, default=str) if not isinstance(body, str) else body
    }


def verify_api_key(event: Dict[str, Any]) -> bool:
    """
    Verify API key from request headers.
    
    Uses shared authentication utility for consistency across services.
    
    Args:
        event: API Gateway event
        
    Returns:
        True if API key is valid, False otherwise
    """
    try:
        from shared.api_key_auth import verify_api_key as shared_verify_api_key
        is_valid, _ = shared_verify_api_key(event, 'quotation', require_ip_whitelist=False)
        return is_valid
    except ImportError:
        # Fallback to local implementation if shared module not available
        logger.warning("Shared auth module not available, using local implementation")
        headers = event.get('headers', {}) or {}
        
        # Handle case-insensitive headers
        api_key = headers.get('x-api-key') or headers.get('X-Api-Key') or headers.get('X-API-Key')
        
        if not api_key:
            return False
        
        expected_key = os.getenv('QUOTATION_API_KEY')
        
        if not expected_key:
            logger.warning("QUOTATION_API_KEY not set in environment")
            return False
        
        return api_key == expected_key


def handle_cors_preflight(event: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Handle CORS preflight OPTIONS request.
    
    Args:
        event: API Gateway event
        
    Returns:
        CORS response or None if not a preflight request
    """
    method = event.get('requestContext', {}).get('http', {}).get('method', '').upper()
    
    if method == 'OPTIONS':
        return create_response(200, '')
    
    return None

