"""
Product data model schemas.
"""

import os
import sys
from typing import Dict, Any

# Make shared types importable
CURRENT_DIR = os.path.dirname(__file__)
SERVICE_ROOT = os.path.abspath(os.path.join(CURRENT_DIR, ".."))
SHARED_DIR = os.path.abspath(os.path.join(SERVICE_ROOT, "..", "shared"))
if SHARED_DIR not in sys.path:
    sys.path.append(SHARED_DIR)

from shared.product_types import ProductRecord, decode_dynamo_image  # noqa: E402


class Product(ProductRecord):
    """Thin wrapper around shared ProductRecord for backward compatibility."""

    @classmethod
    def from_dynamodb(cls, item: Dict[str, Any]) -> "Product":
        return cls.from_dict(item)

    @classmethod
    def from_dynamodb_stream(cls, dynamodb_record: Dict[str, Any]) -> "Product":
        decoded = decode_dynamo_image(dynamodb_record)
        return cls.from_dict(decoded)