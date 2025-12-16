"""
LLM-based re-ranking service for search results using OpenAI.
"""

import json
import logging
import os
import sys
from typing import Any, Dict, List

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


def rerank_results(
    query: str,
    results: List[Dict[str, Any]],
    top_k: int = 5,
) -> List[Dict[str, Any]]:
    """
    Re-rank search results using an OpenAI small model (e.g. gpt-4o-mini).

    The LLM receives the original user query and the list of candidate results
    and returns the indices of the most relevant items. We then map those
    indices back to the original result objects to preserve the schema.

    Args:
        query: Original user query string.
        results: List of search result dictionaries (as returned from SearchService).
        top_k: Desired number of top results to return.

    Returns:
        A list of re-ranked results (same schema as `results`), truncated to `top_k`.
    """
    if not results or len(results) <= 1:
        return results

    # Clamp top_k to sensible bounds
    top_k = max(1, min(top_k, len(results)))

    try:
        client = _get_openai_client()

        # We only send the minimal necessary fields to keep prompt size bounded
        serialized_results = []
        for idx, item in enumerate(results):
            serialized_results.append(
                {
                    "index": idx,
                    "orderingNumber": item.get("orderingNumber"),
                    "category": item.get("category"),
                    "score": item.get("score"),
                    "relevance": item.get("relevance"),
                    "searchText": item.get("searchText"),
                }
            )

        system_prompt = (
            "You are a retrieval re-ranking engine that optimizes search results for relevance.\n\n"
            "Given a user query and a list of candidate results, your job is to:\n"
            "1. Carefully read the query and each candidate's fields (orderingNumber, category, searchText, score, relevance).\n"
            "2. Judge how relevant each candidate is to the query, prioritizing:\n"
            "   - Semantic match between the query and searchText.\n"
            "   - Matching or compatible orderingNumber or product identifiers when present.\n"
            "   - Category alignment when relevant.\n"
            "   - The original similarity score and relevance label as a soft signal only.\n"
            "3. Select the single best set of top results strictly from the provided list.\n\n"
            "Important rules:\n"
            "- NEVER invent or fabricate new items.\n"
            "- ONLY reference candidates by their provided `index`.\n"
            "- If several items are similarly relevant, prefer those with clearer, more specific searchText.\n"
            "- Do not perform any fuzzy creative interpretation; be precise and conservative.\n\n"
            "Output format:\n"
            "- You MUST respond with valid JSON only, no extra text.\n"
            "- The JSON must have the shape:\n"
            '  {\"top_indices\": [i1, i2, ...] }\n'
            "- `top_indices` must be a list of unique integers that exist in the input indices.\n"
            "- Return them in the desired order from most relevant to least relevant.\n"
        )

        user_prompt = (
            "Re-rank the following search results for the given query.\n\n"
            f"Query:\n{query}\n\n"
            "Candidate results (JSON list):\n"
            f"{json.dumps(serialized_results, ensure_ascii=False)}\n\n"
            f"Return at most {top_k} items via their indices in the required JSON format."
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

        re_ranked = [results[i] for i in valid_indices]
        return re_ranked

    except Exception as e:
        logger.error(f"Error during OpenAI re-ranking: {str(e)}", exc_info=True)
        # In case of any failure, gracefully fall back to original ranking
        return results[:top_k]



