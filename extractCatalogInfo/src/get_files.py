import json
import os
import uuid
import time
from datetime import datetime

import boto3
from boto3.dynamodb.conditions import Attr, Key

from utils.corsHeaders import get_cors_headers
from utils.helpers import convert_decimals_to_native, convert_floats_to_decimal
from utils.file_details import build_file_details

dynamodb = boto3.resource("dynamodb")
s3 = boto3.client("s3")

FILES_TABLE = os.environ.get("FILES_TABLE", "hb-files")
CATALOG_PRODUCTS_TABLE = os.environ.get("CATALOG_PRODUCTS_TABLE", "hb-catalog-products")
PRODUCTS_TABLE = os.environ.get("PRODUCTS_TABLE", "hb-products")
PRICE_LIST_PRODUCTS_TABLE = os.environ.get("PRICE_LIST_PRODUCTS_TABLE", "hb-price-list-products")
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
    print(f"[get_file_info] Starting request processing")
    
    # Handle OPTIONS preflight request
    http_method = event.get("requestContext", {}).get("http", {}).get("method", "")
    if http_method == "OPTIONS" or event.get("httpMethod") == "OPTIONS":
        print(f"[get_file_info] Handling OPTIONS preflight request")
        return {
            "statusCode": 200,
            "body": "",
            "headers": get_cors_headers(),
        }
    
    # Extract fileId from path parameters
    # For HTTP API v2, path parameters are in event["pathParameters"]
    path_params = event.get("pathParameters") or {}
    file_id = path_params.get("fileId")
    print(f"[get_file_info] Extracted fileId: {file_id}")
    
    if not file_id:
        print(f"[get_file_info] ERROR: fileId is required but not provided")
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "fileId is required"}),
            "headers": get_cors_headers(),
        }
    
    # Get file information from DynamoDB
    table = dynamodb.Table(FILES_TABLE)
    try:
        print(f"[get_file_info] Querying table {FILES_TABLE} for fileId: {file_id}")
        response = table.get_item(Key={"fileId": file_id})
        
        if "Item" not in response:
            print(f"[get_file_info] File {file_id} not found")
            return {
                "statusCode": 404,
                "body": json.dumps({"error": "File not found"}),
                "headers": get_cors_headers(),
            }
        
        file_info = response["Item"]
        
        # Convert Decimal types to int/float for JSON serialization
        file_info = convert_decimals_to_native(file_info)
        
        print(f"[get_file_info] Successfully retrieved file info for fileId: {file_id}")
        return {
            "statusCode": 200,
            "body": json.dumps(file_info),
            "headers": get_cors_headers(),
        }
    except Exception as e:
        print(f"[get_file_info] ERROR: Failed to get file info: {e}")
        import traceback
        traceback.print_exc()
        return {
            "statusCode": 500,
            "body": json.dumps({"error": "Failed to get file information"}),
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


def assemble_chunked_products(items):
    """
    Assemble products from multiple DynamoDB chunks into a single list.
    Adds chunk metadata to each product for safe updates.
    
    Args:
        items: List of DynamoDB items, each containing a chunk of products
    
    Returns:
        tuple: (all_products: list, metadata: dict from chunk 0)
    """
    # Sort by chunkIndex
    items.sort(key=lambda x: int(x.get("chunkIndex", 0)))
    
    all_products = []
    metadata = {}
    
    for idx, item in enumerate(items):
        # Convert Decimal types to native Python types
        item_json = json.loads(json.dumps(item, default=str))
        products_in_item = item_json.get("products", [])
        chunk_index = item_json.get("chunkIndex")

        # Add chunk metadata to each product for tracking during updates
        for product in products_in_item:
            product["_chunkIndex"] = chunk_index
            product["_fileId"] = item_json.get("fileId")

        all_products.extend(products_in_item)
        
        # Get metadata from chunk 0
        if chunk_index == 0 or chunk_index == "0":
            metadata = item_json
    
    return all_products, metadata


def get_catalog_products(event, context):
    """
    Get all products for a CATALOG file from the catalog products table.
    Catalog products are stored as a single document per file.
    """
    print(f"[get_catalog_products] Starting request")
    
    # Handle OPTIONS preflight request
    http_method = event.get("requestContext", {}).get("http", {}).get("method", "")
    if http_method == "OPTIONS" or event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "body": "", "headers": get_cors_headers()}
    
    # Extract fileId from path parameters
    path_params = event.get("pathParameters") or {}
    file_id = path_params.get("fileId")
    print(f"[get_catalog_products] Extracted fileId: {file_id}")
    
    if not file_id:
        print(f"[get_catalog_products] ERROR: fileId is required")
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "fileId is required"}),
            "headers": get_cors_headers(),
        }
    
    # Get products from catalog products table
    table = dynamodb.Table(CATALOG_PRODUCTS_TABLE)
    try:
        print(f"[get_catalog_products] Querying table {CATALOG_PRODUCTS_TABLE} for fileId: {file_id}")
        response = table.get_item(Key={"fileId": file_id})
        
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
                "createdAt": document_json.get("createdAt", 0),
                "businessFileType": "Catalog"
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


