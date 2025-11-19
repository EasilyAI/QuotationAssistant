import json
import os
import uuid
import time

import boto3

from utils.incomingEventParser import parse_s3_key

s3 = boto3.client("s3")
dynamodb = boto3.resource("dynamodb")
s3_client = boto3.client("s3")

BUCKET = "hb-files-raw"
AWS_REGION = "us-east-1"
# BUCKET = os.environ["UPLOAD_BUCKET"]
FILES_TABLE = os.environ["FILES_TABLE"]
TEMP_PRODUCTS_TABLE = os.environ.get("TEMP_PRODUCTS_TABLE", "hb-temp-products")

# CORS headers helper
def get_cors_headers():
    return {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",  # TODO: Replace with specific origin in production (e.g., "http://localhost:3000")
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
        "Access-Control-Max-Age": "3600",
    }

def get_file_record(file_id):
    """
    Get file record from DynamoDB including form data stored in metadata.
    
    Args:
        file_id: File ID to retrieve
    
    Returns:
        dict: File record from DynamoDB, or None if not found
    """
    table = dynamodb.Table(FILES_TABLE)
    try:
        response = table.get_item(Key={"fileId": file_id})
        if "Item" in response:
            return response["Item"]
        return None
    except Exception as e:
        print(f"[get_file_record] ERROR: Failed to get file record: {e}")
        return None


def update_file_status(file_id, status, **kwargs):
    """
    Update file processing status in DynamoDB.
    
    Args:
        file_id: File ID to update
        status: Processing status (processing, completed, failed, etc.)
        **kwargs: Additional attributes to update (metadata, error messages, etc.)
    """
    table = dynamodb.Table(FILES_TABLE)
    
    update_expression_parts = ["#status = :status", "#updatedAt = :updatedAt"]
    expression_attribute_names = {
        "#status": "status",
        "#updatedAt": "updatedAt"
    }
    expression_attribute_values = {
        ":status": status,
        ":updatedAt": int(time.time() * 1000)  # Timestamp in milliseconds
    }
    
    # Add any additional attributes from kwargs
    for key, value in kwargs.items():
        attr_name = f"#{key}"
        attr_value = f":{key}"
        update_expression_parts.append(f"{attr_name} = {attr_value}")
        expression_attribute_names[attr_name] = key
        expression_attribute_values[attr_value] = value
    
    update_expression = "SET " + ", ".join(update_expression_parts)
    
    try:
        table.update_item(
            Key={"fileId": file_id},
            UpdateExpression=update_expression,
            ExpressionAttributeNames=expression_attribute_names,
            ExpressionAttributeValues=expression_attribute_values
        )
        print(f"[update_file_status] Updated file {file_id} with status: {status}")
    except Exception as e:
        print(f"[update_file_status] ERROR: Failed to update file status: {e}")


def convert_floats_to_decimal(obj):
    """
    Recursively convert all float values to Decimal for DynamoDB compatibility.
    
    Args:
        obj: Object to convert (dict, list, or primitive)
    
    Returns:
        Converted object with Decimal instead of float
    """
    if isinstance(obj, list):
        return [convert_floats_to_decimal(item) for item in obj]
    elif isinstance(obj, dict):
        return {key: convert_floats_to_decimal(value) for key, value in obj.items()}
    elif isinstance(obj, float):
        return Decimal(str(obj))
    else:
        return obj


