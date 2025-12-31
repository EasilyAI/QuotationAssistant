"""
Shared error handling utilities for secure error responses.
"""

import logging
import traceback
import re
import json
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)


def sanitize_error_message(error: Exception, include_details: bool = False) -> str:
    """
    Sanitize error message to prevent information disclosure.
    
    Args:
        error: Exception object
        include_details: If True, include more details (for internal logging only)
        
    Returns:
        Sanitized error message
    """
    error_type = type(error).__name__
    error_msg = str(error)
    
    # Log full error details server-side
    logger.error(f"Error: {error_type}: {error_msg}", exc_info=True)
    
    # Remove sensitive information from user-facing messages
    # Remove file paths
    error_msg = re.sub(r'/[^\s]+', '[path]', error_msg)
    error_msg = re.sub(r'[A-Z]:\\[^\s]+', '[path]', error_msg)
    
    # Remove AWS resource ARNs
    error_msg = re.sub(r'arn:aws:[^\s]+', '[aws-resource]', error_msg)
    
    # Remove stack traces
    if 'Traceback' in error_msg or 'File "' in error_msg:
        error_msg = "An internal error occurred"
    
    # Generic messages for common errors
    if 'AccessDenied' in error_type or 'Permission' in error_type:
        return "Access denied"
    elif 'NotFound' in error_type or 'DoesNotExist' in error_type:
        return "Resource not found"
    elif 'ValidationError' in error_type or 'ValueError' in error_type:
        return error_msg if include_details else "Invalid input"
    elif 'Timeout' in error_type:
        return "Request timed out"
    else:
        return "An error occurred processing your request"


def create_error_response(
    status_code: int,
    error_type: str,
    message: str,
    details: Optional[Dict[str, Any]] = None,
    log_error: Optional[Exception] = None
) -> Dict[str, Any]:
    """
    Create standardized error response without information disclosure.
    
    Args:
        status_code: HTTP status code
        error_type: Error type/category
        message: User-friendly error message
        details: Optional additional details (non-sensitive)
        log_error: Optional exception to log
        
    Returns:
        API Gateway response
    """
    if log_error:
        sanitize_error_message(log_error, include_details=True)
    
    error_body = {
        'error': error_type,
        'message': message
    }
    
    if details:
        error_body['details'] = details
    
    return {
        'statusCode': status_code,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
        },
        'body': json.dumps(error_body)
    }


def handle_exception(e: Exception, context: str = "request") -> Dict[str, Any]:
    """
    Handle exception and return safe error response.
    
    Args:
        e: Exception to handle
        context: Context where error occurred
        
    Returns:
        API Gateway error response
    """
    error_type = type(e).__name__
    sanitized_msg = sanitize_error_message(e)
    
    # Determine status code based on error type
    if 'ValidationError' in error_type or 'ValueError' in error_type:
        status_code = 400
    elif 'NotFound' in error_type or 'DoesNotExist' in error_type:
        status_code = 404
    elif 'AccessDenied' in error_type or 'Permission' in error_type:
        status_code = 403
    elif 'Timeout' in error_type:
        status_code = 504
    else:
        status_code = 500
    
    return create_error_response(
        status_code=status_code,
        error_type=error_type,
        message=sanitized_msg,
        log_error=e
    )