def get_price_list_products(event, context):
    """
    Get all products for a PRICE LIST file from the price list products table.
    Price list products are stored in chunks to handle large files.
    """
    print(f"[get_price_list_products] Starting request")
    
    # Handle OPTIONS preflight request
    http_method = event.get("requestContext", {}).get("http", {}).get("method", "")
    if http_method == "OPTIONS" or event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "body": "", "headers": get_cors_headers()}
    
    # Extract fileId from path parameters
    path_params = event.get("pathParameters") or {}
    file_id = path_params.get("fileId")
    print(f"[get_price_list_products] Extracted fileId: {file_id}")
    
    if not file_id:
        print(f"[get_price_list_products] ERROR: fileId is required")
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "fileId is required"}),
            "headers": get_cors_headers(),
        }
    
    # Query all chunks for this fileId from price list products table
    table = dynamodb.Table(PRICE_LIST_PRODUCTS_TABLE)
    try:
        print(f"[get_price_list_products] Querying all chunks for fileId: {file_id}")

        items = []
        last_evaluated_key = None

        while True:
            query_kwargs = {
                "KeyConditionExpression": Key("fileId").eq(file_id),
            }
            if last_evaluated_key:
                query_kwargs["ExclusiveStartKey"] = last_evaluated_key

            response = table.query(**query_kwargs)
            batch_items = response.get("Items", [])

            if not batch_items:
                break

            items.extend(batch_items)
            last_evaluated_key = response.get("LastEvaluatedKey")
            if not last_evaluated_key:
                break

        if not items:
            print(f"[get_price_list_products] No products found for file {file_id}")
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

        # Assemble products from chunks
        all_products, metadata = assemble_chunked_products(items)

        print(f"[get_price_list_products] Assembled {len(all_products)} products from {len(items)} chunks")

        return {
            "statusCode": 200,
            "body": json.dumps({
                "fileId": file_id,
                "products": all_products,
                "count": len(all_products),
                "sourceFile": metadata.get("sourceFile", ""),
                "createdAt": metadata.get("createdAt", 0),
                "businessFileType": "Price List",
                "totalChunks": len(items)
            }),
            "headers": get_cors_headers(),
        }

    except Exception as e:
        print(f"[get_price_list_products] ERROR: Failed to get products: {e}")
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


