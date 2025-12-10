"""
Common serialization helpers for DynamoDB data.
"""

from decimal import Decimal
from typing import Any


def convert_decimals_to_native(obj: Any) -> Any:
    """
    Recursively convert Decimal values returned by DynamoDB into JSON-safe
    native Python types.
    """
    if isinstance(obj, list):
        return [convert_decimals_to_native(item) for item in obj]
    if isinstance(obj, dict):
        return {key: convert_decimals_to_native(value) for key, value in obj.items()}
    if isinstance(obj, Decimal):
        # Preserve integers when there is no fractional part
        if obj == obj.to_integral_value():
            return int(obj)
        return float(obj)
    return obj

