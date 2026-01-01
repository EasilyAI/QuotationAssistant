"""
Category inference utility for price list products.

Infers product category from description text using pattern matching.
"""

import re
from typing import Optional, Tuple

# Category list from ProductCategory enum (webApp/src/types/products.ts)
# Using space variant for "Quick Connect" (not "Quick-Connect")
# Note: "Valve" alone is NOT a category - only specific valve types
CATEGORIES = [
    # Multi-word categories (search longest first to avoid false positives)
    "Bellows Sealed Valve",
    "Diaphragm Sealed Valve",
    "Ball Valve",
    "Plug Valve",
    "Check Valve",
    "Needle Valve",
    "Quick Connect",
    "Welding System",
    # Single-word categories
    "Hose",
    "Regulator",
    "Fitting",
    "DPG",
    "Tubing",
    "Filter",
]

# Categories that contain "valve" - used to prevent matching "valve" alone
VALVE_CATEGORIES = {
    "ball valve",
    "plug valve",
    "check valve",
    "needle valve",
    "bellows sealed valve",
    "diaphragm sealed valve",
}


def infer_product_category(description: str) -> Tuple[Optional[str], str]:
    """
    Infer product category from description text.
    
    Args:
        description: Product description text
        
    Returns:
        Tuple of (category_name_or_none, confidence_level)
        Confidence levels:
        - "exact": Full category name found with word boundaries
        - "suggested": Partial word match (e.g., "valve" when category might be "Ball Valve")
        - "none": No match found
    """
    if not description or not description.strip():
        return None, "none"
    
    # Normalize to lowercase for matching
    desc_lower = description.lower()
    
    # Track matches with their positions for first-occurrence logic
    exact_matches = []  # (category, position)
    suggested_matches = []  # (category, position)
    
    # Search for multi-word categories first (longest first)
    # This ensures "Ball Valve" matches before just "Valve"
    for category in CATEGORIES:
        category_lower = category.lower()
        
        # Check for exact match with word boundaries
        # Use word boundaries to match complete words only
        pattern = r'\b' + re.escape(category_lower) + r'\b'
        match = re.search(pattern, desc_lower)
        
        if match:
            exact_matches.append((category, match.start()))
            # Found exact match, no need to check for suggested match for this category
            continue
        
        # Check for suggested match (partial word match)
        # This happens when a single word from description matches part of a multi-word category
        # Example: description has "valve" but category is "Ball Valve"
        words_in_category = category_lower.split()
        if len(words_in_category) > 1:
            # Check if any word from description matches any word in the category
            desc_words = set(re.findall(r'\b\w+\b', desc_lower))
            category_words = set(words_in_category)
            
            # Check if any description word matches a category word
            matching_words = desc_words.intersection(category_words)
            
            # Special case: "valve" alone should NOT match any category
            # Only suggest if it's part of a specific valve type category
            if "valve" in matching_words:
                # Only suggest if this is a valve category (not just "valve" alone)
                if category_lower in VALVE_CATEGORIES:
                    # Check if "valve" appears in description (but not as standalone category)
                    valve_match = re.search(r'\bvalve\b', desc_lower)
                    if valve_match:
                        # Make sure we're not matching "valve" as a standalone word
                        # (it should only match as part of "Ball Valve", "Check Valve", etc.)
                        suggested_matches.append((category, valve_match.start()))
            elif matching_words:
                # Other partial matches (not valve-related)
                # Find the first matching word position
                for word in matching_words:
                    word_match = re.search(r'\b' + re.escape(word) + r'\b', desc_lower)
                    if word_match:
                        suggested_matches.append((category, word_match.start()))
                        break
    
    # Return first exact match (by position in text)
    if exact_matches:
        exact_matches.sort(key=lambda x: x[1])  # Sort by position
        return exact_matches[0][0], "exact"
    
    # Return first suggested match (by position in text)
    if suggested_matches:
        suggested_matches.sort(key=lambda x: x[1])  # Sort by position
        return suggested_matches[0][0], "suggested"
    
    # No match found
    return None, "none"

