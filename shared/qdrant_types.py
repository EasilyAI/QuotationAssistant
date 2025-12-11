"""
Shared Qdrant payload types.
"""

from typing import TypedDict


class ProductMetadata(TypedDict, total=False):
    """Payload stored alongside each Qdrant point."""

    orderingNumber: str
    productCategory: str
    searchText: str

