"""
Authentication utilities for file-ingestion-service.
"""

import json
import logging
from typing import Dict, Any

logger = logging.getLogger(__name__)

try:
    from shared.api_key_auth import verify_api_key, create_unauthorized_response
    SHARED_AUTH_AVAILABLE = True
except ImportError:
    SHARED_AUTH_AVAILABLE = False
    logger.warning("Shared auth module not available, authentication will be skipped")


def verify_request_auth(event: Dict[str, Any]) -> tuple[bool, Dict[str, Any] | None]:
    """
    Verify API key authentication for a request.
    
    Args:
        event: API Gateway event
        
    Returns:
        Tuple of (is_authorized, error_response)
        If authorized, error_response is None
        If not authorized, error_response is the HTTP response to return
    """
    if not SHARED_AUTH_AVAILABLE:
        # In development, allow without auth if module not available
        logger.warning("Shared auth not available, allowing request")
        return True, None
    
    is_valid, error_msg = verify_api_key(event, 'file-ingestion', require_ip_whitelist=False)
    
    if not is_valid:
        from utils.corsHeaders import get_cors_headers
        return False, {
            "statusCode": 401,
            "body": json.dumps({
                "error": "Unauthorized",
                "message": error_msg or "Invalid or missing API key"
            }),
            "headers": get_cors_headers(),
        }
    
    return True, None

