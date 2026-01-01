"""
Input validation for quotation management API.
"""

from typing import Dict, Any, Optional, List
from .quotation_model import QuotationStatus, Currency, LineItemSource


def validate_quotation_status(status: str) -> bool:
    """Validate quotation status."""
    try:
        QuotationStatus(status)
        return True
    except ValueError:
        return False


def validate_currency(currency: str) -> bool:
    """Validate currency code."""
    try:
        Currency(currency)
        return True
    except ValueError:
        return False


def validate_line_item_source(source: str) -> bool:
    """Validate line item source."""
    try:
        LineItemSource(source)
        return True
    except ValueError:
        return False


def validate_create_quotation(data: Dict[str, Any]) -> tuple[bool, Optional[str]]:
    """
    Validate create quotation request.
    
    Returns:
        (is_valid, error_message)
    """
    if not isinstance(data, dict):
        return False, "Request body must be a JSON object"
    
    # Optional fields with defaults
    if "currency" in data and not validate_currency(data["currency"]):
        return False, f"Invalid currency: {data['currency']}"
    
    if "status" in data and not validate_quotation_status(data["status"]):
        return False, f"Invalid status: {data['status']}"
    
    if "vat_rate" in data:
        try:
            vat_rate = float(data["vat_rate"])
            if vat_rate < 0 or vat_rate > 1:
                return False, "vat_rate must be between 0 and 1"
        except (ValueError, TypeError):
            return False, "vat_rate must be a number"
    
    if "global_margin_pct" in data:
        try:
            margin = float(data["global_margin_pct"])
            if margin < 0 or margin > 1:
                return False, "global_margin_pct must be between 0 and 1"
        except (ValueError, TypeError):
            return False, "global_margin_pct must be a number"
    
    return True, None


def validate_update_quotation(data: Dict[str, Any]) -> tuple[bool, Optional[str]]:
    """
    Validate update quotation request.
    
    Returns:
        (is_valid, error_message)
    """
    if not isinstance(data, dict):
        return False, "Request body must be a JSON object"
    
    if "status" in data and not validate_quotation_status(data["status"]):
        return False, f"Invalid status: {data['status']}"
    
    if "currency" in data and not validate_currency(data["currency"]):
        return False, f"Invalid currency: {data['currency']}"
    
    if "vat_rate" in data:
        try:
            vat_rate = float(data["vat_rate"])
            if vat_rate < 0 or vat_rate > 1:
                return False, "vat_rate must be between 0 and 1"
        except (ValueError, TypeError):
            return False, "vat_rate must be a number"
    
    if "global_margin_pct" in data:
        try:
            margin = float(data["global_margin_pct"])
            if margin < 0 or margin > 1:
                return False, "global_margin_pct must be between 0 and 1"
        except (ValueError, TypeError):
            return False, "global_margin_pct must be a number"
    
    return True, None


def validate_line_item(data: Dict[str, Any]) -> tuple[bool, Optional[str]]:
    """
    Validate line item data.
    
    Returns:
        (is_valid, error_message)
    """
    if not isinstance(data, dict):
        return False, "Line item must be a JSON object"
    
    # product_name is optional - will default to 'Item' if not provided
    
    if "quantity" in data:
        try:
            quantity = float(data["quantity"])
            if quantity <= 0:
                return False, "quantity must be greater than 0"
        except (ValueError, TypeError):
            return False, "quantity must be a number"
    
    if "base_price" in data and data["base_price"] is not None:
        try:
            price = float(data["base_price"])
            if price < 0:
                return False, "base_price must be >= 0"
        except (ValueError, TypeError):
            return False, "base_price must be a number"
    
    if "margin_pct" in data and data["margin_pct"] is not None:
        try:
            margin = float(data["margin_pct"])
            if margin < 0 or margin > 1:
                return False, "margin_pct must be between 0 and 1"
        except (ValueError, TypeError):
            return False, "margin_pct must be a number"
    
    if "source" in data and not validate_line_item_source(data["source"]):
        return False, f"Invalid source: {data['source']}"
    
    return True, None


def validate_batch_lines(data: Dict[str, Any]) -> tuple[bool, Optional[str]]:
    """
    Validate batch add lines request.
    
    Returns:
        (is_valid, error_message)
    """
    if not isinstance(data, dict):
        return False, "Request body must be a JSON object"
    
    if "lines" not in data:
        return False, "lines array is required"
    
    if not isinstance(data["lines"], list):
        return False, "lines must be an array"
    
    if len(data["lines"]) == 0:
        return False, "lines array cannot be empty"
    
    for idx, line in enumerate(data["lines"]):
        is_valid, error = validate_line_item(line)
        if not is_valid:
            return False, f"Line {idx}: {error}"
    
    return True, None


def validate_replace_quotation_state(data: Dict[str, Any]) -> tuple[bool, Optional[str]]:
    """
    Validate replace quotation state request (full-state endpoint).
    
    This validates the payload for the PUT /quotations/{quotationId}/full-state endpoint,
    which replaces the entire quotation state atomically.
    
    Returns:
        (is_valid, error_message)
    """
    if not isinstance(data, dict):
        return False, "Request body must be a JSON object"
    
    # Required top-level fields
    if "metadata" not in data:
        return False, "metadata is required"
    
    if "lines" not in data:
        return False, "lines is required"
    
    # Validate metadata
    metadata = data["metadata"]
    if not isinstance(metadata, dict):
        return False, "metadata must be a JSON object"
    
    # Validate metadata fields (using existing validation logic)
    is_valid, error = validate_update_quotation(metadata)
    if not is_valid:
        return False, f"Metadata validation error: {error}"
    
    # Validate lines
    lines = data["lines"]
    if not isinstance(lines, list):
        return False, "lines must be an array"
    
    # Lines can be empty (allows clearing all items)
    for idx, line in enumerate(lines):
        is_valid, error = validate_line_item(line)
        if not is_valid:
            return False, f"Line {idx} validation error: {error}"
    
    return True, None

