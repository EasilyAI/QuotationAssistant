"""
Email draft generation service.
"""

import os
import logging
from typing import Dict, Any, List, Optional
import boto3
import sys
import base64
from io import BytesIO

# Configure logger first
logger = logging.getLogger(__name__)
logger.setLevel(os.getenv('LOG_LEVEL', 'INFO'))

# Add shared directory to path
SERVICE_ROOT = os.path.dirname(os.path.dirname(__file__))
REPO_ROOT = os.path.abspath(os.path.join(SERVICE_ROOT, ".."))
SHARED_DIR = os.path.abspath(os.path.join(REPO_ROOT, "shared"))

for path in {SERVICE_ROOT, REPO_ROOT, SHARED_DIR}:
    if path not in sys.path:
        sys.path.append(path)

# AWS SES client for sending emails
ses_client = None
# Get region from Lambda environment (AWS_REGION is set automatically in Lambda)
# Fall back to AWS_DEFAULT_REGION or default to us-east-1
SES_REGION = os.getenv('AWS_REGION') or os.getenv('AWS_DEFAULT_REGION') or 'us-east-1'
SES_SENDER_EMAIL = os.getenv('SES_SENDER_EMAIL', 'hbaws1925@gmail.com')

# Check if we're in real AWS Lambda (not serverless-offline)
# Serverless-offline may set LAMBDA_TASK_ROOT, but we can detect real Lambda by checking
# if we're in /var/task (real Lambda) vs local filesystem
is_real_lambda = os.path.exists('/var/task') and os.getenv('LAMBDA_TASK_ROOT')

# Get AWS profile for local development (serverless-offline)
# In real Lambda, we use IAM roles, not AWS profiles
if is_real_lambda:
    aws_profile = None
else:
    # Check for AWS profile from environment or serverless.yml
    aws_profile = os.getenv('AWS_PROFILE') or os.environ.get('AWS_PROFILE') or os.getenv('AWS_DEFAULT_PROFILE') or os.environ.get('AWS_DEFAULT_PROFILE') or 'hb-client'

try:
    # Create SES client with profile if running locally
    if aws_profile and not is_real_lambda:
        session = boto3.Session(profile_name=aws_profile, region_name=SES_REGION)
        ses_client = session.client('ses')
    else:
        # Use default credentials (IAM role in Lambda)
        ses_client = boto3.client('ses', region_name=SES_REGION)
    
    # Log SES client initialization (without sensitive account info)
    logger.info(f"AWS SES client initialized - Region: {SES_REGION}")
except Exception as e:
    logger.warning(f"Could not initialize AWS SES client: {str(e)}")

# Try to import shared product service
try:
    from shared.product_service import fetch_product
except ImportError:
    logger.warning("Could not import shared.product_service - sales drawings from products will not be available")
    fetch_product = None

