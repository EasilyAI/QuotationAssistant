"""
Shared product retrieval utilities reused by API and indexer.
"""

import os
import json
from typing import Any, Dict, List, Optional

import boto3

from .product_types import ProductData, strip_catalog_snapshots
from .serialization import convert_decimals_to_native

# Configure DynamoDB client
# In Lambda, use IAM role (no profile). Locally, use profile if available.
is_lambda = bool(os.environ.get("LAMBDA_TASK_ROOT"))
dynamodb_endpoint = os.environ.get("DYNAMODB_ENDPOINT")
aws_profile = os.environ.get("AWS_PROFILE") or os.environ.get("AWS_DEFAULT_PROFILE")
region = os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION", "us-east-1")

if dynamodb_endpoint:
    # Use DynamoDB Local
    dynamodb = boto3.resource("dynamodb", endpoint_url=dynamodb_endpoint)
elif not is_lambda and aws_profile:
    # Use AWS profile (for local development only)
    session = boto3.Session(profile_name=aws_profile, region_name=region)
    dynamodb = session.resource("dynamodb")
else:
    # Use default AWS credentials (IAM role in Lambda, or env vars/credentials file locally)
    dynamodb = boto3.resource("dynamodb", region_name=region)

PRODUCT_TABLE = os.environ.get("PRODUCT_TABLE", "hb-products")
CATALOG_PRODUCTS_TABLE = os.environ.get("CATALOG_PRODUCTS_TABLE", "hb-catalog-products")
PRICE_LIST_PRODUCTS_TABLE = os.environ.get("PRICE_LIST_PRODUCTS_TABLE", "hb-pricelist-products")


# TODO: Deprecate in favor of convert_decimals_to_native
def _convert_decimals(value: Any) -> Any:
    """Recursively convert Decimal to int/float for JSON safety."""
    return convert_decimals_to_native(value)


def _resolve_catalog_product_pointers(
    catalog_product_pointers: List[Dict[str, Any]],
    ordering_number: str,
) -> List[Dict[str, Any]]:
    """Resolve catalog product pointers by fetching live data."""
    if not catalog_product_pointers:
        return []

    table = dynamodb.Table(CATALOG_PRODUCTS_TABLE)
    pointers_by_file: Dict[str, List[Dict[str, Any]]] = {}
    for pointer in catalog_product_pointers:
        file_id = pointer.get("fileId")
        if file_id:
            pointers_by_file.setdefault(file_id, []).append(pointer)

    resolved: List[Dict[str, Any]] = []

    for file_id, pointers in pointers_by_file.items():
        response = table.get_item(Key={"fileId": file_id})
        document = response.get("Item")
        if not document:
            resolved.extend(pointers)
            continue

        products = _convert_decimals(document.get("products", []))

        for pointer in pointers:
            table_index = pointer.get("tableIndex")
            product_id = pointer.get("productId")
            matched = next(
                (
                    p
                    for p in products
                    if p.get("orderingNumber") == ordering_number
                    or (table_index is not None and p.get("tableIndex") == table_index)
                    or (product_id is not None and p.get("id") == product_id)
                ),
                None,
            )

            if matched:
                resolved.append({**matched, "_fileId": file_id})
            else:
                resolved.append(pointer)

    return resolved


