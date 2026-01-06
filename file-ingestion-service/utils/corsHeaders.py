# CORS headers helper
import os

def get_cors_headers(event=None):
    """
    Get CORS headers with security headers.
    
    Note: Access-Control-Allow-Origin must be a single origin, not multiple.
    This function extracts the origin from the request event and validates it
    against the allowed origins list.
    
    Args:
        event: Optional Lambda event object to extract the origin from request headers
    
    Returns:
        dict: CORS headers with appropriate Access-Control-Allow-Origin
    """
    # Allowed origins list
    allowed_origins = [
        "http://localhost:3000",
        "http://localhost:3001",
    ]
    
    # Get production URL from environment variable, with fallback
    production_url = os.getenv(
        'PRODUCTION_FRONTEND_URL',
        'https://main.d1xymtccqgi62h.amplifyapp.com'
    )
    if production_url:
        allowed_origins.append(production_url)
    
    # Extract origin from request if event is provided
    origin = None
    if event:
        # Try to get origin from headers (API Gateway HTTP API format)
        headers = event.get("headers", {}) or event.get("requestContext", {}).get("http", {}).get("headers", {})
        origin = headers.get("origin") or headers.get("Origin")
    
    # Validate origin against allowed list
    if origin and origin in allowed_origins:
        allow_origin = origin
    else:
        # If no origin or invalid origin, use production URL as default
        # In production, API Gateway should handle CORS, but this is a fallback
        allow_origin = production_url if production_url else "*"
    
    return {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": allow_origin,
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With, X-Api-Key, X-Amz-Date, X-Amz-Security-Token",
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Max-Age": "3600",
        # Security headers
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "X-XSS-Protection": "1; mode=block",
        "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
        "Referrer-Policy": "strict-origin-when-cross-origin",
    }