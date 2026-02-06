import urllib.parse


def parse_s3_key(event):
    """
    Parse an S3 event and extract the S3 object key.
    Handles URL-encoded keys (e.g., special characters like @, spaces, etc.)
    
    Args:
        event: The S3 event dictionary containing Records array
        
    Returns:
        str: The S3 object key, URL-decoded (e.g., "uploads/MS-01-179.pdf.pdf")
        
    Raises:
        ValueError: If the event structure is invalid or key cannot be found
    """
    if not event:
        raise ValueError("Event is None or empty")
    
    records = event.get("Records")
    if not records:
        raise ValueError("Event does not contain 'Records' field")
    
    if len(records) == 0:
        raise ValueError("Records array is empty")
    
    # Get the first record (most common case)
    first_record = records[0]
    
    s3_data = first_record.get("s3")
    if not s3_data:
        raise ValueError("Record does not contain 's3' field")
    
    object_data = s3_data.get("object")
    if not object_data:
        raise ValueError("S3 data does not contain 'object' field")
    
    key = object_data.get("key")
    if not key:
        raise ValueError("S3 object does not contain 'key' field")
    
    # URL-decode the key to handle special characters
    # S3 event keys are URL-encoded, so we need to decode them
    try:
        decoded_key = urllib.parse.unquote(key, encoding='utf-8')
        # Handle plus signs as spaces (common in URL encoding)
        decoded_key = decoded_key.replace('+', ' ')
        return decoded_key
    except Exception as e:
        # If decoding fails, return the original key
        print(f"[parse_s3_key] WARNING: Failed to decode S3 key '{key}': {e}, using original key")
        return key

