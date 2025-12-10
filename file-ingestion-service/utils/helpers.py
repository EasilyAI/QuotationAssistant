from decimal import Decimal


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


def convert_decimals_to_native(obj):
    """
    Recursively convert Decimal values returned by DynamoDB into native
    Python types that are JSON serializable.
    
    Args:
        obj: Object to convert (dict, list, or primitive)
    
    Returns:
        Object of the same structure with Decimal values converted to int/float
    """
    if isinstance(obj, list):
        return [convert_decimals_to_native(item) for item in obj]
    elif isinstance(obj, dict):
        return {key: convert_decimals_to_native(value) for key, value in obj.items()}
    elif isinstance(obj, Decimal):
        # Preserve integers when there is no fractional part
        if obj == obj.to_integral_value():
            return int(obj)
        return float(obj)
    else:
        return obj