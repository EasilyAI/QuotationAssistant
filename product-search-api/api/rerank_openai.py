"""
LLM-based re-ranking service for search results using OpenAI.
"""

import json
import logging
import os
import re
import sys
from typing import Any, Dict, List, Optional, Tuple

# Ensure repo root (for shared utils) is on sys.path
CURRENT_DIR = os.path.dirname(__file__)
REPO_ROOT = os.path.abspath(os.path.join(CURRENT_DIR, "..", ".."))
if REPO_ROOT not in sys.path:
    sys.path.append(REPO_ROOT)

try:
    from utils.openaiClient import OpenAIClient
except ImportError:  # pragma: no cover - defensive in case of path issues
    OpenAIClient = None  # type: ignore

logger = logging.getLogger(__name__)
logger.setLevel(os.getenv("LOG_LEVEL", "INFO"))


def _get_openai_client() -> OpenAIClient:
    """
    Lazily construct an OpenAI client.
    """
    if OpenAIClient is None:
        raise RuntimeError("OpenAIClient is not available. Check Python path and dependencies.")
    return OpenAIClient()


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
                "3. Judge how relevant each candidate is to the query, prioritizing:\n"
                "   - TECHNICAL SPECIFICATIONS MATCH: Compare specifications from the query with product specifications.\n"
                "     Products with specifications that DO NOT match the query requirements should be heavily penalized.\n"
                "     Products with matching or compatible specifications should be prioritized.\n"
                "   - Semantic match between the query description and searchText.\n"
                "   - Category alignment when relevant.\n"
                "   - The original similarity score and relevance label as a soft signal only.\n"
                "4. CRITICAL: Reject products with specifications that are clearly incompatible with the query.\n"
                "   For example, if the query asks for '1/2 inch' but a product has '3/4 inch', it should be ranked lower.\n"
                "   If the query asks for '1000psi' but a product has '500psi', it should be ranked lower unless it's clearly compatible.\n"
                "5. Select the single best set of top results strictly from the provided list.\n\n"
                "Important rules:\n"
                "- NEVER invent or fabricate new items.\n"
                "- ONLY reference candidates by their provided `index`.\n"
                "- SPECIFICATIONS ARE CRITICAL: Products with incompatible specifications should be ranked much lower.\n"
                "- If several items are similarly relevant, prefer those with clearer, more specific searchText and matching specifications.\n"
                "- Do not perform any fuzzy creative interpretation; be precise and conservative.\n\n"
                "Output format:\n"
                "- You MUST respond with valid JSON only, no extra text.\n"
                "- The JSON must have the shape:\n"
                '  {\"top_indices\": [i1, i2, ...], \"relevancy_scores\": {\"i1\": 0.95, \"i2\": 0.85, ...} }\n'
                "- `top_indices` must be a list of unique integers that exist in the input indices.\n"
                "- `relevancy_scores` must be a dictionary mapping index (as string) to a relevancy score (0.0-1.0).\n"
                "- Return them in the desired order from most relevant to least relevant.\n"
                "- Relevancy scores should reflect how well each result matches the query, with special attention to specification compatibility.\n"
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



