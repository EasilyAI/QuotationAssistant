"""
Shared input validation utilities for security.
"""

import re
import os
from typing import Optional, Tuple
from urllib.parse import unquote


# Maximum lengths for various inputs
MAX_FILENAME_LENGTH = 255
MAX_STRING_LENGTH = 1000
MAX_FILE_ID_LENGTH = 100
MAX_ORDERING_NUMBER_LENGTH = 100
MAX_SERIAL_NUMBER_LENGTH = 100
MAX_NOTES_LENGTH = 5000

# Allowed file extensions
ALLOWED_FILE_EXTENSIONS = {'.pdf', '.xlsx', '.xls', '.doc', '.docx', '.txt'}

# Maximum file size (10MB)
MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024


def sanitize_filename(filename: str) -> Tuple[bool, Optional[str], Optional[str]]:
    """
    Sanitize and validate filename to prevent path traversal attacks.
    
    Args:
        filename: Original filename
        
    Returns:
        Tuple of (is_valid, sanitized_filename, error_message)
    """
    if not filename or not isinstance(filename, str):
        return False, None, "Filename is required and must be a string"
    
    if len(filename) > MAX_FILENAME_LENGTH:
        return False, None, f"Filename too long (max {MAX_FILENAME_LENGTH} characters)"
    
    # Remove path traversal attempts
    if '..' in filename or '/' in filename or '\\' in filename:
        return False, None, "Filename contains invalid characters (path traversal attempt)"
    
    # Remove null bytes
    if '\x00' in filename:
        return False, None, "Filename contains null bytes"
    
    # Remove leading/trailing whitespace and dots
    sanitized = filename.strip().strip('.')
    
    if not sanitized:
        return False, None, "Filename cannot be empty"
    
    # Check for allowed characters (alphanumeric, spaces, dashes, underscores, dots)
    if not re.match(r'^[a-zA-Z0-9\s\-_\.]+$', sanitized):
        return False, None, "Filename contains invalid characters"
    
    return True, sanitized, None


def validate_file_id(file_id: str) -> Tuple[bool, Optional[str]]:
    """
    Validate file ID (should be UUID format).
    
    Args:
        file_id: File ID to validate
        
    Returns:
        Tuple of (is_valid, error_message)
    """
    if not file_id or not isinstance(file_id, str):
        return False, "File ID is required and must be a string"
    
    if len(file_id) > MAX_FILE_ID_LENGTH:
        return False, f"File ID too long (max {MAX_FILE_ID_LENGTH} characters)"
    
    # UUID format: 8-4-4-4-12 hex characters
    uuid_pattern = r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    if not re.match(uuid_pattern, file_id.lower()):
        return False, "Invalid file ID format (must be UUID)"
    
    return True, None


def validate_ordering_number(ordering_number: str) -> Tuple[bool, Optional[str]]:
    """
    Validate ordering number.
    
    Args:
        ordering_number: Ordering number to validate
        
    Returns:
        Tuple of (is_valid, error_message)
    """
    if not ordering_number:
        return True, None  # Optional field
    
    if not isinstance(ordering_number, str):
        return False, "Ordering number must be a string"
    
    if len(ordering_number) > MAX_ORDERING_NUMBER_LENGTH:
        return False, f"Ordering number too long (max {MAX_ORDERING_NUMBER_LENGTH} characters)"
    
    # Allow alphanumeric, spaces, dashes, underscores
    if not re.match(r'^[a-zA-Z0-9\s\-_]+$', ordering_number):
        return False, "Ordering number contains invalid characters"
    
    return True, None


def validate_string_input(value: str, field_name: str, max_length: int = MAX_STRING_LENGTH, required: bool = False) -> Tuple[bool, Optional[str]]:
    """
    Generic string input validation.
    
    Args:
        value: String value to validate
        field_name: Name of the field (for error messages)
        max_length: Maximum allowed length
        required: Whether the field is required
        
    Returns:
        Tuple of (is_valid, error_message)
    """
    if not value:
        if required:
            return False, f"{field_name} is required"
        return True, None
    
    if not isinstance(value, str):
        return False, f"{field_name} must be a string"
    
    if len(value) > max_length:
        return False, f"{field_name} too long (max {max_length} characters)"
    
    # Check for null bytes
    if '\x00' in value:
        return False, f"{field_name} contains null bytes"
    
    return True, None


def validate_file_type(file_extension: str) -> Tuple[bool, Optional[str]]:
    """
    Validate file extension.
    
    Args:
        file_extension: File extension (with or without dot)
        
    Returns:
        Tuple of (is_valid, error_message)
    """
    if not file_extension:
        return False, "File type is required"
    
    # Normalize extension
    ext = file_extension.lower().strip()
    if not ext.startswith('.'):
        ext = '.' + ext
    
    if ext not in ALLOWED_FILE_EXTENSIONS:
        return False, f"File type not allowed. Allowed types: {', '.join(ALLOWED_FILE_EXTENSIONS)}"
    
    return True, None


def validate_file_size(file_size: int) -> Tuple[bool, Optional[str]]:
    """
    Validate file size.
    
    Args:
        file_size: File size in bytes
        
    Returns:
        Tuple of (is_valid, error_message)
    """
    if file_size <= 0:
        return False, "File size must be greater than 0"
    
    if file_size > MAX_FILE_SIZE_BYTES:
        max_mb = MAX_FILE_SIZE_BYTES / (1024 * 1024)
        return False, f"File too large (max {max_mb}MB)"
    
    return True, None


def sanitize_path_parameter(param: str, param_name: str) -> Tuple[bool, Optional[str], Optional[str]]:
    """
    Sanitize path parameter to prevent path traversal.
    
    Args:
        param: Path parameter value
        param_name: Name of parameter (for error messages)
        
    Returns:
        Tuple of (is_valid, sanitized_value, error_message)
    """
    if not param:
        return False, None, f"{param_name} is required"
    
    # URL decode if needed
    try:
        decoded = unquote(param)
    except Exception:
        decoded = param
    
    # Check for path traversal
    if '..' in decoded or '/' in decoded or '\\' in decoded:
        return False, None, f"{param_name} contains invalid characters (path traversal attempt)"
    
    # Check for null bytes
    if '\x00' in decoded:
        return False, None, f"{param_name} contains null bytes"
    
    return True, decoded, None

