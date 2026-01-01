"""
Type definitions for DynamoDB table items.
These types enforce structure when reading/writing to DynamoDB tables.
"""

from typing import TypedDict, Optional, List, Dict, Any
from decimal import Decimal

from shared.product_types import (
    CatalogProductLocation,
    CatalogProductPointer,
    CatalogProductSnapshot,
    PriceListPointer,
    Product,
    SalesDrawingPointer,
)

# ============================================================================
# CATALOG PRODUCTS TABLE (hb-catalog-products)
# Temporary table for review before saving to Products table
# ============================================================================

class CatalogProductItem(TypedDict, total=False):
    """Individual catalog product in the review table."""
    id: Optional[int]
    orderingNumber: str
    description: Optional[str]
    manualInput: Optional[str]
    specs: Optional[Dict[str, Any]]
    location: Optional[CatalogProductLocation]
    status: str  # "pending_review", "approved", "rejected"
    tableIndex: int
    tindex: Optional[int]


class CatalogProductsDocument(TypedDict):
    """
    Document stored in catalog-products table.
    One document per file, containing all products from that file.
    """
    fileId: str  # Primary Key
    sourceFile: str
    createdAt: int
    updatedAt: int
    products: List[CatalogProductItem]
    productsCount: int


# ============================================================================
# PRICE LIST PRODUCTS TABLE (hb-price-list-products)
# Chunked storage of price list products
# ============================================================================

class PriceListProductItem(TypedDict, total=False):
    """Individual price list product."""
    orderingNumber: str
    description: Optional[str]
    price: Optional[Decimal]
    SwagelokLink: Optional[str]  # Product URL
    rowNumber: Optional[int]
    status: Optional[str]  # "valid" or "invalid"
    errors: Optional[List[str]]
    warnings: Optional[List[str]]
    inferredCategory: Optional[str]  # Inferred product category from description
    categoryMatchConfidence: Optional[str]  # "exact", "suggested", or "none"


class PriceListProductsChunk(TypedDict, total=False):
    """
    Chunk of price list products.
    Products are split into chunks to stay within DynamoDB's 400KB item limit.
    """
    fileId: str  # Partition Key
    chunkIndex: int  # Sort Key (0, 1, 2, ...)
    products: List[PriceListProductItem]
    productsInChunk: int
    updatedAt: int
    updatedAtIso: str
    
    # Metadata fields (only in chunk 0)
    sourceFile: Optional[str]
    createdAt: Optional[int]
    createdAtIso: Optional[str]
    totalProductsCount: Optional[int]
    totalChunks: Optional[int]


# ============================================================================
# PRODUCTS TABLE (hb-products)
# Canonical product records with ONLY pointers to source tables
# ============================================================================

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
    orderingNumber: str  # Primary key for matching in catalog-products table
    productId: Optional[int]  # Legacy field, less reliable
    tableIndex: Optional[int]  # Fallback identifier
    snapshot: Optional[CatalogProductSnapshot]


# PriceListPointer, SalesDrawingPointer, Product, and CatalogProductPointer are
# imported from shared.product_types to keep a single source of truth.


# ============================================================================
# FILES TABLE (hb-files)
# ============================================================================

class FileItem(TypedDict, total=False):
    """File metadata in files table."""
    fileId: str  # Primary Key
    s3Key: str
    fileName: str
    fileType: str  # "Catalog", "Price List", "Sales Drawing"
    status: str  # "processing", "pending_review", "completed", "failed", etc.
    uploadedAt: int
    uploadedAtIso: str
    updatedAt: Optional[int]
    processingStage: Optional[str]
    error: Optional[str]
    
    # Catalog-specific fields
    pagesCount: Optional[int]
    tablesCount: Optional[int]
    tablesWithProducts: Optional[int]
    productsCount: Optional[int]
    textractJobId: Optional[str]
    textractResultsKey: Optional[str]
    
    # Price list-specific fields
    validProductsCount: Optional[int]
    invalidProductsCount: Optional[int]
    totalErrors: Optional[int]
    totalWarnings: Optional[int]
    year: Optional[str]


# ============================================================================
# Type Guards and Validators
# ============================================================================

def validate_product_structure(item: Dict[str, Any]) -> bool:
    """
    Validate that a product item has the required structure.
    
    Args:
        item: Dictionary to validate
        
    Returns:
        True if valid, False otherwise
    """
    if not isinstance(item, dict):
        return False
    
    # Check required fields
    if "orderingNumber" not in item or not item["orderingNumber"]:
        return False
    
    if "productCategory" not in item:
        return False
    
    # DynamoDB doesn't allow empty strings in GSI key attributes
    # productCategory is used in ProductCategoryIndex
    if not item["productCategory"] or item["productCategory"].strip() == "":
        return False
    
    # Validate pointer arrays if present
    if "catalogProducts" in item:
        if not isinstance(item["catalogProducts"], list):
            return False
        for pointer in item["catalogProducts"]:
            if not isinstance(pointer, dict) or "fileId" not in pointer:
                return False
    
    if "priceListPointers" in item:
        if not isinstance(item["priceListPointers"], list):
            return False
        for pointer in item["priceListPointers"]:
            if not isinstance(pointer, dict) or "fileId" not in pointer or "chunkIndex" not in pointer:
                return False
    
    if "salesDrawings" in item:
        if not isinstance(item["salesDrawings"], list):
            return False
        for pointer in item["salesDrawings"]:
            if not isinstance(pointer, dict) or "fileId" not in pointer:
                return False
    
    return True


def create_product_item(
    ordering_number: str,
    product_category: str,
    catalog_products: Optional[List[CatalogProductPointer]] = None,
    price_list_pointers: Optional[List[PriceListPointer]] = None,
    sales_drawings: Optional[List[SalesDrawingPointer]] = None,
    created_at: Optional[int] = None,
    updated_at: Optional[int] = None,
    created_at_iso: Optional[str] = None,
    updated_at_iso: Optional[str] = None,
) -> Product:
    """
    Create a properly structured Product item for DynamoDB.
    
    Args:
        ordering_number: Product SKU (primary key)
        product_category: Product category (if empty, defaults to "UNCATEGORIZED")
        catalog_products: List of catalog product pointers
        price_list_pointers: List of price list pointers
        sales_drawings: List of sales drawing pointers
        created_at: Creation timestamp (milliseconds)
        updated_at: Update timestamp (milliseconds)
        created_at_iso: Creation timestamp (ISO format)
        updated_at_iso: Update timestamp (ISO format)
        
    Returns:
        Product item ready for DynamoDB
    """
    # DynamoDB doesn't allow empty strings in GSI key attributes
    # Use "UNCATEGORIZED" placeholder if category is empty (required for GSI)
    # Note: This is only used internally for DynamoDB compatibility
    # UI should not show UNCATEGORIZED as an option to users
    if not product_category or product_category.strip() == "":
        product_category = "UNCATEGORIZED"
    
    item: Product = {
        "orderingNumber": ordering_number,
        "productCategory": product_category,
    }
    
    if catalog_products is not None:
        item["catalogProducts"] = catalog_products
    
    if price_list_pointers is not None:
        item["priceListPointers"] = price_list_pointers
    
    if sales_drawings is not None:
        item["salesDrawings"] = sales_drawings
    
    if created_at is not None:
        item["createdAt"] = created_at
    
    if updated_at is not None:
        item["updatedAt"] = updated_at
    
    if created_at_iso is not None:
        item["createdAtIso"] = created_at_iso
    
    if updated_at_iso is not None:
        item["updatedAtIso"] = updated_at_iso
    
    return item

