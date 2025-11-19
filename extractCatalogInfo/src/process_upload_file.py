import json
import os
import uuid
import time

import boto3

from utils.incomingEventParser import parse_s3_key
from utils.corsHeaders import get_cors_headers
from utils.helpers import convert_floats_to_decimal

s3 = boto3.client("s3")
dynamodb = boto3.resource("dynamodb")
s3_client = boto3.client("s3")

BUCKET = "hb-files-raw"
AWS_REGION = "us-east-1"
# BUCKET = os.environ["UPLOAD_BUCKET"]
FILES_TABLE = os.environ["FILES_TABLE"]
CATALOG_PRODUCTS_TABLE = os.environ.get("CATALOG_PRODUCTS_TABLE", "hb-catalog-products")

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


def save_products_to_catalog_products_table(file_id, s3_key, event_payloads):
    """
    Save extracted products to catalog products table for review.
    Stores ALL products as ONE document with fileId as the primary key.
    
    Args:
        file_id: File ID associated with these products
        s3_key: S3 key of the source file
        event_payloads: List of dictionaries containing products keyed by ordering number
    
    Returns:
        int: Number of products saved
    """
    table = dynamodb.Table(CATALOG_PRODUCTS_TABLE)
    timestamp = int(time.time() * 1000)
    
    print(f"[save_products_to_catalog_products_table] Starting to process {len(event_payloads)} event payloads")
    
    # Build a single products list from all event payloads
    all_products = []
    
    for table_idx, products_dict in enumerate(event_payloads):
        print(f"[save_products_to_catalog_products_table] Processing event_payload {table_idx}: {len(products_dict)} products in this payload")
        
        for ordering_number, product_data in products_dict.items():
            try:
                print(f"[save_products_to_catalog_products_table] Processing product: {ordering_number}")
                
                # Convert any float values to Decimal for DynamoDB
                product_item = {
                    "orderingNumber": ordering_number,
                    "tableIndex": table_idx,
                    "status": "pending_review",  # pending_review, approved, rejected
                }
                
                # Add specs if present (convert floats to Decimal)
                if "specs" in product_data and product_data["specs"]:
                    product_item["specs"] = convert_floats_to_decimal(product_data["specs"])
                    print(f"[save_products_to_catalog_products_table]   - Added {len(product_data['specs'])} specs")
                
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
                print(f"[save_products_to_catalog_products_table]   - Product added successfully. Total products so far: {len(all_products)}")
                
            except Exception as e:
                print(f"[save_products_to_catalog_products_table] ERROR: Failed to process product {ordering_number}: {e}")
                print(f"[save_products_to_catalog_products_table] Product data: {product_data}")
                import traceback
                traceback.print_exc()
    
    print(f"[save_products_to_catalog_products_table] Finished processing all payloads. Total products collected: {len(all_products)}")
    
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
        
        print(f"[save_products_to_catalog_products_table] Attempting to save document with {len(all_products)} products to DynamoDB...")
        table.put_item(Item=document)
        print(f"[save_products_to_catalog_products_table] SUCCESS: Saved {len(all_products)} products as one document with fileId: {file_id}")
        return len(all_products)
        
    except Exception as e:
        print(f"[save_products_to_catalog_products_table] ERROR: Failed to save products document: {e}")
        import traceback
        traceback.print_exc()
        return 0




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
            
            products_saved = save_products_to_catalog_products_table(file_id, s3_key, event_payloads)
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