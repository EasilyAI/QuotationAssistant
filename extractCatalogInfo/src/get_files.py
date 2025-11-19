import json
import os
import uuid
import time
from datetime import datetime

import boto3

from utils.corsHeaders import get_cors_headers
from utils.helpers import convert_decimals_to_native, convert_floats_to_decimal

dynamodb = boto3.resource("dynamodb")
s3 = boto3.client("s3")

FILES_TABLE = os.environ.get("FILES_TABLE", "hb-files")
CATALOG_PRODUCTS_TABLE = os.environ.get("CATALOG_PRODUCTS_TABLE", "hb-catalog-products")
UPLOAD_BUCKET = os.environ.get("UPLOAD_BUCKET", "hb-files-raw")


def get_files(event, context):
    """
    Get all files from DynamoDB.
    Returns:
        dict: All files from DynamoDB
    """
    print(f"[get_files] Starting request processing")
    table = dynamodb.Table(FILES_TABLE)
    
    response = table.scan()
    files = response.get("Items", [])

    print(f"[get_files] Retrieved {len(files)} files, first file: {files[0] if files else 'None'}")
    
    # Convert Decimal types to JSON-serializable native numbers
    files = [convert_decimals_to_native(file) for file in files]
    
    return {
        "statusCode": 200,
        "body": json.dumps(files),
        "headers": get_cors_headers(),
    }
def get_file_info(event, context):
    """
    Get file processing information from DynamoDB.
    Args:
        file_id: File ID to retrieve
    Returns:
        dict: File information from DynamoDB
    Returns status, processing stage, and metadata about the file processing.
    """
    # Handle OPTIONS preflight request
    http_method = event.get("requestContext", {}).get("http", {}).get("method", "")
    if http_method == "OPTIONS" or event.get("httpMethod") == "OPTIONS":
        return {
            "statusCode": 200,
            "body": "",
            "headers": get_cors_headers(),
        }


