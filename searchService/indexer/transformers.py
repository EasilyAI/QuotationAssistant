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
    metadata = {
        'orderingNumber': product_data.get('orderingNumber', ''),
        'category': product_data.get('category', ''),
        'oneLiner': product_data.get('oneLiner', ''),
        'specs': product_data.get('specs', ''),
        'manualNotes': product_data.get('manualNotes', ''),
    }
    
    # Add optional fields if present
    if product_data.get('catalogProduct'):
        metadata['catalogProduct'] = product_data['catalogProduct']
    
    if product_data.get('priceListProducts'):
        metadata['priceListProducts'] = product_data['priceListProducts']
    
    return metadata


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
    
    # Add SKU with context
    if product_data.get('orderingNumber'):
        parts.append(f"SKU: {product_data['orderingNumber']}")
    
    # Add category
    if product_data.get('category'):
        parts.append(f"Category: {product_data['category']}")
    
    # Add one-liner (most important)
    if product_data.get('oneLiner'):
        parts.append(product_data['oneLiner'])
    
    # Add specifications
    if product_data.get('specs'):
        parts.append(f"Specifications: {product_data['specs']}")
    
    # Add manual notes
    if product_data.get('manualNotes'):
        parts.append(f"Notes: {product_data['manualNotes']}")
    
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