def update_price_list_products(event, context):
    """
    Update price list products for a file after review.
    Handles the chunked structure of the price-list-products table.
    """
    print(f"[update_price_list_products] Starting request")

    http_method = event.get("requestContext", {}).get("http", {}).get("method", "")
    if http_method == "OPTIONS" or event.get("httpMethod") == "OPTIONS":
        print(f"[update_price_list_products] Handling OPTIONS preflight request")
        return {
            "statusCode": 200,
            "body": "",
            "headers": get_cors_headers(),
        }

    path_params = event.get("pathParameters") or {}
    file_id = path_params.get("fileId")
    print(f"[update_price_list_products] Extracted fileId: {file_id}")

    if not file_id:
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "fileId is required"}),
            "headers": get_cors_headers(),
        }

    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        print("[update_price_list_products] ERROR: Invalid JSON body")
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "Invalid JSON body"}),
            "headers": get_cors_headers(),
        }

    products = body.get("products")
    if not isinstance(products, list):
        print("[update_price_list_products] ERROR: `products` payload missing or invalid")
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "`products` array is required"}),
            "headers": get_cors_headers(),
        }

    products_count = len(products)
    timestamp = int(time.time() * 1000)
    iso_timestamp = datetime.utcnow().isoformat() + 'Z'
    
    print(f"[update_price_list_products] Updating {products_count} products for file {file_id}")

    price_list_table = dynamodb.Table(PRICE_LIST_PRODUCTS_TABLE)
    files_table = dynamodb.Table(FILES_TABLE)
    
    try:
        # Step 1: Load all existing chunks for this file
        print(f"[update_price_list_products] Querying existing chunks for file {file_id}")
        response = price_list_table.query(
            KeyConditionExpression=Key("fileId").eq(file_id)
        )
        existing_chunks = response.get("Items", [])
        
        # Continue paginating if needed
        while response.get("LastEvaluatedKey"):
            response = price_list_table.query(
                KeyConditionExpression=Key("fileId").eq(file_id),
                ExclusiveStartKey=response["LastEvaluatedKey"]
            )
            existing_chunks.extend(response.get("Items", []))
        
        if not existing_chunks:
            print(f"[update_price_list_products] ERROR: No existing chunks found for file {file_id}")
            return {
                "statusCode": 404,
                "body": json.dumps({"error": f"No price list data found for file {file_id}"}),
                "headers": get_cors_headers(),
            }
        
        old_chunk_count = len(existing_chunks)
        print(f"[update_price_list_products] Found {old_chunk_count} existing chunks")
        
        # Step 2: Get metadata from chunk 0
        chunk_0 = next((c for c in existing_chunks if c.get("chunkIndex") == 0), None)
        source_file = chunk_0.get("sourceFile", "") if chunk_0 else ""
        created_at = chunk_0.get("createdAt", timestamp) if chunk_0 else timestamp
        created_at_iso = chunk_0.get("createdAtIso", iso_timestamp) if chunk_0 else iso_timestamp
        
        # Step 3: Convert and re-chunk the updated products
        # Remove chunk metadata added by GET endpoint (fields starting with _)
        sanitized_products = convert_floats_to_decimal(products)
        for product in sanitized_products:
            product.pop("_chunkIndex", None)
            product.pop("_fileId", None)
        
        # Import split function from process_upload_file
        from src.process_upload_file import split_products_into_chunks
        chunks = split_products_into_chunks(sanitized_products)
        total_chunks = len(chunks)
        
        print(f"[update_price_list_products] Saving {total_chunks} new chunks (SAFE: save first, delete extras later)")
        
        # Step 4: SAVE NEW CHUNKS FIRST (overwriting existing ones)
        # This ensures we don't lose data if timeout occurs
        for chunk_idx, chunk_products in enumerate(chunks):
            item = {
                "fileId": file_id,
                "chunkIndex": chunk_idx,
                "products": chunk_products,
                "productsInChunk": len(chunk_products),
                "updatedAt": timestamp,
                "updatedAtIso": iso_timestamp,
            }
            
            # Add metadata to chunk 0
            if chunk_idx == 0:
                item["sourceFile"] = source_file
                item["createdAt"] = created_at
                item["createdAtIso"] = created_at_iso
                item["totalProductsCount"] = len(sanitized_products)
                item["totalChunks"] = total_chunks
            
            price_list_table.put_item(Item=item)
            print(f"[update_price_list_products] Saved chunk {chunk_idx + 1}/{total_chunks}")
        
        # Step 5: DELETE EXTRA CHUNKS if new count < old count
        # Only delete after all new chunks are saved successfully
        if total_chunks < old_chunk_count:
            extra_chunks_to_delete = old_chunk_count - total_chunks
            print(f"[update_price_list_products] Deleting {extra_chunks_to_delete} extra old chunks (indices {total_chunks} to {old_chunk_count - 1})")
            for chunk_idx in range(total_chunks, old_chunk_count):
                price_list_table.delete_item(
                    Key={
                        "fileId": file_id,
                        "chunkIndex": chunk_idx
                    }
                )
                print(f"[update_price_list_products] Deleted old chunk {chunk_idx}")
        else:
            print(f"[update_price_list_products] No extra chunks to delete (new: {total_chunks}, old: {old_chunk_count})")
        
        # Step 6: Update FILES_TABLE
        try:
            valid_count = sum(1 for p in products if p.get("status") == "valid")
            invalid_count = sum(1 for p in products if p.get("status") == "invalid")
            
            files_table.update_item(
                Key={"fileId": file_id},
                UpdateExpression="SET #productsCount = :count, #validProductsCount = :validCount, #invalidProductsCount = :invalidCount, #updatedAt = :updatedAt, #updatedAtIso = :updatedAtIso",
                ExpressionAttributeNames={
                    "#productsCount": "productsCount",
                    "#validProductsCount": "validProductsCount",
                    "#invalidProductsCount": "invalidProductsCount",
                    "#updatedAt": "updatedAt",
                    "#updatedAtIso": "updatedAtIso",
                },
                ExpressionAttributeValues={
                    ":count": products_count,
                    ":validCount": valid_count,
                    ":invalidCount": invalid_count,
                    ":updatedAt": timestamp,
                    ":updatedAtIso": iso_timestamp,
                },
            )
            print(f"[update_price_list_products] Successfully updated FILES_TABLE")
        except Exception as files_error:
            print(f"[update_price_list_products] WARNING: Failed to update FILES_TABLE: {files_error}")
        
        print(f"[update_price_list_products] Successfully updated {products_count} products")
        return {
            "statusCode": 200,
            "body": json.dumps({
                "message": "Products updated successfully",
                "productsCount": products_count,
                "totalChunks": total_chunks,
            }),
            "headers": get_cors_headers(),
        }

    except Exception as error:
        print(f"[update_price_list_products] ERROR: {error}")
        import traceback
        traceback.print_exc()
        return {
            "statusCode": 500,
            "body": json.dumps({"error": "Failed to update price list products"}),
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
    print(f"[check_file_exists] Raw event: {json.dumps({'body': event.get('body'), 'method': event.get('httpMethod') or event.get('requestContext', {}).get('http', {}).get('method')})}")

    # Handle OPTIONS preflight request
    http_method = event.get("requestContext", {}).get("http", {}).get("method", "")
    if http_method == "OPTIONS" or event.get("httpMethod") == "OPTIONS":
        print("[check_file_exists] Handling OPTIONS preflight request")
        return {
            "statusCode": 200,
            "body": "",
            "headers": get_cors_headers(),
        }
    
    # Parse request body
    try:
        body = json.loads(event.get("body") or "{}")
        print(f"[check_file_exists] Parsed body: {json.dumps(body)}")
    except json.JSONDecodeError:
        print("[check_file_exists] ERROR: Invalid JSON in request body")
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
        print("[check_file_exists] ERROR: fileType is required but missing")
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "fileType is required"}),
            "headers": get_cors_headers(),
        }
    
    if not display_name:
        print("[check_file_exists] ERROR: fileName is required but missing")
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "fileName is required"}),
            "headers": get_cors_headers(),
        }
    
    # Validate type-specific required fields
    if business_file_type == "Catalog" and not catalog_serial_number:
        print("[check_file_exists] ERROR: catalogSerialNumber is required for Catalog files")
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "catalogSerialNumber is required for Catalog files"}),
            "headers": get_cors_headers(),
        }
    
    if business_file_type == "Sales Drawing" and not ordering_number:
        print("[check_file_exists] ERROR: orderingNumber is required for Sales Drawing files")
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "orderingNumber is required for Sales Drawing files"}),
            "headers": get_cors_headers(),
        }
    
    if business_file_type == "Price List" and not year:
        print("[check_file_exists] ERROR: year is required for Price List files")
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
                        "file": build_file_details(file_item),
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
                            "file": build_file_details(file_item),
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
                            "file": build_file_details(file_item),
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
                            "file": build_file_details(file_item),
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
        file_business_type = file_info.get("businessFileType", "")
        if file_business_type == "Catalog":
            catalog_products_table = dynamodb.Table(CATALOG_PRODUCTS_TABLE)
            try:
                print(f"[delete_file] Deleting products for file {file_id}")
                catalog_products_table.delete_item(Key={"fileId": file_id})
                print(f"[delete_file] Successfully deleted products for file {file_id}")
            except Exception as e:
                print(f"[delete_file] WARNING: Failed to delete products for file {file_id}: {e}")
                # Continue with deletion even if products delete fails (might not exist)
        
        elif file_business_type == "Price List":
            price_list_products_table = dynamodb.Table(PRICE_LIST_PRODUCTS_TABLE)
            try:
                print(f"[delete_file] Deleting products for file {file_id}")
                items_deleted = 0
                last_evaluated_key = None

                while True:
                    query_kwargs = {
                        "KeyConditionExpression": Key("fileId").eq(file_id),
                    }
                    if last_evaluated_key:
                        query_kwargs["ExclusiveStartKey"] = last_evaluated_key

                    response = price_list_products_table.query(**query_kwargs)
                    items = response.get("Items", [])

                    if not items:
                        break

                    with price_list_products_table.batch_writer() as batch:
                        for item in items:
                            # chunkIndex is the sort key – must match exactly
                            chunk_index = item.get("chunkIndex")
                            if chunk_index is None:
                                continue
                            batch.delete_item(
                                Key={"fileId": file_id, "chunkIndex": chunk_index}
                            )
                            items_deleted += 1

                    last_evaluated_key = response.get("LastEvaluatedKey")
                    if not last_evaluated_key:
                        break

                print(f"[delete_file] Successfully deleted {items_deleted} product chunks for file {file_id}")
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