def get_file_download_url(event, context):
    """
    Generate a temporary presigned URL for a provided S3 key.
    """
    print(f"[get_file_download_url] Starting request processing")
    
    http_method = event.get("requestContext", {}).get("http", {}).get("method", "")
    if http_method == "OPTIONS" or event.get("httpMethod") == "OPTIONS":
        print(f"[get_file_download_url] Handling OPTIONS preflight request")
        return {
            "statusCode": 200,
            "body": "",
            "headers": get_cors_headers(),
        }

    try:
        body = json.loads(event.get("body") or "{}")
        print(f"[get_file_download_url] Parsed request body: {json.dumps(body, default=str)}")
    except json.JSONDecodeError:
        print(f"[get_file_download_url] WARNING: Failed to parse request body, using empty dict")
        body = {}

    key = body.get("key")
    bucket = body.get("bucket") or UPLOAD_BUCKET
    print(f"[get_file_download_url] Request parameters - key: {key}, bucket: {bucket}")

    if not key:
        print(f"[get_file_download_url] ERROR: S3 key is required but not provided")
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "S3 key is required"}),
            "headers": get_cors_headers(),
        }

    # Normalize key (strip leading slash)
    normalized_key = key.lstrip("/")
    print(f"[get_file_download_url] Normalized key: {normalized_key}")

    try:
        print(f"[get_file_download_url] Generating presigned URL for {bucket}/{normalized_key}")
        url = s3.generate_presigned_url(
            ClientMethod="get_object",
            Params={"Bucket": bucket, "Key": normalized_key},
            ExpiresIn=300,
        )
        print(f"[get_file_download_url] Successfully generated presigned URL")
    except Exception as error:
        print(f"[get_file_download_url] ERROR generating URL for {bucket}/{normalized_key}: {error}")
        return {
            "statusCode": 500,
            "body": json.dumps({"error": "Failed to generate download URL"}),
            "headers": get_cors_headers(),
        }

    return {
        "statusCode": 200,
        "body": json.dumps({"url": url}),
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
        
        # Convert Decimal types to int/float for JSON serialization
        file_info = json.loads(json.dumps(file_info, default=str))
        
        return {
            "statusCode": 200,
            "body": json.dumps(file_info),
            "headers": get_cors_headers(),
        }
    except Exception as e:
        print(f"[get_file_info] ERROR: Failed to get file info: {e}")
        return {
            "statusCode": 500,
            "body": json.dumps({"error": "Failed to get file information"}),
            "headers": get_cors_headers(),
        }



def get_catalog_products(event, context):
    """
    Get all products for a file from the temporary products table.
    Returns the products document containing all products for the given fileId.
    """
    print(f"[get_catalog_products] Starting request")
    
    # Handle OPTIONS preflight request
    http_method = event.get("requestContext", {}).get("http", {}).get("method", "")
    if http_method == "OPTIONS" or event.get("httpMethod") == "OPTIONS":
        print(f"[get_catalog_products] Handling OPTIONS preflight request")
        return {
            "statusCode": 200,
            "body": "",
            "headers": get_cors_headers(),
        }
    
    # Extract fileId from path parameters
    path_params = event.get("pathParameters") or {}
    file_id = path_params.get("fileId")
    print(f"[get_catalog_products] Extracted fileId: {file_id}")
    
    if not file_id:
        print(f"[get_catalog_products] ERROR: fileId is required but not provided")
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "fileId is required"}),
            "headers": get_cors_headers(),
        }
    
    # Get products document from temp table (single document with fileId as key)
    table = dynamodb.Table(CATALOG_PRODUCTS_TABLE)
    try:
        print(f"[get_catalog_products] Querying table {CATALOG_PRODUCTS_TABLE} for fileId: {file_id}")
        # Get the single document by fileId
        response = table.get_item(
            Key={"fileId": file_id}
        )
        
        if "Item" not in response:
            print(f"[get_catalog_products] No products found for file {file_id}")
            return {
                "statusCode": 404,
                "body": json.dumps({
                    "error": "No products found for this file",
                    "fileId": file_id,
                    "products": [],
                    "count": 0
                }),
                "headers": get_cors_headers(),
            }
        
        document = response["Item"]
        print(f"[get_catalog_products] Retrieved document for fileId: {file_id}")
        
        # Convert entire document (including Decimal types) to JSON-serializable format
        document_json = json.loads(json.dumps(document, default=str))
        
        products = document_json.get("products", [])
        
        print(f"[get_catalog_products] Found {len(products)} products for file {file_id}")
        
        return {
            "statusCode": 200,
            "body": json.dumps({
                "fileId": file_id,
                "products": products,
                "count": len(products),
                "sourceFile": document_json.get("sourceFile", ""),
                "createdAt": document_json.get("createdAt", 0)
            }),
            "headers": get_cors_headers(),
        }
    except Exception as e:
        print(f"[get_catalog_products] ERROR: Failed to get products: {e}")
        return {
            "statusCode": 500,
            "body": json.dumps({"error": "Failed to get products"}),
            "headers": get_cors_headers(),
        }