def save_products_to_temp_table(file_id, s3_key, event_payloads):
    """
    Save extracted products to temporary products table for review.
    Stores ALL products as ONE document with fileId as the primary key.
    
    Args:
        file_id: File ID associated with these products
        s3_key: S3 key of the source file
        event_payloads: List of dictionaries containing products keyed by ordering number
    
    Returns:
        int: Number of products saved
    """
    table = dynamodb.Table(TEMP_PRODUCTS_TABLE)
    timestamp = int(time.time() * 1000)
    
    print(f"[save_products_to_temp_table] Starting to process {len(event_payloads)} event payloads")
    
    # Build a single products list from all event payloads
    all_products = []
    
    for table_idx, products_dict in enumerate(event_payloads):
        print(f"[save_products_to_temp_table] Processing event_payload {table_idx}: {len(products_dict)} products in this payload")
        
        for ordering_number, product_data in products_dict.items():
            try:
                print(f"[save_products_to_temp_table] Processing product: {ordering_number}")
                
                # Convert any float values to Decimal for DynamoDB
                product_item = {
                    "orderingNumber": ordering_number,
                    "tableIndex": table_idx,
                    "status": "pending_review",  # pending_review, approved, rejected
                }
                
                # Add specs if present (convert floats to Decimal)
                if "specs" in product_data and product_data["specs"]:
                    product_item["specs"] = convert_floats_to_decimal(product_data["specs"])
                    print(f"[save_products_to_temp_table]   - Added {len(product_data['specs'])} specs")
                
                # Add location if present (convert floats to Decimal)
                if "location" in product_data and product_data["location"]:
                    product_item["location"] = convert_floats_to_decimal(product_data["location"])
                
                # Add tindex if present
                if "tindex" in product_data:
                    product_item["tindex"] = product_data["tindex"]
                
                # Add id if present
                if "id" in product_data:
                    product_item["id"] = product_data["id"]
                
                all_products.append(product_item)
                print(f"[save_products_to_temp_table]   - Product added successfully. Total products so far: {len(all_products)}")
                
            except Exception as e:
                print(f"[save_products_to_temp_table] ERROR: Failed to process product {ordering_number}: {e}")
                print(f"[save_products_to_temp_table] Product data: {product_data}")
                import traceback
                traceback.print_exc()
    
    print(f"[save_products_to_temp_table] Finished processing all payloads. Total products collected: {len(all_products)}")
    
    # Save all products as ONE document with fileId as the key
    try:
        document = {
            "fileId": file_id,
            "sourceFile": s3_key,
            "createdAt": timestamp,
            "updatedAt": timestamp,
            "products": all_products,
            "productsCount": len(all_products)
        }
        
        print(f"[save_products_to_temp_table] Attempting to save document with {len(all_products)} products to DynamoDB...")
        table.put_item(Item=document)
        print(f"[save_products_to_temp_table] SUCCESS: Saved {len(all_products)} products as one document with fileId: {file_id}")
        return len(all_products)
        
    except Exception as e:
        print(f"[save_products_to_temp_table] ERROR: Failed to save products document: {e}")
        import traceback
        traceback.print_exc()
        return 0


