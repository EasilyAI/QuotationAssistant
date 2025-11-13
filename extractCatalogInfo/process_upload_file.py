import json
import os
import uuid
import time

import boto3

from utils.incomingEventParser import parse_s3_key

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
    
    s3_key = parse_s3_key(event)
    print(f"S3 key: {s3_key}")
    
    
    return {
        "statusCode": 200,
        "body": json.dumps({
            "message": "Hello from HB Lambda via Serverless!",
            "project": os.getenv("PROJECT_NAME"),
            "input": event,
        }),
    }