"""
Email draft generation service.
"""

import os
import logging
from typing import Dict, Any, List, Optional
import boto3
import sys

# Add shared directory to path
SERVICE_ROOT = os.path.dirname(os.path.dirname(__file__))
REPO_ROOT = os.path.abspath(os.path.join(SERVICE_ROOT, ".."))
SHARED_DIR = os.path.abspath(os.path.join(REPO_ROOT, "shared"))

for path in {SERVICE_ROOT, REPO_ROOT, SHARED_DIR}:
    if path not in sys.path:
        sys.path.append(path)

try:
    from shared.product_service import fetch_product
except ImportError:
    logger = logging.getLogger(__name__)
    logger.warning("Could not import shared.product_service - sales drawings from products will not be available")
    fetch_product = None

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
    
    # Collect all sales drawings from line items and products
    attachments = []
    lines = quotation.get('lines', [])
    processed_s3_keys = set()  # Track processed keys to avoid duplicates
    
    for line in lines:
        # First, check for drawing_link from line item (legacy support)
        drawing_link = line.get('drawing_link')
        if drawing_link and drawing_link.strip():
            s3_key = drawing_link.strip()
            if s3_key not in processed_s3_keys:
                presigned_url = generate_presigned_url_for_drawing(s3_key)
                if presigned_url:
                    filename = extract_filename_from_s3_key(s3_key)
                    attachments.append({
                        'filename': filename,
                        's3_key': s3_key,
                        'presigned_url': presigned_url
                    })
                    processed_s3_keys.add(s3_key)
        
        # Then, fetch sales drawings from product (if ordering_number exists)
        ordering_number = line.get('ordering_number', '').strip()
        if ordering_number and fetch_product:
            try:
                product = fetch_product(ordering_number)
                sales_drawings = product.get('salesDrawings', [])
                
                for sales_drawing in sales_drawings:
                    file_key = sales_drawing.get('fileKey')
                    if file_key and file_key not in processed_s3_keys:
                        presigned_url = generate_presigned_url_for_drawing(file_key)
                        if presigned_url:
                            filename = sales_drawing.get('fileName') or extract_filename_from_s3_key(file_key)
                            attachments.append({
                                'filename': filename,
                                's3_key': file_key,
                                'presigned_url': presigned_url
                            })
                            processed_s3_keys.add(file_key)
            except Exception as e:
                logger.warning(f"Failed to fetch product {ordering_number} for sales drawings: {str(e)}")
                # Continue processing other lines even if one fails
    
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
    
    # Convert to float to handle Decimal types from DynamoDB
    total_float = float(total) if total is not None else 0.0
    
    body_lines = [
        f"Dear {customer_name},",
        "",
        f"Please find below the quotation details for your review:",
        "",
        f"Quotation Number: {quotation_number}",
        f"Quotation Name: {quotation_name}",
        f"Total Items: {len(lines)}",
        f"Grand Total: {currency} {total_float:.2f}",
        "",
        "Items:"
    ]
    
    # Add line items
    for idx, line in enumerate(lines, start=1):
        product_name = line.get('product_name', '')
        quantity = line.get('quantity', 1)
        final_price = line.get('final_price', 0.0)
        
        # Convert to float to handle Decimal types from DynamoDB
        quantity_float = float(quantity) if quantity is not None else 1.0
        final_price_float = float(final_price) if final_price is not None else 0.0
        line_total = final_price_float * quantity_float
        
        notes = line.get('notes', '')
        
        body_lines.append(f"\n{idx}. {product_name}")
        # Format quantity as integer if whole number, otherwise as decimal
        quantity_str = f"{int(quantity_float)}" if quantity_float == int(quantity_float) else f"{quantity_float}"
        body_lines.append(f"   - Quantity: {quantity_str}")
        body_lines.append(f"   - Unit Price: {currency} {final_price_float:.2f}")
        body_lines.append(f"   - Subtotal: {currency} {line_total:.2f}")
        
        if notes:
            body_lines.append(f"   - Notes: {notes}")
        
        # Check if this line has sales drawings attached
        has_drawing = False
        if line.get('drawing_link'):
            has_drawing = True
        elif ordering_number and fetch_product:
            try:
                product = fetch_product(ordering_number)
                sales_drawings = product.get('salesDrawings', [])
                if sales_drawings:
                    has_drawing = True
            except Exception:
                pass  # Ignore errors when checking for drawings
        
        if has_drawing:
            body_lines.append(f"   - Sales Drawing: Attached")
    
    body_lines.extend([
        "",
        f"Grand Total: {currency} {total_float:.2f}",
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

