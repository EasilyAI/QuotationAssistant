"""
Email draft endpoint handler.
"""

import os
import logging
from typing import Dict, Any

from api.utils import get_path_parameter, get_request_body, create_response
from services.email_service import generate_email_draft, send_email_with_attachments

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


def handle_send_email(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    Handle POST /quotations/{quotationId}/send-email - Send email with attachments.
    
    Request body (optional):
    - customer_email: Override customer email address
    - sender_email: Override sender email address
    - sender_name: Override sender name
    """
    try:
        quotation_id = get_path_parameter(event, 'quotationId')
        
        if not quotation_id:
            return create_response(400, {'error': 'Missing quotationId'})
        
        body = get_request_body(event)
        customer_email = body.get('customer_email')
        sender_email = body.get('sender_email')
        sender_name = body.get('sender_name')
        
        # Send email with attachments
        result = send_email_with_attachments(
            quotation_id=quotation_id,
            customer_email='hbaws1925@gmail.com',
            sender_email='hbaws1925@gmail.com',
            sender_name=sender_name
        )
        
        if not result.get('success'):
            error_message = result.get('error', 'Failed to send email')
            status_code = 400 if 'not found' in error_message.lower() else 500
            return create_response(status_code, {'error': error_message})
        
        return create_response(200, {
            'message': result.get('message', 'Email sent successfully'),
            'email_id': result.get('email_id')
        })
        
    except Exception as e:
        logger.error(f"Error sending email: {str(e)}", exc_info=True)
        return create_response(500, {'error': 'Internal server error', 'message': 'Failed to send email'})

