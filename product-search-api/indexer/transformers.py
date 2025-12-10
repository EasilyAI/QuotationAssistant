"""
Data transformation utilities for indexing pipeline.
"""

import logging
from typing import Dict, Any

logger = logging.getLogger(__name__)


def prepare_product_metadata(product_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Prepare product metadata for Qdrant storage.
    
    Args:
        product_data: Product dictionary
        
    Returns:
        Metadata dict optimized for search and filtering
    """
    return {
        "orderingNumber": product_data.get("orderingNumber", ""),
        "productCategory": product_data.get("productCategory", product_data.get("category", "")),
        
    }


def clean_text(text: str) -> str:
    """
    Clean and normalize text for embedding.
    
    Args:
        text: Raw text
        
    Returns:
        Cleaned text
    """
    if not text:
        return ""
    
    # Remove extra whitespace
    text = ' '.join(text.split())
    
    # Remove special characters that might interfere
    # (keep alphanumeric, spaces, basic punctuation)
    # This is gentle cleaning - adjust as needed
    
    return text.strip()


def prepare_search_text(product_data: Dict[str, Any]) -> str:
    """
    Prepare combined text for embedding from product data.
    
    Args:
        product_data: Product dictionary
        
    Returns:
        Combined, cleaned text for embedding
    """
    parts = []
    
    # Add ordering number
    if product_data.get("orderingNumber"):
        parts.append(f"Ordering Number: {product_data['orderingNumber']}")

    # Add category
    if product_data.get("productCategory"):
        parts.append(f"Category: {product_data['productCategory']}")

    # Add description from currentPrice (this is the one-liner)
    current_price = product_data.get("currentPrice") or {}
    if isinstance(current_price, dict) and current_price.get("description"):
        parts.append(current_price["description"])

    # Add specifications from catalog products
    catalog_products = product_data.get("catalogProducts") or []
    for catalog_product in catalog_products:
        if not isinstance(catalog_product, dict):
            continue
        
        # Add specs from catalog product
        specs = catalog_product.get("specs")
        if specs and isinstance(specs, dict):
            spec_parts = []
            for key, value in specs.items():
                if value:
                    spec_parts.append(f"{key}: {value}")
            if spec_parts:
                parts.append(f"Specifications: {', '.join(spec_parts)}")

    # Add manual input if available
    if product_data.get("manualInput"):
        parts.append(f"Manual Input: {product_data['manualInput']}")

    # Add price hint if available
    if isinstance(current_price, dict) and current_price.get("price") is not None:
        parts.append(f"Price: {current_price.get('price')}")
    
    combined = " | ".join(parts)
    
    # Clean the text
    cleaned = clean_text(combined)
    
    # Truncate if too long (most models have limits around 512 tokens)
    # Rough estimate: 1 token ≈ 4 characters
    max_chars = 2000  # ~500 tokens
    if len(cleaned) > max_chars:
        cleaned = cleaned[:max_chars]
        logger.warning(f"Text truncated to {max_chars} chars for product {product_data.get('orderingNumber')}")
    
    return cleaned
