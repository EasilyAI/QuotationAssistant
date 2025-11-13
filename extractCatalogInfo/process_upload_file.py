import json
import os
import uuid
import time

import boto3

s3 = boto3.client("s3")
dynamodb = boto3.resource("dynamodb")

BUCKET = "hb-files-raw"
# BUCKET = os.environ["UPLOAD_BUCKET"]
FILES_TABLE = os.environ["FILES_TABLE"]

# CORS headers helper
def get_cors_headers():
    return {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",  # TODO: Replace with specific origin in production (e.g., "http://localhost:3000")
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
        "Access-Control-Max-Age": "3600",
    }

def get_presigned_url(event, context):
    # Handle OPTIONS preflight request
    # For API Gateway HTTP API v2, check the method in requestContext
    json.dumps(event)
    http_method = event.get("requestContext", {}).get("http", {}).get("method", "")
    if http_method == "OPTIONS" or event.get("httpMethod") == "OPTIONS":
        return {
            "statusCode": 200,
            "body": "",
            "headers": get_cors_headers(),
        }
    
    # API Gateway HTTP API sends body as a JSON string
    body = json.loads(event.get("body") or "{}")

    file_name = body.get("fileName")
    content_type = body.get("contentType") or "application/octet-stream"
    file_type = body.get("fileType") or ""  # optional extra hint

    if not file_name:
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "fileName is required"}),
            "headers": get_cors_headers(),
        }

    # Generate fileId and S3 key
    file_id = str(uuid.uuid4())
    
    # Get extension from the file name, but DO NOT append it again to the key
    if "." in file_name:
        ext = file_name.rsplit(".", 1)[-1].lower()
    else:
        ext = "bin"

    # The file_name already contains extension; use as-is for S3 key
    key = f"uploads/{file_name}"

    # Save initial record in Files table
    table = dynamodb.Table(FILES_TABLE)
    table.put_item(
        Item={
            "fileId": file_id,
            "fileName": file_name,
            "fileType": ext.upper(),  # PDF / XLSX / etc
            "bucket": BUCKET,
            "key": key,
            "status": "PENDING_UPLOAD",
            "createdAt": int(time.time()),
        }
    )

    # Generate presigned URL for PUT upload
    upload_url = s3.generate_presigned_url(
        ClientMethod="put_object",
        Params={
            "Bucket": BUCKET,
            "Key": key,
            "ContentType": content_type,
        },
        ExpiresIn=3600,  # URL valid for 1 hour
    )

    response_body = {
        "fileId": file_id,
        "uploadUrl": upload_url,
        "fileKey": key,
    }

    return {
        "statusCode": 200,
        "body": json.dumps(response_body),
        "headers": get_cors_headers(),
    }


def get_file_info(event, context):
    # Handle OPTIONS preflight request
    http_method = event.get("requestContext", {}).get("http", {}).get("method", "")
    if http_method == "OPTIONS" or event.get("httpMethod") == "OPTIONS":
        return {
            "statusCode": 200,
            "body": "",
            "headers": get_cors_headers(),
        }
    
    # Extract fileId from path parameters
    # For HTTP API v2, path parameters are in event["pathParameters"]
    path_params = event.get("pathParameters") or {}
    file_id = path_params.get("fileId")
    
    if not file_id:
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "fileId is required"}),
            "headers": get_cors_headers(),
        }
    
    # Get file information from DynamoDB
    table = dynamodb.Table(FILES_TABLE)
    try:
        response = table.get_item(Key={"fileId": file_id})
        
        if "Item" not in response:
            return {
                "statusCode": 404,
                "body": json.dumps({"error": "File not found"}),
                "headers": get_cors_headers(),
            }
        
        file_info = response["Item"]
        
        return {
            "statusCode": 200,
            "body": json.dumps(file_info),
            "headers": get_cors_headers(),
        }
    except Exception as e:
        print(f"Error getting file info: {e}")
        return {
            "statusCode": 500,
            "body": json.dumps({"error": "Failed to get file information"}),
            "headers": get_cors_headers(),
        }


def process_uploaded_file(event, context):
    print(json.dumps(event))
    return {
        "statusCode": 200,
        "body": json.dumps({
            "message": "Hello from HB Lambda via Serverless!",
            "project": os.getenv("PROJECT_NAME"),
            "input": event,
        }),
    }