# CORS headers helper
def get_cors_headers():
    """
    Get CORS headers with security headers.
    
    Note: Access-Control-Allow-Origin is set to "*" for development.
    In production, this should be restricted to specific origins.
    """
    return {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "http://localhost:3000, http://localhost:3001, https://catalog-searcher-omers-projects-e3a112ba.vercel.app",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With, X-Api-Key",
        "Access-Control-Max-Age": "3600",
        # Security headers
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "X-XSS-Protection": "1; mode=block",
        "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
        "Referrer-Policy": "strict-origin-when-cross-origin",
    }