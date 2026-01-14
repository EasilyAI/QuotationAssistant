"""
LLM-based re-ranking service for search results using OpenAI.
"""

import json
import logging
import os
import re
import sys
from typing import Any, Dict, List, Optional, Tuple

# Ensure both service root and repo root (for shared utils) are on sys.path.
# This is needed so that `utils.openaiClient` (located at the repo root) can be imported
# both locally and inside the Lambda package.
CURRENT_DIR = os.path.dirname(__file__)
SERVICE_ROOT = os.path.abspath(os.path.join(CURRENT_DIR, ".."))  # e.g., product-search-api root or Lambda task root (/var/task)
REPO_ROOT = os.path.abspath(os.path.join(SERVICE_ROOT, ".."))

# Add paths to sys.path - in Lambda, SERVICE_ROOT will be /var/task where utils/ lives
for path in (SERVICE_ROOT, REPO_ROOT):
    if path not in sys.path:
        sys.path.insert(0, path)  # Insert at beginning for priority

logger = logging.getLogger(__name__)
logger.setLevel(os.getenv("LOG_LEVEL", "INFO"))


def _get_openai_client():
    """
    Lazily construct an OpenAI client.
    """
    # Lazy import to ensure path setup happens first
    try:
        from utils.openaiClient import OpenAIClient
        return OpenAIClient()
    except ImportError as e:
        # Log detailed error information for debugging
        logger.error(
            f"Failed to import OpenAIClient. "
            f"CURRENT_DIR={CURRENT_DIR}, SERVICE_ROOT={SERVICE_ROOT}, REPO_ROOT={REPO_ROOT}, "
            f"sys.path={sys.path}, error={str(e)}"
        )
        # Check if utils directory exists
        utils_path = os.path.join(SERVICE_ROOT, "utils")
        utils_path_alt = os.path.join(REPO_ROOT, "utils")
        logger.error(
            f"Checking utils paths: {utils_path} exists={os.path.exists(utils_path)}, "
            f"{utils_path_alt} exists={os.path.exists(utils_path_alt)}"
        )
        raise RuntimeError(
            f"OpenAIClient is not available. Check Python path and dependencies. "
            f"Import error: {str(e)}"
        )


def _is_ordering_number_query(query: str) -> bool:
    """
    Detect if the query is an ordering number (code-like) vs a description.
    
    An ordering number query typically:
    - Has no spaces (or very few)
    - Contains both letters and digits
    - Uses only alphanumeric characters and simple punctuation (-_./)
    - Is relatively short
    
    Args:
        query: User query string
        
    Returns:
        True if query appears to be an ordering number, False if it's a description
    """
    if not query:
        return False
    
    q = query.strip()
    has_space = " " in q
    has_letter = any(c.isalpha() for c in q)
    has_digit = any(c.isdigit() for c in q)
    allowed_chars = all(c.isalnum() or c in "-_./" for c in q)
    
    # Ordering number: no spaces, has both letters and digits, uses allowed chars, relatively short
    is_ordering_number_like = (
        (not has_space or len(q.split()) <= 2) and  # Allow 1-2 words max
        has_letter and 
        has_digit and 
        allowed_chars and
        len(q) <= 50  # Ordering numbers are typically short
    )
    
    return is_ordering_number_like


def _extract_specifications(text: str) -> Dict[str, str]:
    """
    Extract specifications from searchText or query text.
    
    Specifications are typically in the format:
    "Specifications: key1: value1, key2: value2, ..."
    
    Args:
        text: Text containing specifications
        
    Returns:
        Dictionary mapping spec keys to values
    """
    specs = {}
    
    if not text:
        return specs
    
    # Look for "Specifications:" pattern
    specs_match = re.search(r'Specifications:\s*(.+?)(?:\s*\||$)', text, re.IGNORECASE)
    if specs_match:
        specs_text = specs_match.group(1)
        
        # Parse key-value pairs separated by commas
        # Handle both "key: value" and "key:value" formats
        pairs = re.split(r',\s*(?=[A-Za-z])', specs_text)
        for pair in pairs:
            # Match "key: value" pattern
            match = re.match(r'([^:]+?):\s*(.+)', pair.strip())
            if match:
                key = match.group(1).strip()
                value = match.group(2).strip()
                if key and value:
                    specs[key] = value
    
    return specs


