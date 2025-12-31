import json
import os
import sys
import uuid
import time
from datetime import datetime

import boto3

# Add shared directory to path for imports
CURRENT_DIR = os.path.dirname(__file__)
SERVICE_ROOT = os.path.abspath(os.path.join(CURRENT_DIR, ".."))
SHARED_DIR = os.path.abspath(os.path.join(SERVICE_ROOT, "..", "shared"))
if SHARED_DIR not in sys.path:
    sys.path.append(SHARED_DIR)

from utils.corsHeaders import get_cors_headers
from utils.file_details import normalize_file_name, normalize_catalog_serial_number

# Configure AWS clients for local development
# When running serverless offline, we need to use AWS profile or credentials
dynamodb_endpoint = os.getenv('DYNAMODB_ENDPOINT')
# Check both environment variable and os.environ (serverless-offline may use os.environ)
aws_profile = os.getenv('AWS_PROFILE') or os.environ.get('AWS_PROFILE') or os.getenv('AWS_DEFAULT_PROFILE') or os.environ.get('AWS_DEFAULT_PROFILE')
region = os.getenv('AWS_REGION') or os.environ.get('AWS_REGION') or os.getenv('AWS_DEFAULT_REGION') or os.environ.get('AWS_DEFAULT_REGION', 'us-east-1')

# Check if we're in real AWS Lambda (not serverless-offline)
# Serverless-offline may set LAMBDA_TASK_ROOT, but we can detect real Lambda by checking
# if we're in /var/task (real Lambda) vs local filesystem
is_real_lambda = os.path.exists('/var/task') and os.getenv('LAMBDA_TASK_ROOT')

# Debug logging
print(f"[get_presigned_url] AWS Config - endpoint: {dynamodb_endpoint or 'None'}, profile: {aws_profile or 'None'}, region: {region}, is_real_lambda: {is_real_lambda}, LAMBDA_TASK_ROOT: {os.getenv('LAMBDA_TASK_ROOT') or 'None'}")

# Create AWS session and clients with consistent credentials
if dynamodb_endpoint:
    # Use DynamoDB Local
    print(f"[get_presigned_url] Using DynamoDB Local endpoint: {dynamodb_endpoint}")
    dynamodb = boto3.resource('dynamodb', endpoint_url=dynamodb_endpoint)
    s3 = boto3.client("s3", region_name=region)
elif aws_profile and not is_real_lambda:
    # Use AWS profile (for local development, including serverless-offline)
    print(f"[get_presigned_url] Using AWS profile: {aws_profile} in region: {region}")
    try:
        session = boto3.Session(profile_name=aws_profile, region_name=region)
        dynamodb = session.resource('dynamodb')
        s3 = session.client('s3')
    except Exception as e:
        print(f"[get_presigned_url] WARNING: Failed to use profile {aws_profile}: {e}, falling back to default credentials")
        dynamodb = boto3.resource('dynamodb', region_name=region)
        s3 = boto3.client("s3", region_name=region)
else:
    # Use default AWS credentials (IAM role in Lambda, or env vars/credentials file locally)
    print(f"[get_presigned_url] Using default AWS credentials in region: {region} (Real Lambda: {is_real_lambda}, Profile: {aws_profile or 'None'})")
    dynamodb = boto3.resource('dynamodb', region_name=region)
    s3 = boto3.client("s3", region_name=region)
BUCKET = "hb-files-raw"
# BUCKET = os.environ["UPLOAD_BUCKET"]
FILES_TABLE = os.environ.get("FILES_TABLE", "hb-files")
print(f"[get_presigned_url] FILES_TABLE: {FILES_TABLE}")