def check_existing_products(event, context):
    """
    Check for existing products by ordering numbers.
    Returns products that already exist in the Products table.
    """
    print(f"[check_existing_products] Starting request")
    
    http_method = event.get("requestContext", {}).get("http", {}).get("method", "")
    if http_method == "OPTIONS" or event.get("httpMethod") == "OPTIONS":
        return {
            "statusCode": 200,
            "body": "",
            "headers": get_cors_headers(),
        }
    
    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "Invalid JSON body"}),
            "headers": get_cors_headers(),
        }
    
    ordering_numbers = body.get("orderingNumbers", [])
    if not isinstance(ordering_numbers, list):
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "orderingNumbers must be an array"}),
            "headers": get_cors_headers(),
        }
    
    if not ordering_numbers:
        return {
            "statusCode": 200,
            "body": json.dumps({"existing": {}}),
            "headers": get_cors_headers(),
        }
    
    print(f"[check_existing_products] Checking {len(ordering_numbers)} ordering numbers")
    
    products_table = dynamodb.Table(PRODUCTS_TABLE)
    existing_products = {}
    
    # Batch get items (DynamoDB allows up to 100 items per batch)
    for i in range(0, len(ordering_numbers), 100):
        batch = ordering_numbers[i:i+100]
        keys = [{"orderingNumber": on} for on in batch]
        
        try:
            response = products_table.meta.client.batch_get_item(
                RequestItems={
                    PRODUCTS_TABLE: {
                        "Keys": keys
                    }
                }
            )
            
            items = response.get("Responses", {}).get(PRODUCTS_TABLE, [])
            for item in items:
                ordering_number = item.get("orderingNumber")
                if ordering_number:
                    existing_products[ordering_number] = convert_decimals_to_native(item)
            
        except Exception as e:
            print(f"[check_existing_products] ERROR: Failed to batch get items: {e}")
            # Continue with other batches
    
    print(f"[check_existing_products] Found {len(existing_products)} existing products")
    
    return {
        "statusCode": 200,
        "body": json.dumps({"existing": existing_products}),
        "headers": get_cors_headers(),
    }


def save_products_from_catalog(event, context):
    """
    Save products from catalog review to the Products table.
    Uses pointer-based merging: adds catalog product pointer to existing product or creates new one.
    Products are keyed by orderingNumber.
    """
    print(f"[save_products_from_catalog] Starting request")
    
    http_method = event.get("requestContext", {}).get("http", {}).get("method", "")
    if http_method == "OPTIONS" or event.get("httpMethod") == "OPTIONS":
        return {
            "statusCode": 200,
            "body": "",
            "headers": get_cors_headers(),
        }
    
    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "Invalid JSON body"}),
            "headers": get_cors_headers(),
        }
    
    products = body.get("products", [])
    if not isinstance(products, list):
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "products must be an array"}),
            "headers": get_cors_headers(),
        }
    
    if not products:
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "products array cannot be empty"}),
            "headers": get_cors_headers(),
        }
    
    print(f"[save_products_from_catalog] Saving {len(products)} catalog products")
    
    products_table = dynamodb.Table(PRODUCTS_TABLE)
    timestamp = int(time.time() * 1000)
    iso_timestamp = datetime.utcnow().isoformat() + 'Z'
    
    saved_count = 0
    errors = []
    
    # Process each product
    for product in products:
        ordering_number = product.get("orderingNumber")
        if not ordering_number:
            errors.append("Product missing orderingNumber")
            continue
        
        try:
            product_category = product.get("productCategory")
            if not product_category:
                errors.append(f"Product {ordering_number} missing productCategory")
                continue
            
            new_metadata = product.get("metadata", {}) or {}
            text_description = product.get("text_description", "")
            
            # Check if product exists
            existing_response = products_table.get_item(Key={"orderingNumber": ordering_number})
            
            if "Item" in existing_response:
                # Product exists - merge with existing
                existing_item = existing_response["Item"]
                existing_metadata = existing_item.get("metadata", {}) or {}
                
                # Get existing catalog products list
                existing_catalog_products = existing_metadata.get("catalogProducts", [])
                new_catalog_products = new_metadata.get("catalogProducts", [])
                
                # Merge catalog products (add new ones, avoiding duplicates by fileId)
                merged_catalog_products = list(existing_catalog_products)
                existing_file_ids = {cp.get("fileId") for cp in existing_catalog_products if isinstance(cp, dict)}
                
                for new_cp in new_catalog_products:
                    if isinstance(new_cp, dict) and new_cp.get("fileId") not in existing_file_ids:
                        merged_catalog_products.append(new_cp)
                
                # Keep existing price list entries and sales drawings
                merged_metadata = {
                    "catalogProducts": merged_catalog_products,
                    "priceListEntries": existing_metadata.get("priceListEntries", []),
                    "salesDrawings": existing_metadata.get("salesDrawings", []),
                }
                
                # Prepare updated product item
                product_item = {
                    "orderingNumber": ordering_number,
                    "productCategory": product_category,
                    "metadata": convert_floats_to_decimal(merged_metadata),
                    "text_description": text_description,
                    "currentPrice": existing_item.get("currentPrice"),
                    "currentPriceYear": existing_item.get("currentPriceYear"),
                    "currentLink": existing_item.get("currentLink"),
                    "createdAt": existing_item.get("createdAt", timestamp),
                    "createdAtIso": existing_item.get("createdAtIso", iso_timestamp),
                    "updatedAt": timestamp,
                    "updatedAtIso": iso_timestamp,
                }
            else:
                # New product - create with catalog pointer only
                product_item = {
                    "orderingNumber": ordering_number,
                    "productCategory": product_category,
                    "metadata": convert_floats_to_decimal(new_metadata),
                    "text_description": text_description,
                    "createdAt": timestamp,
                    "createdAtIso": iso_timestamp,
                    "updatedAt": timestamp,
                    "updatedAtIso": iso_timestamp,
                }
            
            # Save product
            products_table.put_item(Item=product_item)
            saved_count += 1
            print(f"[save_products_from_catalog] Saved product: {ordering_number}")
            
        except Exception as e:
            error_msg = f"Failed to save product {ordering_number}: {str(e)}"
            errors.append(error_msg)
            print(f"[save_products_from_catalog] ERROR: {error_msg}")
            import traceback
            traceback.print_exc()
    
    if errors:
        print(f"[save_products_from_catalog] Completed with {len(errors)} errors")
        return {
            "statusCode": 207,  # Multi-Status
            "body": json.dumps({
                "saved": saved_count,
                "errors": errors,
                "message": f"Saved {saved_count} products with {len(errors)} errors"
            }),
            "headers": get_cors_headers(),
        }
    
    print(f"[save_products_from_catalog] Successfully saved {saved_count} products")
    return {
        "statusCode": 200,
        "body": json.dumps({
            "saved": saved_count,
            "message": f"Successfully saved {saved_count} products"
        }),
        "headers": get_cors_headers(),
    }


