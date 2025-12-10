import json
import os
import uuid
import time
from datetime import datetime

import boto3

from utils.corsHeaders import get_cors_headers
from utils.file_details import normalize_file_name, normalize_catalog_serial_number

s3 = boto3.client("s3")
dynamodb = boto3.resource("dynamodb")

BUCKET = "hb-files-raw"
# BUCKET = os.environ["UPLOAD_BUCKET"]
FILES_TABLE = os.environ.get("FILES_TABLE", "hb-files")


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