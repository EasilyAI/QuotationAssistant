def parse_s3_key(event):
    """
    Parse an S3 event and extract the S3 object key.
    
    Args:
        event: The S3 event dictionary containing Records array
        
    Returns:
        str: The S3 object key (e.g., "uploads/MS-01-179.pdf.pdf")
        
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
    
    return key