def save_products_from_price_list(event, context):
    """
    Save products from price list review to the Products table.
    Uses pointer-based merging: adds price list pointer to existing product or creates new one.
    Backend queries price-list-products table to find chunks and resolve actual data.
    Handles multiple price sources - keeps latest by year.
    Products are keyed by orderingNumber.
    """
    print(f"[save_products_from_price_list] Starting request")
    
    http_method = event.get("requestContext", {}).get("http", {}).get("method", "")
    if http_method == "OPTIONS" or event.get("httpMethod") == "OPTIONS":
        return {
            "statusCode": 200,
            "body": "",
            "headers": get_cors_headers(),
        }
    
    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "Invalid JSON body"}),
            "headers": get_cors_headers(),
        }
    
    products = body.get("products", [])
    if not isinstance(products, list):
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "products must be an array"}),
            "headers": get_cors_headers(),
        }
    
    if not products:
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "products array cannot be empty"}),
            "headers": get_cors_headers(),
        }
    
    print(f"[save_products_from_price_list] Saving {len(products)} price list products")
    
    products_table = dynamodb.Table(PRODUCTS_TABLE)
    price_list_table = dynamodb.Table(PRICE_LIST_PRODUCTS_TABLE)
    timestamp = int(time.time() * 1000)
    iso_timestamp = datetime.utcnow().isoformat() + 'Z'
    
    saved_count = 0
    errors = []
    items_to_write = []  # Collect items for batch writing
    
    # Group products by fileId to minimize queries
    products_by_file = {}
    for product in products:
        pointer_data = product.get("priceListPointerData", {})
        file_id = pointer_data.get("fileId")
        if file_id:
            if file_id not in products_by_file:
                products_by_file[file_id] = []
            products_by_file[file_id].append(product)
    
    # For each file, query all chunks and build an index
    file_chunk_index = {}  # {fileId: {orderingNumber: {chunkIndex, price, description, link}}}
    
    for file_id in products_by_file.keys():
        print(f"[save_products_from_price_list] Querying chunks for fileId: {file_id}")
        try:
            # Query all chunks for this file
            response = price_list_table.query(
                KeyConditionExpression=Key("fileId").eq(file_id)
            )
            chunks = response.get("Items", [])
            
            # Continue paginating if needed
            while response.get("LastEvaluatedKey"):
                response = price_list_table.query(
                    KeyConditionExpression=Key("fileId").eq(file_id),
                    ExclusiveStartKey=response["LastEvaluatedKey"]
                )
                chunks.extend(response.get("Items", []))
            
            print(f"[save_products_from_price_list] Found {len(chunks)} chunks for file {file_id}")
            
            # Build index: orderingNumber -> {chunkIndex, product data}
            file_chunk_index[file_id] = {}
            for chunk in chunks:
                chunk_index = chunk.get("chunkIndex")
                chunk_products = chunk.get("products", [])
                
                for prod in chunk_products:
                    ordering_num = prod.get("orderingNumber")
                    if ordering_num:
                        file_chunk_index[file_id][ordering_num] = {
                            "chunkIndex": chunk_index,
                            "price": prod.get("price"),
                            "description": prod.get("description"),
                            "link": prod.get("SwagelokLink"),
                        }
        except Exception as e:
            print(f"[save_products_from_price_list] ERROR querying chunks for file {file_id}: {e}")
            errors.append(f"Failed to query price list chunks for file {file_id}: {str(e)}")
            continue
    
    # Step 1: Batch fetch all existing products (much faster than individual get_item calls)
    print(f"[save_products_from_price_list] Fetching existing products in batches")
    ordering_numbers = [p.get("orderingNumber") for p in products if p.get("orderingNumber")]
    existing_products_map = {}  # {orderingNumber: existing_item}
    
    # Batch get existing products (max 100 per batch)
    batch_get_size = 100
    for i in range(0, len(ordering_numbers), batch_get_size):
        batch_ordering_nums = ordering_numbers[i:i + batch_get_size]
        keys_to_get = [{"orderingNumber": on} for on in batch_ordering_nums]
        
        try:
            response = dynamodb.batch_get_item(
                RequestItems={
                    PRODUCTS_TABLE: {
                        "Keys": keys_to_get
                    }
                }
            )
            
            # Process responses
            items = response.get("Responses", {}).get(PRODUCTS_TABLE, [])
            for item in items:
                existing_products_map[item["orderingNumber"]] = item
            
            # Handle unprocessed keys (retry once)
            unprocessed = response.get("UnprocessedKeys", {})
            if unprocessed and PRODUCTS_TABLE in unprocessed:
                retry_response = dynamodb.batch_get_item(RequestItems={PRODUCTS_TABLE: unprocessed[PRODUCTS_TABLE]})
                retry_items = retry_response.get("Responses", {}).get(PRODUCTS_TABLE, [])
                for item in retry_items:
                    existing_products_map[item["orderingNumber"]] = item
            
            if (i // batch_get_size) % 10 == 0:  # Log every 10 batches
                print(f"[save_products_from_price_list] Fetched batch {i//batch_get_size + 1}/{(len(ordering_numbers) + batch_get_size - 1)//batch_get_size}")
                
        except Exception as e:
            print(f"[save_products_from_price_list] ERROR in batch_get_item: {e}")
            # Continue processing - missing products will be treated as new
    
    print(f"[save_products_from_price_list] Found {len(existing_products_map)} existing products, preparing items for batch write")
    
    # Step 2: Process each product and prepare items for batch write
    for product in products:
        ordering_number = product.get("orderingNumber")
        if not ordering_number:
            errors.append("Product missing orderingNumber")
            continue
        
        try:
            pointer_data = product.get("priceListPointerData")
            if not pointer_data:
                errors.append(f"Product {ordering_number} missing priceListPointerData")
                continue
            
            file_id = pointer_data.get("fileId")
            year = pointer_data.get("year")
            added_at = pointer_data.get("addedAt")
            added_at_iso = pointer_data.get("addedAtIso")
            
            # Look up chunk index and actual product data from our index
            if file_id not in file_chunk_index or ordering_number not in file_chunk_index[file_id]:
                errors.append(f"Product {ordering_number} not found in price list file {file_id}")
                continue
            
            chunk_data = file_chunk_index[file_id][ordering_number]
            chunk_index = chunk_data["chunkIndex"]
            price = chunk_data["price"]
            description = chunk_data["description"]
            link = chunk_data["link"]
            
            # Create pointer (not full data)
            new_pointer = {
                "fileId": file_id,
                "chunkIndex": chunk_index,
                "year": year,
                "addedAt": added_at,
                "addedAtIso": added_at_iso,
            }
            
            # Check if product exists in our fetched map
            existing_item = existing_products_map.get(ordering_number)
            
            if existing_item:
                # Product exists - merge with existing
                existing_metadata = existing_item.get("metadata", {}) or {}
                
                # Get existing price list pointers
                existing_pointers = existing_metadata.get("priceListPointers", [])
                
                # Add new pointer (avoiding duplicate by fileId)
                merged_pointers = list(existing_pointers)
                existing_file_ids = {p.get("fileId") for p in existing_pointers if isinstance(p, dict)}
                
                if file_id not in existing_file_ids:
                    merged_pointers.append(new_pointer)
                else:
                    # Replace existing pointer from same file with updated one
                    merged_pointers = [
                        p for p in merged_pointers 
                        if not isinstance(p, dict) or p.get("fileId") != file_id
                    ]
                    merged_pointers.append(new_pointer)
                
                # Sort pointers by year (latest first), handling missing years
                def get_year_sort_key(pointer):
                    if not isinstance(pointer, dict):
                        return 0
                    ptr_year = pointer.get("year")
                    try:
                        return int(ptr_year) if ptr_year else 0
                    except (ValueError, TypeError):
                        return 0
                
                merged_pointers.sort(key=get_year_sort_key, reverse=True)
                
                # Update denormalized fields from the latest (first) pointer
                # Use the actual data we resolved from the chunk
                latest_is_current = merged_pointers[0].get("fileId") == file_id if merged_pointers else False
                
                if latest_is_current:
                    # The new pointer is the latest, use its data for denormalized fields
                    current_price_val = price
                    current_price_year_val = year
                    current_price_file_id_val = file_id
                    current_link_val = link
                else:
                    # Keep existing denormalized values (they're from a newer price list)
                    current_price_val = existing_item.get("currentPrice")
                    current_price_year_val = existing_item.get("currentPriceYear")
                    current_price_file_id_val = existing_item.get("currentPriceFileId")
                    current_link_val = existing_item.get("currentLink")
                
                # Merge metadata with pointers
                merged_metadata = {
                    "catalogProducts": existing_metadata.get("catalogProducts", []),
                    "priceListPointers": merged_pointers,
                    "salesDrawings": existing_metadata.get("salesDrawings", []),
                }
                
                # Prepare updated product item
                product_item = {
                    "orderingNumber": ordering_number,
                    "productCategory": existing_item.get("productCategory", ""),
                    "metadata": convert_floats_to_decimal(merged_metadata),
                    "text_description": existing_item.get("text_description", ""),
                    "createdAt": existing_item.get("createdAt", timestamp),
                    "createdAtIso": existing_item.get("createdAtIso", iso_timestamp),
                    "updatedAt": timestamp,
                    "updatedAtIso": iso_timestamp,
                }
                
                # Add denormalized fields (cached for quick access)
                if current_price_val is not None:
                    product_item["currentPrice"] = convert_floats_to_decimal(current_price_val)
                if current_price_year_val:
                    product_item["currentPriceYear"] = current_price_year_val
                if current_price_file_id_val:
                    product_item["currentPriceFileId"] = current_price_file_id_val
                if current_link_val:
                    product_item["currentLink"] = current_link_val
                    
            else:
                # New product - create with price list pointer only
                # We don't have product category from price list, so we need to infer or leave empty
                
                product_item = {
                    "orderingNumber": ordering_number,
                    "productCategory": "",  # Will need to be filled in from catalog later
                    "metadata": convert_floats_to_decimal({
                        "priceListPointers": [new_pointer],
                    }),
                    "text_description": description or "",
                    "createdAt": timestamp,
                    "createdAtIso": iso_timestamp,
                    "updatedAt": timestamp,
                    "updatedAtIso": iso_timestamp,
                }
                
                # Add denormalized fields (cached for quick access)
                if price is not None:
                    product_item["currentPrice"] = convert_floats_to_decimal(price)
                if year:
                    product_item["currentPriceYear"] = year
                if file_id:
                    product_item["currentPriceFileId"] = file_id
                if link:
                    product_item["currentLink"] = link
            
            # Add product to batch write queue
            items_to_write.append(product_item)
            
        except Exception as e:
            error_msg = f"Failed to prepare product {ordering_number}: {str(e)}"
            errors.append(error_msg)
            print(f"[save_products_from_price_list] ERROR: {error_msg}")
            import traceback
            traceback.print_exc()
    
    # Batch write all items (DynamoDB batch_write_item supports up to 25 items per batch)
    print(f"[save_products_from_price_list] Writing {len(items_to_write)} items in batches of 25")
    batch_size = 25
    
    for i in range(0, len(items_to_write), batch_size):
        batch = items_to_write[i:i + batch_size]
        batch_requests = [{"PutRequest": {"Item": item}} for item in batch]
        
        try:
            response = dynamodb.batch_write_item(
                RequestItems={
                    PRODUCTS_TABLE: batch_requests
                }
            )
            
            # Handle unprocessed items (retry once)
            unprocessed = response.get("UnprocessedItems", {})
            if unprocessed and PRODUCTS_TABLE in unprocessed:
                unprocessed_requests = unprocessed[PRODUCTS_TABLE]
                print(f"[save_products_from_price_list] Retrying {len(unprocessed_requests)} unprocessed items")
                
                retry_response = dynamodb.batch_write_item(
                    RequestItems={
                        PRODUCTS_TABLE: unprocessed_requests
                    }
                )
                
                # Check if there are still unprocessed items after retry
                still_unprocessed = retry_response.get("UnprocessedItems", {})
                if still_unprocessed and PRODUCTS_TABLE in still_unprocessed:
                    failed_count = len(still_unprocessed[PRODUCTS_TABLE])
                    errors.append(f"Failed to write {failed_count} items after retry in batch {i//batch_size + 1}")
                    print(f"[save_products_from_price_list] WARNING: {failed_count} items still unprocessed after retry")
                else:
                    saved_count += len(unprocessed_requests)
            
            # Count successfully written items (batch size minus any failures)
            batch_saved = len(batch)
            if unprocessed and PRODUCTS_TABLE in unprocessed:
                batch_saved -= len(unprocessed[PRODUCTS_TABLE])
            saved_count += batch_saved
            
            print(f"[save_products_from_price_list] Batch {i//batch_size + 1}/{(len(items_to_write) + batch_size - 1)//batch_size}: Saved {batch_saved}/{len(batch)} items")
            
        except Exception as e:
            error_msg = f"Failed to write batch {i//batch_size + 1}: {str(e)}"
            errors.append(error_msg)
            print(f"[save_products_from_price_list] ERROR: {error_msg}")
            import traceback
            traceback.print_exc()
    
    if errors:
        print(f"[save_products_from_price_list] Completed with {len(errors)} errors")
        return {
            "statusCode": 207,  # Multi-Status
            "body": json.dumps({
                "saved": saved_count,
                "errors": errors,
                "message": f"Saved {saved_count} products with {len(errors)} errors"
            }),
            "headers": get_cors_headers(),
        }
    
    print(f"[save_products_from_price_list] Successfully saved {saved_count} products")
    return {
        "statusCode": 200,
        "body": json.dumps({
            "saved": saved_count,
            "message": f"Successfully saved {saved_count} products"
        }),
        "headers": get_cors_headers(),
    }


def get_product(event, context):
    """
    Retrieve a single product by ordering number from the Products table.
    """
    print("[get_product] Starting request")

    http_method = event.get("requestContext", {}).get("http", {}).get("method", "")
    if http_method == "OPTIONS" or event.get("httpMethod") == "OPTIONS":
        return {
            "statusCode": 200,
            "body": "",
            "headers": get_cors_headers(),
        }

    path_params = event.get("pathParameters") or {}
    ordering_number = path_params.get("orderingNumber")
    print(f"[get_product] Requested ordering number: {ordering_number}")

    if not ordering_number:
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "orderingNumber is required"}),
            "headers": get_cors_headers(),
        }

    products_table = dynamodb.Table(PRODUCTS_TABLE)

    try:
        response = products_table.get_item(Key={"orderingNumber": ordering_number})
        item = response.get("Item")

        if not item:
            return {
                "statusCode": 404,
                "body": json.dumps({"error": "Product not found"}),
                "headers": get_cors_headers(),
            }

        product = convert_decimals_to_native(item)
        return {
            "statusCode": 200,
            "body": json.dumps(product),
            "headers": get_cors_headers(),
        }
    except Exception as error:
        print(f"[get_product] ERROR retrieving product {ordering_number}: {error}")
        import traceback
        traceback.print_exc()
        return {
            "statusCode": 500,
            "body": json.dumps({"error": "Failed to get product"}),
            "headers": get_cors_headers(),
        }


