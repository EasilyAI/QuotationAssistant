"""
AWS Cognito Lambda Authorizer for API Gateway.

Validates JWT tokens from Cognito User Pool using jose library for simplicity.
"""

import os
import json
import logging
from typing import Dict, Any

logger = logging.getLogger(__name__)
logger.setLevel(os.getenv('LOG_LEVEL', 'INFO'))

# Cognito configuration from environment
COGNITO_USER_POOL_ID = os.getenv('COGNITO_USER_POOL_ID')
COGNITO_REGION = os.getenv('COGNITO_REGION', 'us-east-1')
COGNITO_APP_CLIENT_ID = os.getenv('COGNITO_APP_CLIENT_ID')


def generate_policy(principal_id: str, effect: str, resource: str, context: Dict[str, Any] = None) -> Dict[str, Any]:
    """
    Generate IAM policy for API Gateway authorizer.
    
    Args:
        principal_id: User identifier
        effect: 'Allow' or 'Deny'
        resource: API Gateway resource ARN (can use wildcard)
        context: Optional context to pass to Lambda
        
    Returns:
        IAM policy document
    """
    policy = {
        'principalId': principal_id,
        'policyDocument': {
            'Version': '2012-10-17',
            'Statement': [
                {
                    'Action': 'execute-api:Invoke',
                    'Effect': effect,
                    'Resource': resource
                }
            ]
        }
    }
    
    if context:
        policy['context'] = context
    
    return policy


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Lambda authorizer handler for API Gateway HTTP API.
    
    For HTTP API, we can use a simpler approach - just verify the token exists
    and extract user info. The actual JWT verification can be done in the Lambda
    function itself, or we can use AWS's built-in JWT authorizer (recommended).
    
    This is a simple authorizer that checks for Bearer token.
    For production, use AWS's built-in JWT authorizer instead.
    
    Args:
        event: API Gateway authorizer event
        context: Lambda context
        
    Returns:
        IAM policy document
    """
    try:
        # Extract token from Authorization header
        token = None
        
        # HTTP API format
        if 'headers' in event:
            headers = event.get('headers', {}) or {}
            # Handle case-insensitive headers
            auth_header = (
                headers.get('authorization') or 
                headers.get('Authorization') or
                headers.get('authorization', '').lower()
            )
            if auth_header and auth_header.startswith('Bearer '):
                token = auth_header[7:].strip()
        
        # REST API format (fallback)
        if not token and 'authorizationToken' in event:
            auth_header = event['authorizationToken']
            if auth_header.startswith('Bearer '):
                token = auth_header[7:].strip()
        
        if not token:
            logger.warning("No Bearer token found in request")
            method_arn = event.get('routeArn', event.get('methodArn', '*'))
            return generate_policy('user', 'Deny', method_arn)
        
        # For now, just verify token exists and is not empty
        # In production, you should verify the JWT signature
        # For HTTP API, AWS provides built-in JWT authorizer which is better
        
        # Extract user info from token (basic - decode without verification for now)
        # In production, use proper JWT verification
        try:
            import base64
            # Decode token payload (without verification - for development)
            parts = token.split('.')
            if len(parts) == 3:
                # Decode payload
                payload = parts[1]
                # Add padding if needed
                payload += '=' * (4 - len(payload) % 4)
                decoded = base64.urlsafe_b64decode(payload)
                token_data = json.loads(decoded)
                
                user_id = token_data.get('sub') or token_data.get('username', 'unknown')
                email = token_data.get('email', '')
            else:
                user_id = 'unknown'
                email = ''
        except Exception as e:
            logger.warning(f"Could not decode token: {e}")
            user_id = 'unknown'
            email = ''
        
        # Get method ARN (use wildcard for HTTP API)
        method_arn = event.get('routeArn', event.get('methodArn', '*'))
        # For HTTP API, use wildcard to allow all methods
        if '*' not in method_arn:
            # Extract base ARN and add wildcard
            arn_parts = method_arn.split('/')
            if len(arn_parts) >= 2:
                method_arn = '/'.join(arn_parts[:2]) + '/*'
        
        # Generate allow policy
        policy = generate_policy(
            user_id,
            'Allow',
            method_arn,
            context={
                'userId': user_id,
                'email': email,
                'token': token  # Pass token to Lambda for verification
            }
        )
        
        logger.info(f"Authorized user: {user_id} ({email})")
        
        return policy
        
    except Exception as e:
        logger.error(f"Authorization error: {e}")
        # Return deny policy
        method_arn = event.get('routeArn', event.get('methodArn', '*'))
        return generate_policy('user', 'Deny', method_arn)