def update_catalog_products(event, context):
    """
    Replace catalog products for a file after review.
    """
    print(f"[update_catalog_products] Starting request")

    http_method = event.get("requestContext", {}).get("http", {}).get("method", "")
    if http_method == "OPTIONS" or event.get("httpMethod") == "OPTIONS":
        print(f"[update_catalog_products] Handling OPTIONS preflight request")
        return {
            "statusCode": 200,
            "body": "",
            "headers": get_cors_headers(),
        }

    path_params = event.get("pathParameters") or {}
    file_id = path_params.get("fileId")
    print(f"[update_catalog_products] Extracted fileId: {file_id}")

    if not file_id:
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "fileId is required"}),
            "headers": get_cors_headers(),
        }

    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        print("[update_catalog_products] ERROR: Invalid JSON body")
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "Invalid JSON body"}),
            "headers": get_cors_headers(),
        }

    products = body.get("products")
    if not isinstance(products, list):
        print("[update_catalog_products] ERROR: `products` payload missing or invalid")
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "`products` array is required"}),
            "headers": get_cors_headers(),
        }

    products_count = len(products)
    timestamp = int(time.time() * 1000)
    # Generate ISO timestamp
    iso_timestamp = datetime.utcnow().isoformat() + 'Z'
    
    # Count reviewed products (status === 'reviewed')
    reviewed_count = sum(1 for product in products if product.get("status") == "reviewed")
    print(f"[update_catalog_products] Saving {products_count} products for file {file_id}, {reviewed_count} reviewed")

    table = dynamodb.Table(CATALOG_PRODUCTS_TABLE)
    files_table = dynamodb.Table(FILES_TABLE)
    try:
        sanitized_products = convert_floats_to_decimal(products)
        response = table.update_item(
            Key={"fileId": file_id},
            UpdateExpression="SET #products = :products, #productsCount = :count, #updatedAt = :updatedAt",
            ExpressionAttributeNames={
                "#products": "products",
                "#productsCount": "productsCount",
                "#updatedAt": "updatedAt",
            },
            ExpressionAttributeValues={
                ":products": sanitized_products,
                ":count": products_count,
                ":updatedAt": timestamp,
            },
            ConditionExpression="attribute_exists(fileId)",
            ReturnValues="ALL_NEW",
        )

        updated_item = response.get("Attributes", {})
        updated_item_native = convert_decimals_to_native(updated_item)
        print(f"[update_catalog_products] Successfully updated products for file {file_id}")

        # Also update the FILES_TABLE with reviewedProductsCount and updatedAtIso
        try:
            files_table.update_item(
                Key={"fileId": file_id},
                UpdateExpression="SET #reviewedProductsCount = :reviewedCount, #updatedAt = :updatedAt, #updatedAtIso = :updatedAtIso",
                ExpressionAttributeNames={
                    "#reviewedProductsCount": "reviewedProductsCount",
                    "#updatedAt": "updatedAt",
                    "#updatedAtIso": "updatedAtIso",
                },
                ExpressionAttributeValues={
                    ":reviewedCount": reviewed_count,
                    ":updatedAt": timestamp,
                    ":updatedAtIso": iso_timestamp,
                },
            )
            print(f"[update_catalog_products] Successfully updated FILES_TABLE for file {file_id}")
        except Exception as files_error:
            # Log error but don't fail the whole operation
            print(f"[update_catalog_products] WARNING: Failed to update FILES_TABLE: {files_error}")

        return {
            "statusCode": 200,
            "body": json.dumps(
                {
                    "fileId": file_id,
                    "products": updated_item_native.get("products", []),
                    "count": updated_item_native.get("productsCount", products_count),
                    "updatedAt": updated_item_native.get("updatedAt", timestamp),
                    "reviewedProductsCount": reviewed_count,
                }
            ),
            "headers": get_cors_headers(),
        }
    except table.meta.client.exceptions.ConditionalCheckFailedException:
        print(f"[update_catalog_products] ERROR: fileId {file_id} not found")
        return {
            "statusCode": 404,
            "body": json.dumps({"error": "File not found"}),
            "headers": get_cors_headers(),
        }
    except Exception as error:
        print(f"[update_catalog_products] ERROR: Failed to update products: {error}")
        return {
            "statusCode": 500,
            "body": json.dumps({"error": "Failed to update products"}),
            "headers": get_cors_headers(),
        }