from services.quotation_service import get_quotation

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
    # Track which lines have drawings so we don't need to re-fetch products later
    line_has_drawing_map = {}

    for idx, line in enumerate(lines, start=1):
        has_drawing = False
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
                    has_drawing = True
        
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
                            has_drawing = True
            except Exception as e:
                logger.warning(f"Failed to fetch product {ordering_number} for sales drawings: {str(e)}")
                # Continue processing other lines even if one fails

        if has_drawing:
            line_has_drawing_map[idx] = True
    
    # Generate email subject (without quotation ID)
    quotation_name = quotation.get('name', 'Quotation')
    subject = quotation_name
    
    # Generate email body
    customer = quotation.get('customer', {})
    customer_name = customer.get('name', 'Customer')
    
    # Opening phrase about sales drawings
    body_lines = [
        f"Dear {customer_name},",
        "",
        f"This email contains sales drawings for your requested products.",
        "",
        f"Total Items: {len(lines)}",
        ""
    ]
    
    # Separate items into:
    # 1) items with drawings and ordering numbers
    # 2) items with ordering numbers but no drawings
    # 3) missing products with no ordering number
    # Track original row numbers (1-indexed position in quotation)
    items_with_attachments: List[Dict[str, Any]] = []
    items_without_attachments: List[Dict[str, Any]] = []
    missing_products: List[Dict[str, Any]] = []
    
    for idx, line in enumerate(lines, start=1):
        ordering_number = line.get('ordering_number', '').strip()
        quantity = line.get('quantity', 1)
        
        # Convert to float to handle Decimal types from DynamoDB
        quantity_float = float(quantity) if quantity is not None else 1.0
        # Format quantity as integer if whole number, otherwise as decimal
        quantity_str = f"{int(quantity_float)}" if quantity_float == int(quantity_float) else f"{quantity_float}"
        
        has_attachment = line_has_drawing_map.get(idx, False)
        has_ordering = bool(ordering_number)

        if has_ordering and has_attachment:
            items_with_attachments.append({
                'ordering_number': ordering_number,
                'quantity': quantity_str,
                'row_number': idx,  # Preserve original row number
            })
        elif has_ordering and not has_attachment:
            items_without_attachments.append({
                'ordering_number': ordering_number,
                'quantity': quantity_str,
                'row_number': idx,  # Preserve original row number
            })
        else:
            # Missing product (no ordering number) – use product name or original request as label
            label = (
                line.get('original_request')
                or line.get('product_name')
                or 'Missing product'
            )
            missing_products.append({
                'label': label,
                'quantity': quantity_str,
                'row_number': idx,  # Preserve original row number
            })
    
    # Add items with attachments - show original row numbers
    if items_with_attachments:
        body_lines.append("Items with attachments:")
        for item in items_with_attachments:
            body_lines.append(f"Row #{item['row_number']}: {item['ordering_number']} (Quantity: {item['quantity']})")
        body_lines.append("")
    
    # Add items without attachments - show original row numbers
    if items_without_attachments:
        body_lines.append("Items missing attachments:")
        for item in items_without_attachments:
            body_lines.append(f"Row #{item['row_number']}: {item['ordering_number']} (Quantity: {item['quantity']})")
        body_lines.append("")

    # Add missing products (no ordering number) - show original row numbers
    if missing_products:
        body_lines.append("Items with no ordering number chosen:")
        for item in missing_products:
            # For items without ordering number, show label or just row number
            if item['label'] and item['label'] != 'Missing product':
                body_lines.append(f"Row #{item['row_number']}: {item['label']} (Quantity: {item['quantity']})")
            else:
                body_lines.append(f"Row #{item['row_number']}: (Quantity: {item['quantity']})")
        body_lines.append("")
    
    body_lines.extend([
        "Best regards,"
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


def download_file_from_s3(s3_key: str) -> Optional[bytes]:
    """
    Download file from S3.
    
    Args:
        s3_key: S3 key for the file
    
    Returns:
        File content as bytes or None on error
    """
    try:
        response = s3_client.get_object(Bucket=FILES_BUCKET, Key=s3_key)
        return response['Body'].read()
    except Exception as e:
        logger.error(f"Error downloading file {s3_key} from S3: {str(e)}")
        return None


def send_email_with_attachments(
    quotation_id: str,
    customer_email: Optional[str] = None,
    sender_email: Optional[str] = None,
    sender_name: Optional[str] = None
) -> Dict[str, Any]:
    """
    Send email with attachments via AWS SES.
    
    Args:
        quotation_id: Quotation ID
        customer_email: Optional customer email address (overrides quotation customer email)
        sender_email: Optional sender email address (defaults to SES_SENDER_EMAIL)
        sender_name: Optional sender name
    
    Returns:
        Dict with 'success' boolean and 'message' or 'error' string
    """
    if not ses_client:
        return {'success': False, 'error': 'AWS SES client not available'}
    
    try:
        # Generate email draft
        email_draft = generate_email_draft(quotation_id, customer_email)
        if not email_draft:
            return {'success': False, 'error': 'Quotation not found'}
        
        # Validate recipient email
        recipient_email = email_draft.get('to')
        if not recipient_email:
            return {'success': False, 'error': 'No recipient email address found'}
        
        # Log email sending attempt (without sensitive account info)
        logger.info(f"Sending email - From: {SES_SENDER_EMAIL}, To: {recipient_email}, Subject: {email_draft.get('subject', 'N/A')}")
        
        # Determine sender email (must be plain email for SES Source field)
        if sender_email:
            email_from = sender_email
        else:
            email_from = SES_SENDER_EMAIL
        
        # Format sender with name for MIME headers (only used in raw email)
        # Note: SES Source field must be plain email, display name goes in MIME From header
        if sender_name:
            email_from_formatted = f'{sender_name} <{email_from}>'
        else:
            email_from_formatted = email_from
        
        # Download and prepare attachments for SES
        email_attachments = []
        attachments = email_draft.get('attachments', [])
        
        for attachment in attachments:
            s3_key = attachment.get('s3_key')
            filename = attachment.get('filename', 'attachment')
            
            if not s3_key:
                logger.warning(f"Skipping attachment {filename} - no S3 key")
                continue
            
            # Download file from S3
            file_content = download_file_from_s3(s3_key)
            if not file_content:
                logger.warning(f"Failed to download {s3_key} for attachment {filename}")
                continue
            
            # Determine content type from filename extension
            content_type = 'application/octet-stream'  # Default
            filename_lower = filename.lower()
            if filename_lower.endswith('.pdf'):
                content_type = 'application/pdf'
            elif filename_lower.endswith(('.png', '.jpg', '.jpeg', '.gif')):
                content_type = f'image/{filename_lower.split(".")[-1]}'
            elif filename_lower.endswith('.dwg'):
                content_type = 'application/acad'
            elif filename_lower.endswith('.dxf'):
                content_type = 'application/dxf'
            
            # SES expects attachments with data (bytes) and content type
            email_attachments.append({
                'filename': filename,
                'data': file_content,
                'content_type': content_type
            })
        
        # Convert plain text body to HTML with proper formatting
        body_text = email_draft.get('body', '')
        # Convert newlines to <br> and preserve formatting
        body_html = body_text.replace('\n', '<br>')
        # Wrap in a simple HTML structure for better email client compatibility
        body_html = f'<div style="font-family: Arial, sans-serif; line-height: 1.6;">{body_html}</div>'
        
        # Prepare recipients
        destination = {
            'ToAddresses': [recipient_email]
        }
        
        # Add CC if present
        if email_draft.get('cc'):
            cc_list = [email_draft['cc']] if isinstance(email_draft['cc'], str) else email_draft['cc']
            destination['CcAddresses'] = cc_list
        
        # Build SES message
        message = {
            'Subject': {
                'Data': email_draft.get('subject', 'Quotation'),
                'Charset': 'UTF-8'
            },
            'Body': {
                'Text': {
                    'Data': body_text,
                    'Charset': 'UTF-8'
                },
                'Html': {
                    'Data': body_html,
                    'Charset': 'UTF-8'
                }
            }
        }
        
        # If we have attachments OR a sender name, we need to use send_raw_email
        # (SES Source field doesn't support display names, but MIME From header does)
        if email_attachments or sender_name:
            # Build raw email message with attachments using email.mime
            from email.mime.multipart import MIMEMultipart
            from email.mime.text import MIMEText
            from email.mime.base import MIMEBase
            from email import encoders
            
            msg = MIMEMultipart('mixed')
            msg['From'] = email_from_formatted
            msg['To'] = recipient_email
            msg['Subject'] = email_draft.get('subject', 'Quotation')
            
            if email_draft.get('cc'):
                cc_list = [email_draft['cc']] if isinstance(email_draft['cc'], str) else email_draft['cc']
                msg['Cc'] = ', '.join(cc_list)
            
            # Add text and HTML parts
            msg_alternative = MIMEMultipart('alternative')
            msg_alternative.attach(MIMEText(body_text, 'plain', 'utf-8'))
            msg_alternative.attach(MIMEText(body_html, 'html', 'utf-8'))
            msg.attach(msg_alternative)
            
            # Add attachments
            for attachment in email_attachments:
                content_type = attachment.get('content_type', 'application/octet-stream')
                # Parse content type (e.g., "application/pdf" -> ("application", "pdf"))
                main_type, sub_type = content_type.split('/', 1) if '/' in content_type else ('application', 'octet-stream')
                
                part = MIMEBase(main_type, sub_type)
                part.set_payload(attachment['data'])
                encoders.encode_base64(part)
                part.add_header(
                    'Content-Disposition',
                    f'attachment; filename= {attachment["filename"]}'
                )
                msg.attach(part)
            
            # Send raw email via SES
            raw_message = msg.as_string()
            result = ses_client.send_raw_email(
                Source=email_from,
                Destinations=[recipient_email] + (destination.get('CcAddresses', [])),
                RawMessage={'Data': raw_message.encode('utf-8')}
            )
        else:
            # Send simple email without attachments
            # SES Source field must be plain email address (not "Name <email>")
            result = ses_client.send_email(
                Source=email_from,  # Plain email only - SES requirement
                Destination=destination,
                Message=message
            )
        
        # SES returns a MessageId on success
        if result and 'MessageId' in result:
            message_id = result['MessageId']
            logger.info(f"Email sent successfully via AWS SES. MessageId: {message_id}, To: {recipient_email}")
            return {
                'success': True,
                'message': f'Email sent successfully to {recipient_email}. MessageId: {message_id}',
                'email_id': message_id,
                'recipient': recipient_email
            }
        
        logger.error(f"Failed to send email via SES: {result}")
        return {'success': False, 'error': 'Failed to send email - no message ID returned'}
            
    except Exception as e:
        error_msg = str(e)
        logger.error(f"Error sending email: {error_msg}", exc_info=True)
        
        # Provide helpful error message for common SES issues
        if 'MessageRejected' in error_msg and 'not verified' in error_msg:
            return {
                'success': False,
                'error': f'Email address not verified in AWS SES. Please verify {email_from} in AWS SES console for region {SES_REGION}. Error: {error_msg}'
            }
        elif 'MessageRejected' in error_msg:
            return {
                'success': False,
                'error': f'Email rejected by AWS SES. Please check SES configuration. Error: {error_msg}'
            }
        
        return {'success': False, 'error': f'Failed to send email: {error_msg}'}