def list_products(event, context):
    """
    List products with optional category filtering and cursor-based pagination.
    Returns a lightweight page (default 50 items) to avoid scanning the full table.
    """
    print("[list_products] Starting request")

    http_method = event.get("requestContext", {}).get("http", {}).get("method", "")
    if http_method == "OPTIONS" or event.get("httpMethod") == "OPTIONS":
        return {
            "statusCode": 200,
            "body": "",
            "headers": get_cors_headers(),
        }

    query_params = event.get("queryStringParameters") or {}
    category = (query_params.get("category") or "").strip() or None
    cursor_param = query_params.get("cursor") or query_params.get("lastKey")
    limit_param = query_params.get("limit")

    try:
        limit = int(limit_param) if limit_param is not None else 50
    except ValueError:
        limit = 50

    limit = max(1, min(limit, 200))
    page_size = min(limit, 200)
    print(f"[list_products] Params - category: {category}, limit: {limit}")

    scan_kwargs = {
        "Limit": page_size,
    }

    if category:
        scan_kwargs["FilterExpression"] = Attr("productCategory").eq(category)

    if cursor_param:
        try:
            scan_kwargs["ExclusiveStartKey"] = json.loads(cursor_param)
        except json.JSONDecodeError:
            return {
                "statusCode": 400,
                "body": json.dumps({"error": "Invalid cursor parameter"}),
                "headers": get_cors_headers(),
            }

    products_table = dynamodb.Table(PRODUCTS_TABLE)
    products = []
    last_evaluated_key = None

    try:
        while len(products) < limit:
            response = products_table.scan(**scan_kwargs)
            products.extend(response.get("Items", []))
            last_evaluated_key = response.get("LastEvaluatedKey")

            print(
                f"[list_products] Scan page retrieved {len(response.get('Items', []))} items, "
                f"accumulated {len(products)}"
            )

            if len(products) >= limit or not last_evaluated_key:
                break

            remaining = limit - len(products)
            scan_kwargs["ExclusiveStartKey"] = last_evaluated_key
            scan_kwargs["Limit"] = min(remaining, page_size)

        products = products[:limit]
        products_native = [convert_decimals_to_native(item) for item in products]

        cursor = None
        has_more = False

        if last_evaluated_key:
            cursor = json.dumps(last_evaluated_key, default=str)
            has_more = True

        return {
            "statusCode": 200,
            "body": json.dumps(
                {
                    "count": len(products_native),
                    "products": products_native,
                    "hasMore": has_more,
                    "cursor": cursor,
                }
            ),
            "headers": get_cors_headers(),
        }
    except Exception as error:
        print(f"[list_products] ERROR listing products: {error}")
        import traceback
        traceback.print_exc()
        return {
            "statusCode": 500,
            "body": json.dumps({"error": "Failed to list products"}),
            "headers": get_cors_headers(),
        }


