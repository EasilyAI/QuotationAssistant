import json

def normalize_file_name(file_name:str) -> str:
    """ Normalize a file name to a lowercase string with underscores instead of spaces and dashes"""
    
    normalized_file_name = file_name.lower().replace(" ","_").replace("-","_").strip()
    print(f"[normalize_file_name] Normalized file name: {normalized_file_name} from {file_name}")
    return normalized_file_name


def normalize_catalog_serial_number(catalog_serial_number:str) -> str:
    """ Normalize a catalog serial number to an uppercase string with dashes instead of spaces"""
    
    if catalog_serial_number is None:
        return None
    
    normalized_catalog_serial_number = catalog_serial_number.upper().replace(" ","-").strip()
    print(f"[normalize_catalog_serial_number] Normalized catalog serial number: {normalized_catalog_serial_number} from {catalog_serial_number}")
    
    return normalized_catalog_serial_number

def build_file_details(file_item):
    """
    Normalize a file item from DynamoDB into a compact, JSON-safe details object
    that the frontend and other backend functions can use consistently.

    This is shared between:
    - process_upload_file (for returning file info)
    - get_files.check_file_exists (for duplicate-prevention responses)
    """
    # Convert any non-JSON types (e.g. Decimal) to strings first
    item = json.loads(json.dumps(file_item, default=str))

    # Prefer displayName as the primary human-readable name, with fallbacks
    display_name = (
        item.get("displayName")
        or item.get("fileName")
        or item.get("uploadedFileName")
    )

    return {
        "fileId": item.get("fileId"),
        # Primary name used by the frontend duplicate message builder
        "fileName": display_name,
        # Keep displayName as well for UI usage
        "displayName": display_name,
        "uploadedFileName": item.get("uploadedFileName"),
        "fileType": item.get("fileType", ""),  # PDF / XLSX / etc
        "businessFileType": item.get("businessFileType", ""),
        "status": item.get("status", "unknown"),
        "createdAt": item.get("createdAt"),
        "year": item.get("year"),
        "catalogSerialNumber": item.get("catalogSerialNumber"),
        "productCategory": item.get("productCategory"),
        "orderingNumber": item.get("orderingNumber"),
        "manufacturer": item.get("manufacturer"),
        "description": item.get("description"),
    }