def _extract_specs_from_query(query: str) -> Dict[str, str]:
    """
    Extract specifications from a natural language query.
    
    This attempts to identify specification-like patterns in the query,
    such as "1/2 inch", "1000psi", "SS316", etc.
    
    Args:
        query: User query string
        
    Returns:
        Dictionary of extracted specifications
    """
    specs = {}
    
    if not query:
        return specs
    
    # Common specification patterns
    patterns = {
        'Size': r'(\d+(?:\.\d+)?\s*(?:inch|in|"|mm|cm|m))\b',
        'Pressure': r'(\d+(?:\.\d+)?\s*(?:psi|bar|pa|kpa|mpa))\b',
        'Material': r'\b(SS\d+|stainless\s+steel|aluminum|brass|copper|plastic|nylon|ptfe|pvc)\b',
        'Temperature': r'(\d+(?:\.\d+)?\s*(?:°?[CF]|celsius|fahrenheit))\b',
        'Thread': r'(NPT|BSP|metric|thread)\b',
    }
    
    for spec_key, pattern in patterns.items():
        matches = re.findall(pattern, query, re.IGNORECASE)
        if matches:
            # Take the first match or combine multiple
            specs[spec_key] = matches[0] if len(matches) == 1 else ', '.join(matches)
    
    return specs