def complete_file_review(event, context):
    """
    Mark file and catalog products as completed after review.
    Updates file status to 'completed' and catalog products status to 'completed'.
    """
    print(f"[complete_file_review] Starting request")
    
    http_method = event.get("requestContext", {}).get("http", {}).get("method", "")
    if http_method == "OPTIONS" or event.get("httpMethod") == "OPTIONS":
        return {
            "statusCode": 200,
            "body": "",
            "headers": get_cors_headers(),
        }
    
    path_params = event.get("pathParameters") or {}
    file_id = path_params.get("fileId")
    
    if not file_id:
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "fileId is required"}),
            "headers": get_cors_headers(),
        }
    
    timestamp = int(time.time() * 1000)
    iso_timestamp = datetime.utcnow().isoformat() + 'Z'
    
    files_table = dynamodb.Table(FILES_TABLE)
    catalog_products_table = dynamodb.Table(CATALOG_PRODUCTS_TABLE)
    
    try:
        # Update file status to completed
        files_table.update_item(
            Key={"fileId": file_id},
            UpdateExpression="SET #status = :status, #updatedAt = :updatedAt, #updatedAtIso = :updatedAtIso",
            ExpressionAttributeNames={
                "#status": "status",
                "#updatedAt": "updatedAt",
                "#updatedAtIso": "updatedAtIso",
            },
            ExpressionAttributeValues={
                ":status": "completed",
                ":updatedAt": timestamp,
                ":updatedAtIso": iso_timestamp,
            },
        )
        print(f"[complete_file_review] Updated file {file_id} status to completed")
        
        # Update catalog products status to completed
        try:
            catalog_products_table.update_item(
                Key={"fileId": file_id},
                UpdateExpression="SET #status = :status, #updatedAt = :updatedAt",
                ExpressionAttributeNames={
                    "#status": "status",
                    "#updatedAt": "updatedAt",
                },
                ExpressionAttributeValues={
                    ":status": "completed",
                    ":updatedAt": timestamp,
                },
            )
            print(f"[complete_file_review] Updated catalog products {file_id} status to completed")
        except Exception as e:
            print(f"[complete_file_review] WARNING: Failed to update catalog products status: {e}")
            # Don't fail the whole operation if catalog products update fails
        
        return {
            "statusCode": 200,
            "body": json.dumps({
                "fileId": file_id,
                "status": "completed",
                "message": "File review completed successfully"
            }),
            "headers": get_cors_headers(),
        }
        
    except Exception as e:
        print(f"[complete_file_review] ERROR: Failed to complete file review: {e}")
        import traceback
        traceback.print_exc()
        return {
            "statusCode": 500,
            "body": json.dumps({"error": "Failed to complete file review"}),
            "headers": get_cors_headers(),
        }