def check_file_exists(event, context):
    """
    Check if a file already exists based on duplicate prevention rules.
    
    Duplicate Rules:
    1. If businessFileType + displayName + year already exists -> duplicate
    2. For Catalog: can't have another file with the same catalogSerialNumber
    3. For SalesDrawing: can't have another file with the same orderingNumber
    4. For PriceList: can only be one file per year
    
    Request body should contain:
    - fileType: Business file type (Catalog, Sales Drawing, Price List)
    - fileName: Display name from form
    - year: Year of the file
    - catalogSerialNumber: (for Catalog files)
    - orderingNumber: (for SalesDrawing files)
    """
    # Handle OPTIONS preflight request
    http_method = event.get("requestContext", {}).get("http", {}).get("method", "")
    if http_method == "OPTIONS" or event.get("httpMethod") == "OPTIONS":
        return {
            "statusCode": 200,
            "body": "",
            "headers": get_cors_headers(),
        }
    
    # Parse request body
    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "Invalid JSON in request body"}),
            "headers": get_cors_headers(),
        }
    
    business_file_type = body.get("fileType")  # Catalog, Sales Drawing, Price List
    display_name = body.get("fileName")  # User-chosen display name
    year = body.get("year")
    catalog_serial_number = body.get("catalogSerialNumber")
    ordering_number = body.get("orderingNumber")
    
    # Validate required fields
    if not business_file_type:
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "fileType is required"}),
            "headers": get_cors_headers(),
        }
    
    if not display_name:
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "fileName is required"}),
            "headers": get_cors_headers(),
        }
    
    # Validate type-specific required fields
    if business_file_type == "Catalog" and not catalog_serial_number:
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "catalogSerialNumber is required for Catalog files"}),
            "headers": get_cors_headers(),
        }
    
    if business_file_type == "Sales Drawing" and not ordering_number:
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "orderingNumber is required for Sales Drawing files"}),
            "headers": get_cors_headers(),
        }
    
    if business_file_type == "Price List" and not year:
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "year is required for Price List files"}),
            "headers": get_cors_headers(),
        }
    
    # Scan FILES_TABLE for matching files
    table = dynamodb.Table(FILES_TABLE)
    try:
        response = table.scan()
        files = response.get("Items", [])
        
        # Convert Decimal types to strings for comparison
        files_json = json.loads(json.dumps(files, default=str))
        
        # Normalize input values for comparison
        display_name_normalized = display_name.lower().strip()
        year_str = str(year).strip() if year else None
        
        # Check each file against duplicate rules
        for file_item in files_json:
            item_business_type = file_item.get("businessFileType", "")
            item_display_name = file_item.get("displayName", "")
            item_year = str(file_item.get("year", "")).strip() if file_item.get("year") else None
            
            # Skip if business file type doesn't match
            if item_business_type != business_file_type:
                continue
            
            # Rule 1: Check if businessFileType + displayName + year already exists
            item_display_name_normalized = item_display_name.lower().strip() if item_display_name else ""
            name_match = display_name_normalized == item_display_name_normalized
            year_match = year_str and item_year and year_str == item_year
            
            if name_match and year_match:
                print(f"[check_file_exists] Rule 1 violation: Found duplicate - type={business_file_type}, name={display_name}, year={year}")
                return {
                    "statusCode": 200,
                    "body": json.dumps({
                        "exists": True,
                        "file": _build_file_details(file_item),
                        "reason": "A file with the same type, name, and year already exists"
                    }),
                    "headers": get_cors_headers(),
                }
            
            # Rule 2: For Catalog - check catalogSerialNumber
            if business_file_type == "Catalog" and catalog_serial_number:
                item_serial = file_item.get("catalogSerialNumber", "")
                if item_serial and item_serial.lower().strip() == catalog_serial_number.lower().strip():
                    print(f"[check_file_exists] Rule 2 violation: Found duplicate Catalog with serial number={catalog_serial_number}")
                    return {
                        "statusCode": 200,
                        "body": json.dumps({
                            "exists": True,
                            "file": _build_file_details(file_item),
                            "reason": "A Catalog file with the same serial number already exists"
                        }),
                        "headers": get_cors_headers(),
                    }
            
            # Rule 3: For SalesDrawing - check orderingNumber
            elif business_file_type == "Sales Drawing" and ordering_number:
                item_ordering = file_item.get("orderingNumber", "")
                if item_ordering and item_ordering.lower().strip() == ordering_number.lower().strip():
                    print(f"[check_file_exists] Rule 3 violation: Found duplicate Sales Drawing with ordering number={ordering_number}")
                    return {
                        "statusCode": 200,
                        "body": json.dumps({
                            "exists": True,
                            "file": _build_file_details(file_item),
                            "reason": "A Sales Drawing file with the same ordering number already exists"
                        }),
                        "headers": get_cors_headers(),
                    }
            
            # Rule 4: For PriceList - only one file per year
            elif business_file_type == "Price List" and year_str:
                if item_year and year_str == item_year:
                    print(f"[check_file_exists] Rule 4 violation: Found duplicate Price List for year={year}")
                    return {
                        "statusCode": 200,
                        "body": json.dumps({
                            "exists": True,
                            "file": _build_file_details(file_item),
                            "reason": "A Price List file for this year already exists"
                        }),
                        "headers": get_cors_headers(),
                    }
        
        # No duplicate found
        print(f"[check_file_exists] No duplicate found for {business_file_type}: {display_name}")
        return {
            "statusCode": 200,
            "body": json.dumps({"exists": False}),
            "headers": get_cors_headers(),
        }
        
    except Exception as e:
        print(f"[check_file_exists] ERROR: Failed to check file existence: {e}")
        import traceback
        traceback.print_exc()
        return {
            "statusCode": 500,
            "body": json.dumps({"error": "Failed to check file existence"}),
            "headers": get_cors_headers(),
        }


