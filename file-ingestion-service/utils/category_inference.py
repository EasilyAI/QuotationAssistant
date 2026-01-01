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
    # Single-word categories (order matters - Fitting before Tubing to prioritize fittings)
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

# Words that indicate a Fitting category (even if "Fitting" word not present)
FITTING_INDICATORS = {
    "union", "tee", "elbow", "connector", "adapter", "nipple", "plug", "cap",
    "reducer", "cross", "ferrule", "nut", "bulkhead", "manifold", "gland",
    "body", "fitting", "gasket"  # Include "fitting" itself and "gasket"
}

# Words that indicate a Valve category (for suggested matches)
VALVE_INDICATORS = {
    "valve", "relief", "poppet", "proportional"
}

# Words that indicate a Regulator category
REGULATOR_INDICATORS = {
    "regulator", "relief"  # Relief valves are often regulators
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
    # Handle None, empty string, or whitespace-only strings
    if not description:
        return None, "none"
    if not isinstance(description, str):
        # Convert to string if not already (handles edge cases)
        description = str(description)
    if not description.strip():
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
        words_in_category = category_lower.split()
        
        # Check for exact match with word boundaries
        # Use word boundaries to match complete words only
        pattern = r'\b' + re.escape(category_lower) + r'\b'
        match = re.search(pattern, desc_lower)
        
        if match:
            exact_matches.append((category, match.start()))
            # Found exact match, no need to check for suggested match for this category
            continue
        
        # For single-word categories, also check if they appear as part of compound words
        # Example: "Fitting" should match in "Tube Fitting" or "Pipe Fitting"
        if len(words_in_category) == 1:
            single_word = words_in_category[0]
            # Check for word boundary match (exact)
            word_pattern = r'\b' + re.escape(single_word) + r'\b'
            word_match = re.search(word_pattern, desc_lower)
            if word_match:
                exact_matches.append((category, word_match.start()))
                continue
            
            # Special handling for "Fitting" - recognize fitting indicators
            if single_word == "fitting":
                # Check if description contains fitting-related words
                desc_words = set(re.findall(r'\b\w+\b', desc_lower))
                fitting_words_found = desc_words.intersection(FITTING_INDICATORS)
                if fitting_words_found:
                    # Find the first fitting indicator position
                    for indicator in FITTING_INDICATORS:
                        indicator_match = re.search(r'\b' + re.escape(indicator) + r'\b', desc_lower)
                        if indicator_match:
                            exact_matches.append((category, indicator_match.start()))
                            break
                continue
            
            # Special handling for "Tubing" - check for tubing-related words
            # But prioritize Fitting if fitting indicators are present
            if single_word == "tubing":
                # Check if description contains tubing-related words
                desc_words = set(re.findall(r'\b\w+\b', desc_lower))
                # Don't match Tubing if it's clearly a fitting (has fitting indicators)
                if desc_words.intersection(FITTING_INDICATORS):
                    continue  # Skip Tubing, let Fitting match instead
                tubing_words = {"tubing", "tube", "tubular"}
                if desc_words.intersection(tubing_words):
                    for word in tubing_words:
                        word_match = re.search(r'\b' + re.escape(word) + r'\b', desc_lower)
                        if word_match:
                            exact_matches.append((category, word_match.start()))
                            break
                continue
            
            # Special handling for "Regulator" - recognize regulator indicators
            if single_word == "regulator":
                desc_words = set(re.findall(r'\b\w+\b', desc_lower))
                if desc_words.intersection(REGULATOR_INDICATORS):
                    for indicator in REGULATOR_INDICATORS:
                        indicator_match = re.search(r'\b' + re.escape(indicator) + r'\b', desc_lower)
                        if indicator_match:
                            exact_matches.append((category, indicator_match.start()))
                            break
                continue
        
        # Check for suggested match (partial word match)
        # This happens when a single word from description matches part of a multi-word category
        # Example: description has "valve" but category is "Ball Valve"
        if len(words_in_category) > 1:
            # Check if any word from description matches any word in the category
            desc_words = set(re.findall(r'\b\w+\b', desc_lower))
            category_words = set(words_in_category)
            
            # Check if any description word matches a category word
            matching_words = desc_words.intersection(category_words)
            
            # Special case: "valve" alone should NOT match any category
            # Only suggest if it's part of a specific valve type category
            if "valve" in matching_words or any(word in desc_lower for word in VALVE_INDICATORS):
                # Only suggest if this is a valve category (not just "valve" alone)
                if category_lower in VALVE_CATEGORIES:
                    # Check if valve-related words appear in description
                    for indicator in VALVE_INDICATORS:
                        indicator_match = re.search(r'\b' + re.escape(indicator) + r'\b', desc_lower)
                        if indicator_match:
                            # For "Relief Valve" - check if it's explicitly a valve type
                            if indicator == "relief" and "relief valve" in desc_lower:
                                # Relief valves could be regulators, but if description says "valve", suggest valve category
                                suggested_matches.append((category, indicator_match.start()))
                                break
                            elif indicator == "valve":
                                suggested_matches.append((category, indicator_match.start()))
                                break
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