def get_file_info(event, context):
    """
    Get file processing information from DynamoDB.
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


def get_file_products(event, context):
    """
    Get all products for a file from the temporary products table.
    Returns the products document containing all products for the given fileId.
    """
    # Handle OPTIONS preflight request
    http_method = event.get("requestContext", {}).get("http", {}).get("method", "")
    if http_method == "OPTIONS" or event.get("httpMethod") == "OPTIONS":
        return {
            "statusCode": 200,
            "body": "",
            "headers": get_cors_headers(),
        }
    
    # Extract fileId from path parameters
    path_params = event.get("pathParameters") or {}
    file_id = path_params.get("fileId")
    
    if not file_id:
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "fileId is required"}),
            "headers": get_cors_headers(),
        }
    
    # Get products document from temp table (single document with fileId as key)
    table = dynamodb.Table(TEMP_PRODUCTS_TABLE)
    try:
        # Get the single document by fileId
        response = table.get_item(
            Key={"fileId": file_id}
        )
        
        if "Item" not in response:
            print(f"[get_file_products] No products found for file {file_id}")
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
        
        # Convert entire document (including Decimal types) to JSON-serializable format
        document_json = json.loads(json.dumps(document, default=str))
        
        products = document_json.get("products", [])
        
        print(f"[get_file_products] Found {len(products)} products for file {file_id}")
        
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
        print(f"[get_file_products] ERROR: Failed to get products: {e}")
        return {
            "statusCode": 500,
            "body": json.dumps({"error": "Failed to get products"}),
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


def _build_file_details(file_item):
    """Helper function to build file details dictionary from DynamoDB item."""
    return {
        "fileId": file_item.get("fileId"),
        "uploadedFileName": file_item.get("uploadedFileName", ""),
        "displayName": file_item.get("displayName", ""),
        "fileType": file_item.get("fileType", ""),  # PDF / XLSX / etc
        "businessFileType": file_item.get("businessFileType", ""),
        "status": file_item.get("status", "unknown"),
        "createdAt": file_item.get("createdAt"),
        "year": file_item.get("year"),
        "catalogSerialNumber": file_item.get("catalogSerialNumber"),
        "productCategory": file_item.get("productCategory"),
        "orderingNumber": file_item.get("orderingNumber"),
        "manufacturer": file_item.get("manufacturer"),
        "description": file_item.get("description"),
    }

from utils.textractClient import start_job, is_job_complete, get_job_results
from utils.textractParser import (
    convert_pages_to_blocks,
    build_block_maps,
    get_special_cells_texts,
    get_header_row_count,
    convert_table_block_to_grid,
    has_ordering_number_header,
    convert_grid_to_catalog_products
)
from decimal import Decimal

def process_uploaded_file(event, context):
    """
    Process uploaded PDF file through AWS Textract to extract catalog product tables.
    Updates DynamoDB status at each step and saves products to temp table.
    
    Workflow:
    1. Parse S3 key and get file ID from S3 metadata
    2. Filter: Only process PDF files (skip JSON results)
    3. Update status: textract_started
    4. Start Textract analysis job
    5. Wait for job completion (update status periodically)
    6. Update status: textract_completed
    7. Retrieve and save Textract results to S3
    8. Update status: parsing_tables
    9. Parse table blocks from results
    10. Convert relevant tables to catalog products
    11. Save products to temp table
    12. Update status: completed with full metadata
    """
    file_id = None
    s3_key = None
    
    try:
        print(f"[process_uploaded_file] Starting file processing")
        print(f"[process_uploaded_file] Event: {json.dumps(event)}")
        
        # Step 1: Parse S3 key
        s3_key = parse_s3_key(event)
        print(f"[process_uploaded_file] Parsed S3 key: {s3_key}")
        
        # Step 2: Filter - Only process PDF files, skip JSON results
        if s3_key.endswith('.json'):
            print(f"[process_uploaded_file] Skipping JSON file: {s3_key}")
            return {
                "statusCode": 200,
                "body": json.dumps({"message": "Skipped JSON file"}),
            }
        
        if not s3_key.lower().endswith('.pdf'):
            print(f"[process_uploaded_file] WARNING: Non-PDF file uploaded: {s3_key}")
            # Continue processing anyway, but log warning
        
        # Step 3: Get file ID from S3 object metadata
        try:
            s3_response = s3_client.head_object(Bucket=BUCKET, Key=s3_key)
            file_id = s3_response.get('Metadata', {}).get('file-id')
            
            if not file_id:
                # Fallback: use filename without extension as fileId
                filename = s3_key.split('/')[-1]
                file_id = filename.rsplit('.', 1)[0]
                print(f"[process_uploaded_file] WARNING: No file-id in S3 metadata, using filename as fileId: {file_id}")
            else:
                print(f"[process_uploaded_file] Retrieved file ID from S3 metadata: {file_id}")
                
        except Exception as e:
            print(f"[process_uploaded_file] ERROR: Failed to get S3 object metadata: {e}")
            # Fallback: use filename without extension as fileId
            filename = s3_key.split('/')[-1]
            file_id = filename.rsplit('.', 1)[0]
            print(f"[process_uploaded_file] Using filename as fileId: {file_id}")
        
        # Step 2: Update status - Textract started
        update_file_status(
            file_id=file_id,
            status="textract_started",
            processingStage="Starting Textract analysis",
            s3Key=s3_key
        )
        
        # Step 3: Start Textract job
        print(f"[process_uploaded_file] Starting Textract job for bucket={BUCKET}, key={s3_key}")
        job_id = start_job(BUCKET, s3_key, features=['TABLES'], region=AWS_REGION)
        print(f"[process_uploaded_file] Textract job started with JobId: {job_id}")
        
        update_file_status(
            file_id=file_id,
            status="textract_processing",
            processingStage="Textract analysis in progress",
            textractJobId=job_id
        )

        # Step 4: Wait for job completion with polling
        max_attempts = 60  # Increased for production (60 attempts * 2 seconds = 2 minutes max)
        attempt = 0
        status = is_job_complete(job_id, region=AWS_REGION)
        print(f"[process_uploaded_file] Initial job status: {status}")
        
        while status != "SUCCEEDED" and attempt < max_attempts:
            if status == "FAILED":
                print(f"[process_uploaded_file] ERROR: Textract job failed after {attempt} attempts")
                update_file_status(
                    file_id=file_id,
                    status="failed",
                    processingStage="Textract analysis failed",
                    error="Textract job failed"
                )
                return {
                    "statusCode": 500,
                    "body": json.dumps({"error": "Textract job failed", "fileId": file_id}),
                }
            
            # Update status every 5 attempts (every 10 seconds)
            if attempt > 0 and attempt % 5 == 0:
                update_file_status(
                    file_id=file_id,
                    status="textract_processing",
                    processingStage=f"Textract analysis in progress (attempt {attempt}/{max_attempts})"
                )
            
            print(f"[process_uploaded_file] Waiting for job completion (attempt {attempt + 1}/{max_attempts})...")
            time.sleep(2)
            status = is_job_complete(job_id, region=AWS_REGION)
            print(f"[process_uploaded_file] Job status: {status}")
            attempt += 1

        if status != "SUCCEEDED":
            print(f"[process_uploaded_file] ERROR: Job timed out after {max_attempts} attempts")
            update_file_status(
                file_id=file_id,
                status="failed",
                processingStage="Textract analysis timed out",
                error=f"Job timed out after {max_attempts} attempts"
            )
            return {
                "statusCode": 500,
                "body": json.dumps({"error": "Job timed out", "fileId": file_id}),
            }

        print(f"[process_uploaded_file] Textract job completed successfully")
        
        # Step 5: Update status - Textract completed
        update_file_status(
            file_id=file_id,
            status="textract_completed",
            processingStage="Textract analysis completed, retrieving results"
        )
        
        # Step 6: Retrieve Textract results
        print(f"[process_uploaded_file] Retrieving Textract results...")
        results_pages = get_job_results(job_id, region=AWS_REGION)
        pages_count = len(results_pages)
        print(f"[process_uploaded_file] Retrieved {pages_count} result pages from Textract")

        # Step 7: Save Textract results to S3 as JSON
        # Format: uploads/{file_name_no_extension}_textract_results.json
        # Example: uploads/ms-02-89.pdf -> uploads/ms-02-89_textract_results.json
        base_name = s3_key.rsplit('.', 1)[0]  # Remove extension
        textract_results_key = f"{base_name}_textract_results.json"
        print(f"[process_uploaded_file] Saving Textract results to S3: bucket={BUCKET}, key={textract_results_key}")
        
        try:
            s3_client.put_object(
                Bucket=BUCKET,
                Key=textract_results_key,
                Body=json.dumps(results_pages, indent=2),
                ContentType="application/json",
                Metadata={
                    "description": "AWS Textract analysis results",
                    "original-file": s3_key,
                    "job-id": job_id
                }
            )
            print(f"[process_uploaded_file] Successfully saved Textract results to S3")
        except Exception as e:
            print(f"[process_uploaded_file] WARNING: Failed to save Textract results to S3: {e}")

        # Step 8: Update status - Parsing tables
        update_file_status(
            file_id=file_id,
            status="parsing_tables",
            processingStage="Parsing tables from Textract results",
            pagesCount=pages_count,
            textractResultsKey=textract_results_key
        )

        # Step 9: Parse blocks from Textract results
        print(f"[process_uploaded_file] Parsing blocks from Textract results...")
        all_blocks = convert_pages_to_blocks(results_pages)
        print(f"[process_uploaded_file] Total blocks parsed: {len(all_blocks)}")
        
        id_map, type_map = build_block_maps(all_blocks)
        print(f"[process_uploaded_file] Built block maps - total IDs: {len(id_map)}, block types: {list(type_map.keys())}")
        
        table_blocks = type_map.get("TABLE", [])
        tables_count = len(table_blocks)
        print(f"[process_uploaded_file] Found {tables_count} table blocks in document")

        # Step 10: Process each table block
        event_payloads = []
        for tindex, tblock in enumerate(table_blocks):
            print(f"[process_uploaded_file] Processing table {tindex + 1}/{tables_count}")
            
            # Update status for every table processed
            if tindex % 5 == 0 or tindex == 0:  # Update every 5 tables or first table
                update_file_status(
                    file_id=file_id,
                    status="parsing_tables",
                    processingStage=f"Processing table {tindex + 1} of {tables_count}"
                )
            
            # Get special cells (headers, titles, etc.)
            special_types = get_special_cells_texts(tblock, id_map)
            table_title = special_types.get('TABLE_TITLE', [{}])[0].get('text', 'N/A') if special_types.get('TABLE_TITLE') else 'N/A'
            print(f"[process_uploaded_file] Table {tindex} title: {table_title}")
            
            # Determine header row count
            header_row_index = get_header_row_count(special_types.get('COLUMN_HEADER'))
            print(f"[process_uploaded_file] Table {tindex} header row count: {header_row_index}")

            # Convert table block to grid structure
            print(f"[process_uploaded_file] Converting table {tindex} to grid structure...")
            table_grid = convert_table_block_to_grid(tblock, id_map, replicate_data=True, header_scan_rows=header_row_index)
            print(f"[process_uploaded_file] Table {tindex} grid: {len(table_grid.get('headers', []))} columns, {len(table_grid.get('rows', []))} rows")
            
            # Check if table contains ordering number column
            ordering_number_index = has_ordering_number_header(table_grid.get('headers'))
            
            if ordering_number_index is not None:
                print(f"[process_uploaded_file] Table {tindex} contains ordering number at column index {ordering_number_index}")
                print(f"[process_uploaded_file] Converting table {tindex} to catalog products...")
                
                event_payload = convert_grid_to_catalog_products(table_grid, tblock, id_map, tindex, ordering_number_index)
                product_count = len(event_payload) if event_payload else 0
                print(f"[process_uploaded_file] Table {tindex} extracted {product_count} products")
                
                if event_payload:
                    event_payloads.append(event_payload)
            else:
                print(f"[process_uploaded_file] Table {tindex} does NOT contain ordering number header (Title: {table_title}) - skipping")

        tables_with_products = len(event_payloads)
        total_products = sum(len(payload) for payload in event_payloads)
        
        print(f"[process_uploaded_file] Processing complete - extracted {tables_with_products} tables with products")
        print(f"[process_uploaded_file] Total products across all tables: {total_products}")

        # Step 11: Save products to temp table
        if total_products > 0:
            update_file_status(
                file_id=file_id,
                status="saving_products",
                processingStage=f"Saving {total_products} products to database"
            )
            
            products_saved = save_products_to_temp_table(file_id, s3_key, event_payloads)
            print(f"[process_uploaded_file] Saved {products_saved} products to temp table")
        else:
            products_saved = 0
            print(f"[process_uploaded_file] No products found to save")

        # Step 12: Final status update - Completed
        update_file_status(
            file_id=file_id,
            status="completed",
            processingStage="Processing completed successfully",
            pagesCount=pages_count,
            tablesCount=tables_count,
            tablesWithProducts=tables_with_products,
            productsCount=total_products,
            textractJobId=job_id,
            textractResultsKey=textract_results_key
        )
        
        print(f"[process_uploaded_file] File processing completed successfully for file ID: {file_id}")

        return {
            "statusCode": 200,
            "body": json.dumps({
                "fileId": file_id,
                "productsCount": total_products,
                "metadata": {
                    "pages_count": pages_count,
                    "total_tables": tables_count,
                    "tables_with_products": tables_with_products,
                    "products_count": total_products,
                    "textract_results_key": textract_results_key,
                    "job_id": job_id
                }
            }),
        }
        
    except Exception as e:
        error_message = str(e)
        print(f"[process_uploaded_file] FATAL ERROR: {error_message}")
        print(f"[process_uploaded_file] Error type: {type(e).__name__}")
        
        # Update status to failed if we have a file_id
        if file_id:
            update_file_status(
                file_id=file_id,
                status="failed",
                processingStage="Processing failed with error",
                error=error_message
            )
        
        return {
            "statusCode": 500,
            "body": json.dumps({
                "error": error_message,
                "fileId": file_id,
                "s3Key": s3_key
            }),
        }