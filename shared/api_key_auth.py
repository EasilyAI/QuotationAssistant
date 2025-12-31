"""
Shared API key authentication utility for all services.

Supports:
- API key validation from headers
- Optional IP whitelisting
- AWS Secrets Manager integration (with fallback to environment variables)
"""

import os
import json
import logging
import boto3
from typing import Dict, Any, Optional, List
from functools import lru_cache

logger = logging.getLogger(__name__)
logger.setLevel(os.getenv('LOG_LEVEL', 'INFO'))

# Cache for secrets (to avoid fetching on every invocation)
_secrets_cache = {}


def get_secret_from_secrets_manager(secret_name: str) -> Optional[str]:
    """
    Retrieve secret from AWS Secrets Manager with caching.
    
    Args:
        secret_name: Name of the secret in Secrets Manager
        
    Returns:
        Secret value or None if not found
    """
    # Check cache first
    if secret_name in _secrets_cache:
        return _secrets_cache[secret_name]
    
    try:
        # Try to get from Secrets Manager
        secrets_client = boto3.client('secretsmanager', region_name=os.getenv('AWS_REGION', 'us-east-1'))
        response = secrets_client.get_secret_value(SecretId=secret_name)
        secret_value = response['SecretString']
        
        # Cache it
        _secrets_cache[secret_name] = secret_value
        return secret_value
    except Exception as e:
        # Only log warning if not a ResourceNotFoundException (expected in local dev)
        if 'ResourceNotFoundException' not in str(e):
            logger.warning(f"Could not retrieve secret {secret_name} from Secrets Manager: {e}")
        # In local development, this is expected - will fall back to environment variables
        return None


def get_api_key(service_name: str) -> Optional[str]:
    """
    Get API key for a service, checking Secrets Manager first, then environment variables.
    
    Args:
        service_name: Name of the service (e.g., 'file-ingestion', 'product-search', 'quotation')
        
    Returns:
        API key or None if not found
    """
    # Try Secrets Manager first
    secret_name = f"{service_name}-api-key"
    secret = get_secret_from_secrets_manager(secret_name)
    if secret:
        # If secret is JSON, parse it
        try:
            secret_dict = json.loads(secret)
            # Support both single key and multiple keys format
            if isinstance(secret_dict, dict) and 'api_key' in secret_dict:
                return secret_dict['api_key']
            elif isinstance(secret_dict, list) and len(secret_dict) > 0:
                # Multiple keys - return first one (or implement key rotation logic)
                return secret_dict[0] if isinstance(secret_dict[0], str) else secret_dict[0].get('key')
        except json.JSONDecodeError:
            # Not JSON, use as-is
            return secret
    
    # Fallback to environment variable
    env_var_name = f"{service_name.upper().replace('-', '_')}_API_KEY"
    api_key = os.getenv(env_var_name)
    
    if not api_key:
        # Try common variations
        env_var_name = f"{service_name}_API_KEY".upper()
        api_key = os.getenv(env_var_name)
    
    if api_key:
        logger.debug(f"Using API key from environment variable: {env_var_name}")
    else:
        logger.warning(f"API key not found in Secrets Manager or environment variables for service: {service_name}")
    
    return api_key


def get_ip_whitelist() -> Optional[List[str]]:
    """
    Get IP whitelist from environment variable.
    
    Returns:
        List of allowed IP addresses/CIDR blocks or None if not configured
    """
    whitelist_str = os.getenv('IP_WHITELIST')
    if not whitelist_str:
        return None
    
    # Support comma-separated or space-separated
    whitelist = [ip.strip() for ip in whitelist_str.replace(',', ' ').split() if ip.strip()]
    return whitelist if whitelist else None


def is_ip_allowed(client_ip: str, whitelist: Optional[List[str]]) -> bool:
    """
    Check if client IP is in whitelist.
    
    Args:
        client_ip: Client IP address
        whitelist: List of allowed IPs/CIDR blocks
        
    Returns:
        True if allowed or whitelist not configured, False otherwise
    """
    if not whitelist:
        return True  # No whitelist = allow all
    
    # Simple IP matching (for exact matches and basic CIDR)
    for allowed_ip in whitelist:
        if '/' in allowed_ip:
            # CIDR notation - basic check (for production, use ipaddress library)
            # For now, simple prefix match
            prefix = allowed_ip.split('/')[0]
            if client_ip.startswith(prefix.rsplit('.', 1)[0] + '.'):
                return True
        elif client_ip == allowed_ip:
            return True
    
    return False


def verify_api_key(
    event: Dict[str, Any],
    service_name: str,
    require_ip_whitelist: bool = False
) -> tuple[bool, Optional[str]]:
    """
    Verify API key from request headers.
    
    Args:
        event: API Gateway event
        service_name: Name of the service
        require_ip_whitelist: If True, also check IP whitelist
        
    Returns:
        Tuple of (is_valid, error_message)
    """
    headers = event.get('headers', {}) or {}
    
    # Handle case-insensitive headers
    api_key = (
        headers.get('x-api-key') or 
        headers.get('X-Api-Key') or 
        headers.get('X-API-Key') or
        headers.get('x-api-key', '').lower()  # Try lowercase key
    )
    
    if not api_key:
        return False, "Missing API key in X-Api-Key header"
    
    # Get expected API key
    expected_key = get_api_key(service_name)
    
    if not expected_key:
        logger.warning(f"API key not configured for service {service_name}")
        return False, "API key not configured"
    
    # Compare API keys (use constant-time comparison to prevent timing attacks)
    if not constant_time_compare(api_key, expected_key):
        logger.warning(f"Invalid API key attempt from {event.get('requestContext', {}).get('http', {}).get('sourceIp', 'unknown')}")
        return False, "Invalid API key"
    
    # Check IP whitelist if required
    if require_ip_whitelist:
        client_ip = (
            event.get('requestContext', {}).get('http', {}).get('sourceIp') or
            event.get('requestContext', {}).get('identity', {}).get('sourceIp') or
            event.get('requestContext', {}).get('identity', {}).get('sourceIpAddress') or
            'unknown'
        )
        
        whitelist = get_ip_whitelist()
        if not is_ip_allowed(client_ip, whitelist):
            logger.warning(f"IP {client_ip} not in whitelist")
            return False, "IP address not allowed"
    
    return True, None


def constant_time_compare(a: str, b: str) -> bool:
    """
    Constant-time string comparison to prevent timing attacks.
    
    Args:
        a: First string
        b: Second string
        
    Returns:
        True if strings are equal, False otherwise
    """
    if len(a) != len(b):
        return False
    
    result = 0
    for x, y in zip(a.encode(), b.encode()):
        result |= x ^ y
    
    return result == 0


def create_unauthorized_response(message: str = "Unauthorized") -> Dict[str, Any]:
    """
    Create standardized unauthorized response.
    
    Args:
        message: Error message
        
    Returns:
        API Gateway response
    """
    return {
        'statusCode': 401,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
        },
        'body': json.dumps({
            'error': 'Unauthorized',
            'message': message
        })
    }

