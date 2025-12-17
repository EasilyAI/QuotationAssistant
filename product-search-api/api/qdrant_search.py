"""
Qdrant search operations for the API.
"""

import logging
from enum import Enum
from typing import List, Dict, Any, Optional, Tuple
import re

import json
import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..', 'shared'))

from qdrant_client.http.models import (
    Filter as HttpFilter,
    FieldCondition as HttpFieldCondition,
    MatchText as HttpMatchText,
    MatchValue as HttpMatchValue,
    MinShould,
)

from indexer.qdrant_client import QdrantManager
from indexer.embedding_bedrock import get_embedding_generator  # Using Bedrock (no Docker needed!)
from shared.qdrant_types import ProductMetadata

logger = logging.getLogger(__name__)
logger.setLevel(os.getenv('LOG_LEVEL', 'INFO'))

class SearchService:
    """
    High-level search service using Qdrant.
    """
    
    def __init__(self):
        """Initialize search service."""
        self.qdrant = QdrantManager()
        self.embedder = get_embedding_generator()
    
    def vector_search(
        self,
        query: str,
        limit: int = 30,
        category: Optional[str] = None,
        min_score: float = 0.0,
        text_query: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Perform hybrid vector + text similarity search.
        
        This method combines:
        - Vector similarity search (semantic matching)
        - Text-based filtering on payload fields (exact/prefix matching)
        - Category filtering
        
        Args:
            query: Search query text (used for vector embedding)
            limit: Maximum number of results
            category: Optional category filter
            min_score: Minimum similarity score threshold
            text_query: Optional text query for hybrid search (if None, uses query)
            
        Returns:
            List of search results with scores
        """
        if not query or not query.strip():
            logger.warning("Empty query provided")
            return []
        
        try:
            # Generate query embedding for vector search
            logger.info(f"Searching for: '{query}' (category: {category}, text_query: {text_query})")
            query_vector = self.embedder.generate(query)
            
            # Decide how to use text filters:
            # - If caller explicitly provided text_query, use it as-is.
            # - Otherwise, only enable MatchText-based hybrid search for
            #   "code-like" queries (e.g. ordering numbers such as 6L-LD8-DDXX).
            #   For natural-language queries like "i need 1/2 inch valve", we rely
            #   purely on vector search, because text filters would be too strict
            #   and might filter out good semantic matches.
            if text_query is not None:
                hybrid_text_query = text_query
            else:
                q = query.strip()
                # Heuristic: treat as code-like if there are no spaces, it contains
                # both letters and digits, and only simple punctuation characters.
                has_space = " " in q
                has_letter = any(c.isalpha() for c in q)
                has_digit = any(c.isdigit() for c in q)
                allowed_chars = all(c.isalnum() or c in "-_./" for c in q)
                is_code_like = (not has_space) and has_letter and has_digit and allowed_chars

                hybrid_text_query = q if is_code_like else None
            
            # Search Qdrant using query_points with proper filtering and hybrid search
            results = self.qdrant.query_points(
                collection_name=self.qdrant.collection_name,
                query=query_vector,
                limit=limit,
                category_filter=category,
                text_query=hybrid_text_query,  # Enable hybrid search only for code-like queries
                score_threshold=min_score if min_score > 0 else None
            )
            
            logger.info(f"Results: {json.dumps(results, indent=2)}")
            # Format results for API response
            formatted_results: List[Dict[str, Any]] = []
            for result in results:
                metadata: ProductMetadata = result.get('metadata', {})  # type: ignore[assignment]
                score = result.get('score', 0.0)
                ordering_number = metadata.get('orderingNumber', '') or result.get('id', '')
                category_val = metadata.get('productCategory') or metadata.get('category', '')
                search_text = metadata.get('searchText') or metadata.get('category', '')
                
                relevance = self._calculate_relevance(score) if score else RelevanceLevel.LOW

                formatted_results.append({
                    'orderingNumber': ordering_number,
                    'category': category_val,
                    'score': round(score, 4) if score else 0.0,
                    'relevance': relevance.value,
                    'searchText': search_text
                })
            
            logger.info(f"Found {len(formatted_results)} results")
            return formatted_results
            
        except Exception as e:
            logger.error(f"Search error: {str(e)}", exc_info=True)
            raise
    
    def autocomplete(
        self,
        prefix: str,
        limit: int = 10,
        category: Optional[str] = None
    ) -> List[Dict[str, str]]:
        """
        Get autocomplete suggestions using text-only prefix matching.
        
        Uses Qdrant's text search capabilities (PREFIX tokenizer) for fast prefix matching.
        No vector embeddings needed - pure text-based search for maximum speed.
        
        Prioritizes matches where the prefix appears at the beginning of the text,
        followed by word-boundary matches, then substring matches.
        
        Args:
            prefix: Query prefix
            limit: Number of suggestions
            category: Optional category filter
            
        Returns:
            List of suggestions, sorted by relevance score
        """
        if not prefix or len(prefix) < 1:
            return []
        
        try:
            logger.info(f"Autocomplete (text-only) for: '{prefix}'")
            
            # Use text-only search via Qdrant's query_points with MatchText filters
            # No vector embedding needed - much faster!
            # Fetch more candidates to account for potential tokenization mismatches
            # (e.g., "6L-L" might not match perfectly due to PREFIX tokenizer behavior)
            candidate_limit = max(limit * 3, 30)  # Get more candidates for better coverage
            
            # Create a dummy zero vector (required by query_points API but not used for matching)
            # The actual matching is done via text filters
            dummy_vector = [0.0] * self.embedder.get_vector_size()
            
            # Build text filters for prefix matching
            # Use MatchText which works with PREFIX tokenizer on orderingNumber
            
            must_conditions = []
            should_conditions = []
            
            # Category filter
            if category:
                must_conditions.append(
                    HttpFieldCondition(
                        key="productCategory",
                        match=HttpMatchValue(value=category)
                    )
                )
            
            # Text prefix matching on orderingNumber and searchText
            # For autocomplete, we use a more lenient approach:
            # 1. Try MatchText for token-based matching (works with PREFIX tokenizer)
            # 2. Also include substring matching to catch edge cases like "6L-L"
            # We'll fetch more candidates and filter client-side for better control
            prefix_lower = prefix.lower().strip()
            if prefix_lower:
                # Use MatchText for token-based prefix matching
                # This works well with PREFIX tokenizer for most cases
                should_conditions.extend([
                    HttpFieldCondition(
                        key="orderingNumber",
                        match=HttpMatchText(text=prefix_lower)
                    ),
                    HttpFieldCondition(
                        key="searchText",
                        match=HttpMatchText(text=prefix_lower)
                    ),
                ])
                
                # For very short prefixes or if we want to be more lenient,
                # we could also add substring matching, but that's expensive.
                # Instead, we'll fetch more results and do client-side filtering
            
            query_filter = None
            if must_conditions or should_conditions:
                min_should = (
                    MinShould(conditions=should_conditions, min_count=1)
                    if should_conditions
                    else None
                )
                query_filter = HttpFilter(
                    must=must_conditions if must_conditions else None,
                    should=should_conditions if should_conditions else None,
                    min_should=min_should
                )
            
            # Query Qdrant with text filters only (dummy vector ignored)
            # Note: We use query_points which requires a vector, but we use a dummy vector
            # and rely entirely on text filters for matching
            results_raw = None
            
            # First, try with strict MatchText filter
            try:
                results_raw = self.qdrant.client.query_points(
                    collection_name=self.qdrant.collection_name,
                    query=dummy_vector,
                    query_filter=query_filter,
                    limit=candidate_limit,
                    score_threshold=None  # No score threshold for text search
                )
            except Exception as e:
                logger.warning(f"Query points failed: {str(e)}")
                results_raw = None
            
            # If we got no results or very few, try a more lenient approach:
            # Use scroll_points to get more candidates, then filter client-side
            # This helps with edge cases where MatchText doesn't match due to tokenization
            if not results_raw or len(results_raw.points) < limit:
                logger.info(f"Got {len(results_raw.points) if results_raw else 0} results, trying scroll for more candidates")
                try:
                    # Use scroll with only category filter (no text filter) to get more candidates
                    # We'll filter by prefix client-side
                    scroll_filter = None
                    if category:
                        scroll_filter = HttpFilter(
                            must=[
                                HttpFieldCondition(
                                    key="productCategory",
                                    match=HttpMatchValue(value=category)
                                )
                            ]
                        )
                    
                    scroll_results = self.qdrant.client.scroll(
                        collection_name=self.qdrant.collection_name,
                        scroll_filter=scroll_filter,
                        limit=candidate_limit * 2,  # Get even more candidates
                        with_payload=True,
                        with_vectors=False
                    )
                    
                    # Convert scroll results to same format as query_points
                    class MockPoint:
                        def __init__(self, point_id, payload):
                            self.id = point_id
                            self.payload = payload
                            self.score = None
                    
                    scroll_points = [MockPoint(p.id, p.payload) for p in scroll_results[0]]
                    
                    # If we got results from scroll, use them (they'll be filtered client-side)
                    if scroll_points:
                        results_raw = type('Results', (), {'points': scroll_points})()
                        logger.info(f"Scroll returned {len(scroll_points)} candidates for client-side filtering")
                except Exception as e:
                    logger.warning(f"Scroll also failed: {str(e)}")
                    # If both fail, use empty results
                    if not results_raw:
                        results_raw = type('Results', (), {'points': []})()
            
            # Format results
            results = []
            for point in results_raw.points:
                results.append({
                    'id': str(point.id),
                    'score': point.score if hasattr(point, 'score') else None,
                    'metadata': point.payload or {}
                })
            
            # Score and filter results that match the prefix
            # We do client-side filtering to ensure we catch all prefix matches,
            # including edge cases where Qdrant's tokenization might miss exact matches
            scored_suggestions: List[Tuple[float, Dict[str, str]]] = []
            prefix_lower = prefix.lower()
            
            for result in results:
                metadata: ProductMetadata = result.get('metadata', {})  # type: ignore[assignment]
                ordering_num = metadata.get('orderingNumber', '') or result.get('id', '')
                ordering_num_lower = ordering_num.lower()
                search_text = metadata.get('searchText') or metadata.get('description', '') or ''
                search_text_lower = search_text.lower() if search_text else ''
                category_val = metadata.get('productCategory') or metadata.get('category', '')
                
                # Calculate match score based on where prefix appears
                score = self._calculate_prefix_match_score(
                    prefix_lower,
                    ordering_num_lower,
                    search_text_lower
                )
                
                # Only include results that actually contain the prefix
                # This ensures we catch matches even if Qdrant's tokenization missed them
                if score > 0:
                    scored_suggestions.append((
                        score,
                        {
                            'orderingNumber': ordering_num,
                            'category': category_val,
                            'searchText': search_text
                        }
                    ))
            
            # Sort by score (descending) and take top results
            scored_suggestions.sort(key=lambda x: x[0], reverse=True)
            suggestions = [item[1] for item in scored_suggestions[:limit]]
            
            logger.info(f"Returning {len(suggestions)} autocomplete suggestions (text-only)")
            return suggestions
            
        except Exception as e:
            logger.error(f"Autocomplete error: {str(e)}", exc_info=True)
            return []
    
    def _calculate_prefix_match_score(
        self,
        prefix: str,
        ordering_num: str,
        search_text: str
    ) -> float:
        """
        Calculate relevance score for prefix matching.
        
        Scoring priority (higher score = better match):
        1. Prefix starts at beginning of orderingNumber (score: 100.0)
        2. Prefix starts at beginning of searchText (score: 80.0)
        3. Prefix starts at word boundary in orderingNumber (score: 60.0)
        4. Prefix starts at word boundary in searchText (score: 40.0)
        5. Prefix appears anywhere in orderingNumber (score: 20.0)
        6. Prefix appears anywhere in search_text (score: 10.0)
        
        Args:
            prefix: Lowercase prefix to match
            ordering_num: Lowercase ordering number
            search_text: Lowercase search text
            
        Returns:
            Score (0.0 if no match, higher is better)
        """
        if not prefix:
            return 0.0
        
        # Priority 1: Prefix starts at beginning of orderingNumber
        if ordering_num and ordering_num.startswith(prefix):
            return 100.0
        
        # Priority 2: Prefix starts at beginning of searchText
        if search_text and search_text.startswith(prefix):
            return 80.0
        
        # Priority 3: Prefix starts at word boundary in orderingNumber
        # Word boundary: start of string or after non-alphanumeric character
        if ordering_num:
            # Check if prefix appears at word boundary
            word_boundary_pattern = r'(^|[^a-z0-9])' + re.escape(prefix)
            if re.search(word_boundary_pattern, ordering_num, re.IGNORECASE):
                return 60.0
        
        # Priority 4: Prefix starts at word boundary in searchText
        if search_text:
            word_boundary_pattern = r'(^|[^a-z0-9])' + re.escape(prefix)
            if re.search(word_boundary_pattern, search_text, re.IGNORECASE):
                return 40.0
        
        # Priority 5: Prefix appears anywhere in orderingNumber
        if ordering_num and prefix in ordering_num:
            return 20.0
        
        # Priority 6: Prefix appears anywhere in searchText
        if search_text and prefix in search_text:
            return 10.0
        
        # No match
        return 0.0


    @staticmethod
    def _calculate_relevance(score: float) -> "RelevanceLevel":
        """
        Convert similarity score to relevance label.
        
        Cosine similarity ranges from -1 to 1, but we normalize to 0-1.
        Good matches are typically > 0.7.
        
        Thresholds are configurable via environment variables:
        - RELEVANCE_HIGH_THRESHOLD (default: 0.70)
        - RELEVANCE_MEDIUM_THRESHOLD (default: 0.50)
        
        Args:
            score: Similarity score
            
        Returns:
            Relevance label
        """
        # Get configurable thresholds from environment variables
        high_threshold = float(os.getenv('RELEVANCE_HIGH_THRESHOLD', '0.70'))
        medium_threshold = float(os.getenv('RELEVANCE_MEDIUM_THRESHOLD', '0.50'))
        
        # Validate thresholds
        if not (0.0 <= medium_threshold <= high_threshold <= 1.0):
            logger.warning(
                f"Invalid relevance thresholds: HIGH={high_threshold}, MEDIUM={medium_threshold}. "
                f"Using defaults: HIGH=0.70, MEDIUM=0.50"
            )
            high_threshold = 0.70
            medium_threshold = 0.50
        
        if score >= high_threshold:
            return RelevanceLevel.HIGH
        elif score >= medium_threshold:
            return RelevanceLevel.MEDIUM
        else:
            return RelevanceLevel.LOW


class RelevanceLevel(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"

    def __str__(self) -> str:  # Helpful if logged or serialized implicitly
        return self.value