def delete_file(event, context):
    """
    Delete a file and all associated data.
    Deletes:
    1. File from S3 bucket
    2. Textract results from S3 bucket (if exists)
    3. File record from FILES_TABLE
    4. Products from CATALOG_PRODUCTS_TABLE
    
    Only allows deletion of files that are not completed.
    """
    print(f"[delete_file] Starting request")
    
    # Handle OPTIONS preflight request
    http_method = event.get("requestContext", {}).get("http", {}).get("method", "")
    if http_method == "OPTIONS" or event.get("httpMethod") == "OPTIONS":
        print(f"[delete_file] Handling OPTIONS preflight request")
        return {
            "statusCode": 200,
            "body": "",
            "headers": get_cors_headers(),
        }
    
    # Extract fileId from path parameters
    path_params = event.get("pathParameters") or {}
    file_id = path_params.get("fileId")
    print(f"[delete_file] Extracted fileId: {file_id}")
    
    if not file_id:
        print(f"[delete_file] ERROR: fileId is required but not provided")
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "fileId is required"}),
            "headers": get_cors_headers(),
        }
    
    # Get file information from DynamoDB first
    files_table = dynamodb.Table(FILES_TABLE)
    try:
        response = files_table.get_item(Key={"fileId": file_id})
        
        if "Item" not in response:
            print(f"[delete_file] ERROR: File {file_id} not found")
            return {
                "statusCode": 404,
                "body": json.dumps({"error": "File not found"}),
                "headers": get_cors_headers(),
            }
        
        file_info = response["Item"]
        file_status = file_info.get("status", "")
        
        # Check if file is completed - prevent deletion
        if file_status == "completed":
            print(f"[delete_file] ERROR: Cannot delete completed file {file_id}")
            return {
                "statusCode": 400,
                "body": json.dumps({"error": "Cannot delete completed files"}),
                "headers": get_cors_headers(),
            }
        
        # Get S3 keys
        s3_key = file_info.get("key") or file_info.get("s3Key")
        textract_results_key = file_info.get("textractResultsKey")
        bucket = file_info.get("bucket") or UPLOAD_BUCKET
        
        print(f"[delete_file] File info - status: {file_status}, s3_key: {s3_key}, textract_results_key: {textract_results_key}")
        
        # Delete from S3
        deleted_s3_objects = []
        if s3_key:
            try:
                normalized_key = s3_key.lstrip("/")
                print(f"[delete_file] Deleting S3 object: {bucket}/{normalized_key}")
                s3.delete_object(Bucket=bucket, Key=normalized_key)
                deleted_s3_objects.append(normalized_key)
                print(f"[delete_file] Successfully deleted S3 object: {normalized_key}")
            except Exception as e:
                print(f"[delete_file] WARNING: Failed to delete S3 object {s3_key}: {e}")
                # Continue with deletion even if S3 delete fails
        
        if textract_results_key:
            try:
                normalized_textract_key = textract_results_key.lstrip("/")
                print(f"[delete_file] Deleting Textract results: {bucket}/{normalized_textract_key}")
                s3.delete_object(Bucket=bucket, Key=normalized_textract_key)
                deleted_s3_objects.append(normalized_textract_key)
                print(f"[delete_file] Successfully deleted Textract results: {normalized_textract_key}")
            except Exception as e:
                print(f"[delete_file] WARNING: Failed to delete Textract results {textract_results_key}: {e}")
                # Continue with deletion even if S3 delete fails
        
        # Delete from catalog products table
        products_table = dynamodb.Table(CATALOG_PRODUCTS_TABLE)
        try:
            print(f"[delete_file] Deleting products for file {file_id}")
            products_table.delete_item(Key={"fileId": file_id})
            print(f"[delete_file] Successfully deleted products for file {file_id}")
        except Exception as e:
            print(f"[delete_file] WARNING: Failed to delete products for file {file_id}: {e}")
            # Continue with deletion even if products delete fails (might not exist)
        
        # Delete from files table
        try:
            print(f"[delete_file] Deleting file record {file_id}")
            files_table.delete_item(Key={"fileId": file_id})
            print(f"[delete_file] Successfully deleted file record {file_id}")
        except Exception as e:
            print(f"[delete_file] ERROR: Failed to delete file record: {e}")
            return {
                "statusCode": 500,
                "body": json.dumps({"error": "Failed to delete file record"}),
                "headers": get_cors_headers(),
            }
        
        return {
            "statusCode": 200,
            "body": json.dumps({
                "message": "File deleted successfully",
                "fileId": file_id,
                "deletedS3Objects": deleted_s3_objects
            }),
            "headers": get_cors_headers(),
        }
        
    except Exception as e:
        print(f"[delete_file] ERROR: Failed to delete file: {e}")
        import traceback
        traceback.print_exc()
        return {
            "statusCode": 500,
            "body": json.dumps({"error": "Failed to delete file"}),
            "headers": get_cors_headers(),
        }
