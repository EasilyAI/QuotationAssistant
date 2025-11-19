# CORS headers helper
def get_cors_headers():
    return {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",  # TODO: Replace with specific origin in production (e.g., "http://localhost:3000")
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
        "Access-Control-Max-Age": "3600",
    }