def _resolve_price_list_pointers(price_list_pointers: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Attach basic metadata to price list pointers."""
    if not price_list_pointers:
        print("[_resolve_price_list_pointers] No price list pointers to resolve")
        return []

    print(f"[_resolve_price_list_pointers] Resolving {len(price_list_pointers)} price list pointers")
    print(PRICE_LIST_PRODUCTS_TABLE)
    table = dynamodb.Table(PRICE_LIST_PRODUCTS_TABLE)
    resolved: List[Dict[str, Any]] = []

    for pointer in price_list_pointers:
        file_id = pointer.get("fileId")
        chunk_index = pointer.get("chunkIndex")
        if not file_id or chunk_index is None:
            print(f"[_resolve_price_list_pointers] Missing fileId or chunkIndex in pointer, keeping as-is")
            resolved.append(pointer)
            continue

        print(f"[_resolve_price_list_pointers] Fetching chunk for fileId: {file_id}, chunkIndex: {chunk_index}")
        response = table.get_item(Key={"fileId": file_id, "chunkIndex": chunk_index})
        chunk = response.get("Item")
        if not chunk:
            print(f"[_resolve_price_list_pointers] Chunk not found for fileId: {file_id}, chunkIndex: {chunk_index}")
            resolved.append(pointer)
            continue

        chunk_data = _convert_decimals(chunk)
        resolved.append(
            {
                **pointer,
                "sourceFile": chunk_data.get("sourceFile"),
                "createdAt": chunk_data.get("createdAt"),
                "createdAtIso": chunk_data.get("createdAtIso"),
            }
        )

    print(f"[_resolve_price_list_pointers] Successfully resolved {len(resolved)} price list pointers")
    return resolved

def _fetch_price_for_product(
    ordering_number: str,
    price_list_pointers: List[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    """Fetch most recent price for a product using price list pointers."""
    if not price_list_pointers:
        return None

    table = dynamodb.Table(PRICE_LIST_PRODUCTS_TABLE)
    sorted_pointers = sorted(
        price_list_pointers,
        key=lambda p: (p.get("year") or "", p.get("addedAt") or 0),
        reverse=True,
    )

    for pointer in sorted_pointers:
        file_id = pointer.get("fileId")
        chunk_index = pointer.get("chunkIndex")
        if not file_id or chunk_index is None:
            continue

        response = table.get_item(Key={"fileId": file_id, "chunkIndex": chunk_index})
        chunk = response.get("Item")
        if not chunk:
            continue

        chunk_data = _convert_decimals(chunk)
        for product in chunk_data.get("products", []):
            if product.get("orderingNumber") == ordering_number:
                return {
                    "price": product.get("price"),
                    "description": product.get("description"),
                    "SwagelokLink": product.get("SwagelokLink"),
                    "year": pointer.get("year"),
                    "fileId": file_id,
                    "sourceFile": chunk_data.get("sourceFile"),
                    "addedAt": pointer.get("addedAt"),
                    "addedAtIso": pointer.get("addedAtIso"),
                }

    return None


def fetch_product(ordering_number: str) -> ProductData:
    """Fetch a consolidated product record by ordering number."""
    print(f"[Fetch_Product] Fetching product: {ordering_number}")
    
    products_table = dynamodb.Table(PRODUCT_TABLE)
    
    response = products_table.get_item(Key={"orderingNumber": ordering_number})
    item = response.get("Item")
    
    if not item:
        print(f"[Fetch_Product] Product {ordering_number} not found in {PRODUCT_TABLE}")
        raise ValueError(f"Product {ordering_number} not found in {PRODUCT_TABLE}")
    safe_item = convert_decimals_to_native(item)
    print(f"[Fetch_Product] Product found: {json.dumps(safe_item, indent=2)}")

    product: ProductData = _convert_decimals(item)  # type: ignore[assignment]

    catalog_pointers = strip_catalog_snapshots(product.get("catalogProducts"))
    price_list_pointers = product.get("priceListPointers") or []

    resolved_catalog = _resolve_catalog_product_pointers(catalog_pointers, ordering_number)
    print(f"[Fetch_Product] Resolved catalog: {json.dumps(resolved_catalog, indent=2)}")
    
    resolved_price_list = _resolve_price_list_pointers(price_list_pointers)
    print(f"[Fetch_Product] Resolved price list: {json.dumps(resolved_price_list, indent=2)}")
    
    current_price = _fetch_price_for_product(ordering_number, price_list_pointers)

    print(f"[Fetch_Product] Successfully fetched product {ordering_number} with {len(resolved_catalog)} catalog products")

    return {
        **product,
        "catalogProducts": resolved_catalog,
        "priceListPointers": resolved_price_list,
        "currentPrice": current_price,
    }


def list_products_page(limit: int = 50) -> Dict[str, Any]:
    """
    Fetch a lightweight page of products.

    This mirrors the basic behavior of the legacy get_product endpoint when no
    ordering number was provided: return the first X products from the products
    table.

    The result includes a stable shape that the API layer can return directly:
        {
            "count": <int>,
            "products": [ ... ],
            "hasMore": <bool>,
            "cursor": <str | None>
        }
    """
    # Normalize and clamp limit
    try:
        limit_int = int(limit)
    except (TypeError, ValueError):
        limit_int = 50

    limit_int = max(1, min(limit_int, 200))

    products_table = dynamodb.Table(PRODUCT_TABLE)

    # Single-page scan – we intentionally keep this lightweight and bounded
    response = products_table.scan(Limit=limit_int)
    items = response.get("Items", [])

    # Convert Decimals so the result is JSON-serializable
    products: List[Dict[str, Any]] = [
        convert_decimals_to_native(item) for item in items
    ]

    last_evaluated_key = response.get("LastEvaluatedKey")
    cursor: Optional[str] = None
    has_more = False

    if last_evaluated_key:
        # Safe JSON string cursor the client can pass back as-is
        cursor = json.dumps(last_evaluated_key, default=str)
        has_more = True

    return {
        "count": len(products),
        "products": products,
        "hasMore": has_more,
        "cursor": cursor,
    }
