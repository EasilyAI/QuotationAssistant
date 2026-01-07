"""
Shared product type helpers used across services.
"""

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, TypedDict


def _decode_attr(attr: Any) -> Any:
    """Decode a DynamoDB Stream attribute value into plain Python types."""
    if not isinstance(attr, dict):
        return attr

    if "S" in attr:
        return attr["S"]
    if "N" in attr:
        # Keep numbers as strings to avoid accidental float issues
        return attr["N"]
    if "BOOL" in attr:
        return attr["BOOL"]
    if "NULL" in attr:
        return None
    if "M" in attr:
        return {k: _decode_attr(v) for k, v in attr["M"].items()}
    if "L" in attr:
        return [_decode_attr(v) for v in attr["L"]]

    return attr


def decode_dynamo_image(image: Dict[str, Any]) -> Dict[str, Any]:
    """Decode a DynamoDB stream image (NewImage/OldImage)."""
    return {k: _decode_attr(v) for k, v in (image or {}).items()}


def strip_catalog_snapshots(catalog_products: Optional[List[Dict[str, Any]]]) -> List[Dict[str, Any]]:
    """Remove heavy snapshot payloads from catalog product pointers."""
    cleaned: List[Dict[str, Any]] = []
    if not catalog_products:
        return cleaned

    for item in catalog_products:
        if not isinstance(item, dict):
            continue
        copy = dict(item)
        copy.pop("snapshot", None)
        cleaned.append(copy)

    return cleaned


@dataclass
class ProductRecord:
    """Canonical product record shared between services."""

    orderingNumber: str
    productCategory: str = ""
    oneLiner: str = ""
    specs: str = ""
    manualNotes: str = ""
    catalogProducts: List[Dict[str, Any]] = field(default_factory=list)
    priceListPointers: List[Dict[str, Any]] = field(default_factory=list)
    salesDrawings: List[Dict[str, Any]] = field(default_factory=list)
    createdAt: Optional[int] = None
    updatedAt: Optional[int] = None
    createdAtIso: Optional[str] = None
    updatedAtIso: Optional[str] = None

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "ProductRecord":
        return cls(
            orderingNumber=data.get("orderingNumber", ""),
            productCategory=data.get("productCategory", data.get("category", "")) or "",
            oneLiner=data.get("oneLiner", ""),
            specs=data.get("specs", ""),
            manualNotes=data.get("manualNotes", ""),
            catalogProducts=strip_catalog_snapshots(data.get("catalogProducts")),
            priceListPointers=data.get("priceListPointers", []) or [],
            salesDrawings=data.get("salesDrawings", []) or [],
            createdAt=data.get("createdAt"),
            updatedAt=data.get("updatedAt"),
            createdAtIso=data.get("createdAtIso"),
            updatedAtIso=data.get("updatedAtIso"),
        )

    @classmethod
    def from_stream_image(cls, image: Dict[str, Any]) -> "ProductRecord":
        decoded = decode_dynamo_image(image)
        return cls.from_dict(decoded)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "orderingNumber": self.orderingNumber,
            "productCategory": self.productCategory,
            "oneLiner": self.oneLiner,
            "specs": self.specs,
            "manualNotes": self.manualNotes,
            "catalogProducts": self.catalogProducts,
            "priceListPointers": self.priceListPointers,
            "salesDrawings": self.salesDrawings,
            "createdAt": self.createdAt,
            "updatedAt": self.updatedAt,
            "createdAtIso": self.createdAtIso,
            "updatedAtIso": self.updatedAtIso,
        }


class CurrentPrice(TypedDict, total=False):
    """Most recent price metadata resolved from price lists."""

    price: Any
    description: str
    SwagelokLink: str
    year: str
    fileId: str
    sourceFile: str
    addedAt: int
    addedAtIso: str


class CatalogProductLocation(TypedDict, total=False):
    """Location information for a catalog product."""

    page: Optional[int]
    boundingBox: Optional[Dict[str, Any]]


class CatalogProductSnapshot(TypedDict, total=False):
    """Snapshot of catalog product data stored in pointer."""

    id: Optional[int]
    orderingNumber: str
    description: Optional[str]
    manualInput: Optional[str]
    specs: Optional[Dict[str, Any]]
    location: Optional[CatalogProductLocation]
    status: Optional[str]
    tindex: Optional[int]


class CatalogProductPointer(TypedDict, total=False):
    """Pointer to a catalog product source."""

    fileId: str
    fileKey: Optional[str]
    fileName: Optional[str]
    orderingNumber: str
    productId: Optional[int]
    tableIndex: Optional[int]
    snapshot: Optional[CatalogProductSnapshot]


class PriceListPointer(TypedDict, total=False):
    """Pointer to a price list entry."""

    fileId: str
    chunkIndex: int
    year: Optional[str]
    addedAt: Optional[int]
    addedAtIso: Optional[str]


class SalesDrawingPointer(TypedDict, total=False):
    """Sales drawing reference."""

    fileId: str
    fileKey: str
    fileName: Optional[str]
    manufacturer: Optional[str]
    notes: Optional[str]


class Product(TypedDict, total=False):
    """
    Canonical product record stored in Products table (pointer only).

    Structure matches the pointer-based record stored in DynamoDB.
    """

    orderingNumber: str
    productCategory: str
    catalogProducts: Optional[List[CatalogProductPointer]]
    priceListPointers: Optional[List[PriceListPointer]]
    salesDrawings: Optional[List[SalesDrawingPointer]]
    createdAt: Optional[int]
    updatedAt: Optional[int]
    createdAtIso: Optional[str]
    updatedAtIso: Optional[str]


class ProductData(TypedDict, total=False):
    """Fully resolved product payload returned to callers."""

    orderingNumber: str
    productCategory: str
    oneLiner: str
    specs: str
    manualNotes: str
    catalogProducts: List[Dict[str, Any]]
    priceListPointers: List[Dict[str, Any]]
    salesDrawings: List[Dict[str, Any]]
    createdAt: Optional[int]
    updatedAt: Optional[int]
    createdAtIso: Optional[str]
    updatedAtIso: Optional[str]
    currentPrice: Optional[CurrentPrice]

