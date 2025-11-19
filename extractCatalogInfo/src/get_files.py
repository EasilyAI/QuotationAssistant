import json
import os
import uuid
import time

import boto3

from utils.corsHeaders import get_cors_headers

dynamodb = boto3.resource("dynamodb")

FILES_TABLE = os.environ.get("FILES_TABLE", "hb-files")
CATALOG_PRODUCTS_TABLE = os.environ.get("CATALOG_PRODUCTS_TABLE", "hb-catalog-products")


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
    table = dynamodb.Table(CATALOG_PRODUCTS_TABLE)
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
