"""
Email draft generation service.
"""

import os
import logging
from typing import Dict, Any, List, Optional
import boto3

from services.quotation_service import get_quotation

logger = logging.getLogger(__name__)
logger.setLevel(os.getenv('LOG_LEVEL', 'INFO'))

s3_client = boto3.client('s3')
FILES_BUCKET = os.getenv('FILES_BUCKET', 'hb-files-raw')


def generate_presigned_url_for_drawing(s3_key: str, expiry: int = 3600) -> Optional[str]:
    """
    Generate presigned URL for sketch drawing S3 object.
    
    Args:
        s3_key: S3 key for the drawing
        expiry: URL expiry time in seconds (default 1 hour)
    
    Returns:
        Presigned URL or None on error
    """
    try:
        url = s3_client.generate_presigned_url(
            'get_object',
            Params={'Bucket': FILES_BUCKET, 'Key': s3_key},
            ExpiresIn=expiry
        )
        return url
    except Exception as e:
        logger.error(f"Error generating presigned URL for drawing {s3_key}: {str(e)}")
        return None


def extract_filename_from_s3_key(s3_key: str) -> str:
    """
    Extract filename from S3 key.
    
    Args:
        s3_key: S3 key
    
    Returns:
        Filename
    """
    return s3_key.split('/')[-1] if '/' in s3_key else s3_key


def generate_email_draft(quotation_id: str, customer_email: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """
    Generate email draft payload with attachments (sales drawings only).
    
    Args:
        quotation_id: Quotation ID
        customer_email: Optional customer email address
    
    Returns:
        Email draft payload with subject, body, to, cc, and attachments
    """
    quotation = get_quotation(quotation_id)
    if not quotation:
        return None
    
    # Collect all sketch drawings from line items
    attachments = []
    lines = quotation.get('lines', [])
    
    for line in lines:
        drawing_link = line.get('drawing_link')
        if drawing_link and drawing_link.strip():
            # drawing_link is an S3 key
            s3_key = drawing_link.strip()
            
            # Generate presigned URL
            presigned_url = generate_presigned_url_for_drawing(s3_key)
            
            if presigned_url:
                filename = extract_filename_from_s3_key(s3_key)
                attachments.append({
                    'filename': filename,
                    's3_key': s3_key,
                    'presigned_url': presigned_url
                })
    
    # Generate email subject
    quotation_name = quotation.get('name', 'Quotation')
    quotation_number = quotation.get('quotation_id', '')[:8]  # Short ID
    subject = f"Quotation {quotation_number} - {quotation_name}"
    
    # Generate email body
    customer = quotation.get('customer', {})
    customer_name = customer.get('name', 'Customer')
    currency = quotation.get('currency', 'ILS')
    totals = quotation.get('totals', {})
    total = totals.get('total', 0.0)
    
    body_lines = [
        f"Dear {customer_name},",
        "",
        f"Please find below the quotation details for your review:",
        "",
        f"Quotation Number: {quotation_number}",
        f"Quotation Name: {quotation_name}",
        f"Total Items: {len(lines)}",
        f"Grand Total: {currency} {total:.2f}",
        "",
        "Items:"
    ]
    
    # Add line items
    for idx, line in enumerate(lines, start=1):
        product_name = line.get('product_name', '')
        quantity = line.get('quantity', 1)
        final_price = line.get('final_price', 0.0)
        line_total = final_price * quantity
        notes = line.get('notes', '')
        
        body_lines.append(f"\n{idx}. {product_name}")
        body_lines.append(f"   - Quantity: {quantity}")
        body_lines.append(f"   - Unit Price: {currency} {final_price:.2f}")
        body_lines.append(f"   - Subtotal: {currency} {line_total:.2f}")
        
        if notes:
            body_lines.append(f"   - Notes: {notes}")
        
        if line.get('drawing_link'):
            body_lines.append(f"   - Drawing: Attached")
    
    body_lines.extend([
        "",
        f"Grand Total: {currency} {total:.2f}",
        "",
        "Please review and let us know if you have any questions.",
        "",
        "Best regards,",
        "Your Sales Team"
    ])
    
    body = "\n".join(body_lines)
    
    # Build email draft payload
    email_draft = {
        'subject': subject,
        'body': body,
        'attachments': attachments
    }
    
    # Add email addresses if provided
    if customer_email:
        email_draft['to'] = customer_email
    
    customer_email_from_data = customer.get('email')
    if customer_email_from_data and not customer_email:
        email_draft['to'] = customer_email_from_data
    
    # CC can be added later if needed
    if customer.get('cc'):
        email_draft['cc'] = customer.get('cc')
    
    return email_draft

