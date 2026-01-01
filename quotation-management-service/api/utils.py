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
logger = logging.getLogger('[UTILS]')
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
    
    logger.info(f"[GET-QUERY-PARAMS] Query parameters: {params}")
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


def verify_auth(event: Dict[str, Any]) -> bool:
    """
    Verify authentication from request headers.
    Supports both Cognito Bearer tokens and API keys (fallback).
    
    Args:
        event: API Gateway event
        
    Returns:
        True if authenticated, False otherwise
    """
    headers = event.get('headers', {}) or {}
    
    # Log header keys for debugging (case-insensitive check)
    header_keys_lower = [k.lower() for k in headers.keys()]
    logger.info(f"[AUTH] Available header keys (lowercase): {header_keys_lower}")
    
    # Check for Cognito token first (Authorization: Bearer <token>)
    auth_header = None
    for key in headers:
        if key.lower() == 'authorization':
            auth_header = headers[key]
            break
    
    has_cognito_token = False
    if auth_header and isinstance(auth_header, str) and auth_header.startswith('Bearer '):
        token = auth_header[7:].strip()
        if token:
            # Check if it's a valid JWT structure (3 parts separated by dots)
            parts = token.split('.')
            if len(parts) == 3:  # JWT has 3 parts
                has_cognito_token = True
                logger.info("[AUTH] Request authenticated with Cognito Bearer token")
                # Note: Actual JWT verification should be done by API Gateway authorizer
                # For now, we just check the structure
                return True
    
    # If no Cognito token, check for API key
    if not has_cognito_token:
        logger.info("[AUTH] No Cognito token found, checking for API key...")
        try:
            from shared.api_key_auth import verify_api_key as shared_verify_api_key
            logger.info("[AUTH] Using shared API key authentication module")
            
            # Try to get API key from headers for logging (without logging the value)
            api_key_headers = ['x-api-key', 'X-Api-Key', 'X-API-Key']
            api_key_found = None
            for header_key in api_key_headers:
                if header_key in headers:
                    api_key_found = header_key
                    break
            
            if api_key_found:
                logger.info(f"[AUTH] Found API key in header: {api_key_found} (length: {len(headers[api_key_found])})")
            else:
                logger.warning("[AUTH] No API key found in headers")
            
            is_valid, error_msg = shared_verify_api_key(event, 'quotation', require_ip_whitelist=False)
            
            if not is_valid:
                logger.warning(f"[AUTH] API key verification failed: {error_msg}")
            else:
                logger.info("[AUTH] API key verification successful")
            
            return is_valid
        except ImportError as e:
        # Fallback to local implementation if shared module not available
            logger.warning(f"[AUTH] Shared auth module not available: {e}, using local implementation")
            logger.warning("[AUTH] This should not happen in production - check shared module path")
            
            # Handle case-insensitive headers
            api_key = headers.get('x-api-key') or headers.get('X-Api-Key') or headers.get('X-API-Key')
            
            if not api_key:
                logger.warning("[AUTH] No API key found in headers (fallback check)")
                return False
            
            logger.info(f"[AUTH] API key found in headers (length: {len(api_key)})")
            
            expected_key = os.getenv('QUOTATION_API_KEY')
            
            if not expected_key:
                logger.error("[AUTH] QUOTATION_API_KEY not set in environment variables")
                logger.error("[AUTH] Check serverless.yml environment configuration")
                return False
            
            logger.info(f"[AUTH] Expected API key configured (length: {len(expected_key)})")
            
            is_match = api_key == expected_key
            if not is_match:
                logger.warning("[AUTH] API key mismatch - keys have different lengths or values")
            
            return is_match
        except Exception as e:
            logger.error(f"[AUTH] Unexpected error during authentication: {str(e)}", exc_info=True)
            return False


# Keep backward compatibility
def verify_api_key(event: Dict[str, Any]) -> bool:
    """
    Legacy function name - now calls verify_auth which supports both Cognito and API keys.
    """
    return verify_auth(event)


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

