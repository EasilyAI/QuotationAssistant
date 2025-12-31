"""
Email draft endpoint handler.
"""

import os
import logging
from typing import Dict, Any

from api.utils import get_path_parameter, get_request_body, create_response
from services.email_service import generate_email_draft

logger = logging.getLogger(__name__)
logger.setLevel(os.getenv('LOG_LEVEL', 'INFO'))


def handle_email_draft(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    Handle POST /quotations/{quotationId}/email-draft - Generate email draft.
    
    Request body (optional):
    - customer_email: Override customer email address
    """
    try:
        quotation_id = get_path_parameter(event, 'quotationId')
        
        if not quotation_id:
            return create_response(400, {'error': 'Missing quotationId'})
        
        body = get_request_body(event)
        customer_email = body.get('customer_email')
        
        # Generate email draft
        email_draft = generate_email_draft(quotation_id, customer_email)
        
        if not email_draft:
            return create_response(404, {'error': 'Quotation not found'})
        
        return create_response(200, email_draft)
        
    except Exception as e:
        logger.error(f"Error generating email draft: {str(e)}", exc_info=True)
        return create_response(500, {'error': 'Internal server error', 'message': 'Failed to generate email draft'})