def rerank_results(
    query: str,
    results: List[Dict[str, Any]],
    top_k: int = 5,
) -> List[Dict[str, Any]]:
    """
    Re-rank search results using an OpenAI small model (e.g. gpt-4o-mini).

    The LLM receives the original user query and the list of candidate results
    and returns the indices of the most relevant items with relevancy scores.
    We then map those indices back to the original result objects and override
    confidence scores based on reranking relevancy.

    Args:
        query: Original user query string.
        results: List of search result dictionaries (as returned from SearchService).
        top_k: Desired number of top results to return.

    Returns:
        A list of re-ranked results (same schema as `results`), truncated to `top_k`,
        with updated confidence scores based on reranking relevancy.
    """
    if not results or len(results) <= 1:
        return results

    # Clamp top_k to sensible bounds
    top_k = max(1, min(top_k, len(results)))

    try:
        client = _get_openai_client()
        
        # Detect query type
        is_ordering_number = _is_ordering_number_query(query)
        query_specs = _extract_specs_from_query(query) if not is_ordering_number else {}

        logger.info(f"Starting rerank for query: {query}, is_ordering_number: {is_ordering_number}, query_specs: {query_specs}, num_results: {len(results)}, top_k: {top_k}")

        # Serialize results with extracted specifications
        serialized_results = []
        for idx, item in enumerate(results):
            search_text = item.get("searchText", "")
            product_specs = _extract_specifications(search_text)
            
            serialized_results.append(
                {
                    "index": idx,
                    "orderingNumber": item.get("orderingNumber"),
                    "category": item.get("category"),
                    "score": item.get("score"),
                    "relevance": item.get("relevance"),
                    "searchText": search_text,
                    "specifications": product_specs if product_specs else None,  # Include specs if available
                }
            )

        # Log a small sample of serialized results for debugging (avoid huge payloads)
        if serialized_results:
            sample_for_log = serialized_results[:5]
            logger.info(f"Serialized results sample for rerank: {sample_for_log}")

        # Build system prompt based on query type
        if is_ordering_number:
            system_prompt = (
                "You are a retrieval re-ranking engine that optimizes search results for relevance.\n\n"
                "Given a user query that appears to be an ORDERING NUMBER (product code/identifier) and a list of candidate results, your job is to:\n"
                "1. Carefully read the query and each candidate's fields (orderingNumber, category, searchText, score, relevance).\n"
                "2. Judge how relevant each candidate is to the query, prioritizing:\n"
                "   - EXACT MATCH on orderingNumber (highest priority).\n"
                "   - Case-insensitive exact match on orderingNumber.\n"
                "   - Prefix match on orderingNumber (query starts with or contains the orderingNumber).\n"
                "   - Category alignment when relevant.\n"
                "   - The original similarity score and relevance label as a soft signal only.\n"
                "3. Select the single best set of top results strictly from the provided list.\n\n"
                "Important rules:\n"
                "- NEVER invent or fabricate new items.\n"
                "- ONLY reference candidates by their provided `index`.\n"
                "- Prioritize exact orderingNumber matches above all else.\n"
                "- Do not perform any fuzzy creative interpretation; be precise and conservative.\n\n"
                "Output format:\n"
                "- You MUST respond with valid JSON only, no extra text.\n"
                "- The JSON must have the shape:\n"
                '  {\"top_indices\": [i1, i2, ...], \"relevancy_scores\": {\"i1\": 0.95, \"i2\": 0.85, ...} }\n'
                "- `top_indices` must be a list of unique integers that exist in the input indices.\n"
                "- `relevancy_scores` must be a dictionary mapping index (as string) to a relevancy score (0.0-1.0).\n"
                "- Return them in the desired order from most relevant to least relevant.\n"
                "- Relevancy scores should reflect how well each result matches the query (1.0 = perfect match, 0.0 = poor match).\n"
            )
        else:
            system_prompt = (
                "You are a retrieval re-ranking engine that optimizes search results for relevance.\n\n"
                "Given a user query that appears to be a PRODUCT DESCRIPTION (natural language) and a list of candidate results, your job is to:\n"
                "1. Carefully read the query and each candidate's fields (orderingNumber, category, searchText, specifications, score, relevance).\n"
                "2. Extract any technical specifications from the query (e.g., size, pressure, material, temperature, thread type).\n"
                "   Treat NUMERIC SPECIFICATIONS (especially sizes and pressures) as VERY IMPORTANT SIGNALS, but do not fully disqualify other items.\n"
                "3. Judge how relevant each candidate is to the query, prioritizing:\n"
                "   - TECHNICAL SPECIFICATIONS MATCH (HIGHEST PRIORITY SIGNAL):\n"
                "     * Compare specifications from the query with product specifications.\n"
                "     * Products whose size/pressure/material clearly MATCH the query should be ranked at the top with high relevancy scores.\n"
                "     * Products whose size/pressure/material clearly DO NOT match the query requirements should receive much lower relevancy scores and appear below matching items, but may still appear in the list if there are few or no exact matches.\n"
                "     * When the query includes an explicit size (e.g. '1/4 inch', '3/8\"', '1 inch'), items with that SAME size should be ranked above items with different sizes.\n"
                "     * Do NOT rank items with different sizes (e.g. '1/4', '3/8', '1/2', '1\"') above exact size matches, unless the query clearly allows a range or alternatives.\n"
                "   - Semantic match between the query description and searchText.\n"
                "   - Category alignment when relevant.\n"
                "   - The original similarity score and relevance label as a soft signal only.\n"
                "4. CRITICAL: Strongly down-rank products with specifications that are clearly incompatible with the query (give them noticeably lower relevancy scores), rather than completely rejecting them.\n"
                "   For example:\n"
                "   - If the query asks for '1/2 inch' but a product has '3/4 inch' or '1/4 inch', those products should be ranked significantly lower than any '1/2 inch' products, with clearly lower relevancy scores.\n"
                "   - If the query asks for '1/4 inch' NPT, then '1/4' NPT products should be ranked above '3/8', '1/2', or '1 inch' products, and given higher relevancy scores.\n"
                "   - If the query asks for '1000psi' but a product has '500psi', it should be ranked lower unless the query explicitly allows lower pressure ratings.\n"
                "5. When some products are missing a specification that is clearly required by the query (for example, no size is specified on the product but the query includes a size), rank them BELOW products with explicit, matching specifications, but they may still appear with moderate or low relevancy scores.\n"
                "6. Select the single best set of top results strictly from the provided list.\n\n"
                "Important rules:\n"
                "- NEVER invent or fabricate new items.\n"
                "- ONLY reference candidates by their provided `index`.\n"
                "- SPECIFICATIONS ARE CRITICAL: Products with incompatible specifications must be ranked much lower and should not appear above exact or clearly compatible matches, but they can still appear as lower-ranked options.\n"
                "- If several items are similarly relevant, prefer those with clearer, more specific searchText and matching specifications.\n"
                "- Do not perform any fuzzy creative interpretation; be precise and conservative when comparing numeric values like sizes and pressures.\n\n"
                "Output format:\n"
                "- You MUST respond with valid JSON only, no extra text.\n"
                "- The JSON must have the shape:\n"
                '  {\"top_indices\": [i1, i2, ...], \"relevancy_scores\": {\"i1\": 0.95, \"i2\": 0.85, ...} }\n'
                "- `top_indices` must be a list of unique integers that exist in the input indices.\n"
                "- `relevancy_scores` must be a dictionary mapping index (as string) to a relevancy score (0.0-1.0).\n"
                "- Return them in the desired order from most relevant to least relevant.\n"
                "- Relevancy scores should reflect how well each result matches the query, with special attention to specification compatibility, especially exact numeric matches for size and pressure.\n"
            )

        # Build user prompt with query specifications if available
        query_info = f"Query:\n{query}\n"
        if query_specs:
            query_info += f"\nExtracted specifications from query:\n{json.dumps(query_specs, ensure_ascii=False)}\n"
        
        user_prompt = (
            "Re-rank the following search results for the given query.\n\n"
            f"{query_info}\n"
            "Candidate results (JSON list):\n"
            f"{json.dumps(serialized_results, ensure_ascii=False)}\n\n"
            f"Return at most {top_k} items via their indices in the required JSON format, "
            "along with relevancy scores for each item."
        )

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]

        response_json = client.chat_completion_json(
            messages=messages,
            model=os.getenv("OPENAI_RERANK_MODEL", "gpt-4o-mini"),
            temperature=0,
        )

        logger.info(
            f"LLM rerank raw response: {response_json}"
        )

        raw_indices = response_json.get("top_indices") or []
        relevancy_scores = response_json.get("relevancy_scores") or {}
        
        if not isinstance(raw_indices, list):
            logger.warning("Unexpected LLM response format for top_indices, skipping rerank")
            return results

        # Sanitize and deduplicate indices
        seen = set()
        valid_indices: List[int] = []
        for idx in raw_indices:
            try:
                i = int(idx)
            except (TypeError, ValueError):
                continue
            if 0 <= i < len(results) and i not in seen:
                seen.add(i)
                valid_indices.append(i)
            if len(valid_indices) >= top_k:
                break

        if not valid_indices:
            logger.warning("LLM returned no valid indices; falling back to original ranking")
            return results[:top_k]

        # If LLM returned fewer than top_k, fill remaining slots with highest-scoring original results
        if len(valid_indices) < top_k:
            # Get all indices not already selected, sorted by original score (descending)
            remaining_indices = [
                (i, results[i].get('score', 0.0))
                for i in range(len(results))
                if i not in seen
            ]
            # Sort by score descending, then take top ones to fill up to top_k
            remaining_indices.sort(key=lambda x: x[1], reverse=True)
            needed = top_k - len(valid_indices)
            for i, _ in remaining_indices[:needed]:
                valid_indices.append(i)
            logger.info(f"Filled {needed} additional slots from original ranking to reach top_k={top_k}")

        # Re-rank results and override confidence scores based on relevancy
        re_ranked = []
        for idx in valid_indices:
            result = results[idx].copy()
            
            # Override confidence score based on reranking relevancy
            idx_str = str(idx)
            if idx_str in relevancy_scores:
                relevancy_score = relevancy_scores[idx_str]
                try:
                    # Convert relevancy score to confidence (0-100)
                    new_confidence = float(relevancy_score) * 100
                    # Update both score and confidence fields
                    result['score'] = float(relevancy_score)
                    result['confidence'] = round(new_confidence)
                    # Update relevance label based on new score
                    if relevancy_score >= 0.70:
                        result['relevance'] = 'high'
                    elif relevancy_score >= 0.50:
                        result['relevance'] = 'medium'
                    else:
                        result['relevance'] = 'low'
                    logger.debug(f"Updated result {idx} confidence: {result.get('score', 'N/A')} -> {relevancy_score} (confidence: {new_confidence})")
                except (ValueError, TypeError) as e:
                    logger.warning(f"Invalid relevancy score for index {idx}: {relevancy_scores[idx_str]}, keeping original score")
            
            re_ranked.append(result)
        
        logger.info(
            f"Re-ranked {len(re_ranked)} results for query '{query}' "
            f"(query type: {'ordering_number' if is_ordering_number else 'description'})"
        )
        
        return re_ranked

    except Exception as e:
        logger.error(f"Error during OpenAI re-ranking: {str(e)}", exc_info=True)
        # In case of any failure, gracefully fall back to original ranking
        return results[:top_k]