def get_presigned_url(event, context):
    print(f"[get_presigned_url] Starting request processing")
    
    # Handle OPTIONS preflight request
    http_method = event.get("requestContext", {}).get("http", {}).get("method", "")
    print(f"[get_presigned_url] HTTP method: {http_method}")
    
    if http_method == "OPTIONS" or event.get("httpMethod") == "OPTIONS":
        print(f"[get_presigned_url] Handling OPTIONS preflight request")
        return {
            "statusCode": 200,
            "body": "",
            "headers": get_cors_headers(),
        }
    
    # Verify API key authentication
    from utils.auth import verify_request_auth
    is_authorized, error_response = verify_request_auth(event)
    if not is_authorized:
        print(f"[get_presigned_url] Authentication failed")
        return error_response
    
    # API Gateway HTTP API sends body as a JSON string
    body = json.loads(event.get("body") or "{}")
    print(f"[get_presigned_url] Parsed request body: {json.dumps(body, default=str)}")

    uploaded_file_name = body.get("fileName")  # Actual file name from upload
    content_type = body.get("contentType") or "application/octet-stream"
    business_file_type = body.get("BusinessFileType") or ""  # optional extra hint
    
    # Extract form data (optional - may not be present for all requests)
    form_data = body.get("formData") or {}
    print(f"[get_presigned_url] File details - name: {uploaded_file_name}, contentType: {content_type}, businessFileType: {business_file_type}")

    if not uploaded_file_name:
        print(f"[get_presigned_url] ERROR: fileName is required but not provided")
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "fileName is required"}),
            "headers": get_cors_headers(),
        }
    
    # Validate and sanitize filename to prevent path traversal
    try:
        from shared.input_validation import sanitize_filename, validate_file_type
        is_valid, sanitized_filename, error_msg = sanitize_filename(uploaded_file_name)
        if not is_valid:
            print(f"[get_presigned_url] ERROR: Invalid filename: {error_msg}")
            return {
                "statusCode": 400,
                "body": json.dumps({"error": error_msg or "Invalid filename"}),
                "headers": get_cors_headers(),
            }
        uploaded_file_name = sanitized_filename
        
        # Validate file extension
        if "." in uploaded_file_name:
            ext = uploaded_file_name.rsplit(".", 1)[-1].lower()
            is_valid_ext, ext_error = validate_file_type(ext)
            if not is_valid_ext:
                print(f"[get_presigned_url] ERROR: Invalid file type: {ext_error}")
                return {
                    "statusCode": 400,
                    "body": json.dumps({"error": ext_error or "Invalid file type"}),
                    "headers": get_cors_headers(),
                }
    except ImportError:
        # Fallback if shared module not available
        print(f"[get_presigned_url] WARNING: Shared input validation not available, using basic validation")
        # Basic path traversal check
        if '..' in uploaded_file_name or '/' in uploaded_file_name or '\\' in uploaded_file_name:
            return {
                "statusCode": 400,
                "body": json.dumps({"error": "Invalid filename"}),
                "headers": get_cors_headers(),
            }

    # Generate fileId and S3 key
    file_id = str(uuid.uuid4())
    print(f"[get_presigned_url] Generated fileId: {file_id}")
    
    # Get extension from the file name
    if "." in uploaded_file_name:
        ext = uploaded_file_name.rsplit(".", 1)[-1].lower()
    else:
        ext = ""

    # S3 key is just the filename in uploads folder
    normalized_file_name = normalize_file_name(uploaded_file_name)
    key = f"uploads/{normalized_file_name}"
    print(f"[get_presigned_url] S3 key: {key}, file extension: {ext or 'None'}")

    catalog_serial_number_raw = form_data.get("catalogSerialNumber")
    normalized_catalog_serial_number = normalize_catalog_serial_number(catalog_serial_number_raw) if catalog_serial_number_raw else None

    # Generate presigned URL first (fail fast if S3 is unavailable)
    # Add fileId as metadata in S3 object for correlation
    # S3 metadata values must be strings, so convert None to empty string
    print(f"[get_presigned_url] Generating presigned URL for bucket: {BUCKET}, key: {key}")
    
    # Helper function to ensure metadata values are strings (S3 requirement)
    def to_metadata_string(value):
        return str(value) if value is not None else ""
    
    try:
        upload_url = s3.generate_presigned_url(
            ClientMethod="put_object",
            Params={
                "Bucket": BUCKET,
                "Key": key,
                "ContentType": content_type,
                "Metadata": {
                    "file_id": file_id,  # Store fileId in S3 object metadata
                    "original_filename": uploaded_file_name,
                    "normalized_filename": normalized_file_name,
                    "business_file_type": to_metadata_string(business_file_type),
                    "file_type": to_metadata_string(ext.upper()),
                    "product_category": to_metadata_string(form_data.get("productCategory")),
                    "ordering_number": to_metadata_string(form_data.get("orderingNumber")),
                    "year": to_metadata_string(form_data.get("year")),
                    "catalog_serial_number": to_metadata_string(normalized_catalog_serial_number)
                }
            },
            ExpiresIn=3600,  # URL valid for 1 hour
        )
        print(f"[get_presigned_url] Generated presigned URL successfully")
    except Exception as e:
        print(f"[get_presigned_url] ERROR: Failed to generate presigned URL: {e}")
        return {
            "statusCode": 500,
            "body": json.dumps({"error": "Failed to generate upload URL"}),
            "headers": get_cors_headers(),
        }

    # Build DynamoDB item with form data as top-level fields
    item = {
        "fileId": file_id,
        "uploadedFileName": normalized_file_name,  # Actual S3 file name
        "fileType": ext.upper(),  # PDF / XLSX / etc
        "bucket": BUCKET,
        "key": key,
        "status": "pending_upload",
        "createdAt": int(time.time() * 1000),
        "createdAtIso": datetime.utcnow().isoformat() + "Z",
        "displayName": form_data.get("fileName"),
        "businessFileType": form_data.get("fileType"),
        "year": form_data.get("year"),
        "orderingNumber": form_data.get("orderingNumber"),
        "manufacturer": form_data.get("manufacturer"),
        "SwagelokLink": form_data.get("SwagelokLink"),
        "notes": form_data.get("notes"),
        "description": form_data.get("description"),
        "onlineLink": form_data.get("onlineLink"),
        "productCategory": form_data.get("productCategory"),
        "catalogSerialNumber": normalized_catalog_serial_number,
    }
    print(f"[get_presigned_url] Built DynamoDB item with {len(item)} fields")

    # Save initial record in Files table only after presigned URL is successfully generated
    table = dynamodb.Table(FILES_TABLE)
    try:
        print(f"[get_presigned_url] Saving record to DynamoDB table: {FILES_TABLE}")
        table.put_item(Item=item)
        print(f"[get_presigned_url] Saved file record: fileId={file_id}, uploadedFileName={normalized_file_name}, displayName={item.get('displayName', 'N/A')}")
    except Exception as e:
        print(f"[get_presigned_url] ERROR: Failed to save to DynamoDB: {e}")
        return {
            "statusCode": 500,
            "body": json.dumps({"error": "Failed to create file record"}),
            "headers": get_cors_headers(),
        }

    response_body = {
        "fileId": file_id,
        "uploadUrl": upload_url,
        "fileKey": key,
    }

    print(f"[get_presigned_url] Request completed successfully for fileId: {file_id}")
    return {
        "statusCode": 200,
        "body": json.dumps(response_body),
        "headers": get_cors_headers(),
    }