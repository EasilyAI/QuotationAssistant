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

from indexer.qdrant_client import QdrantManager
from indexer.embedding_bedrock import get_embedding_generator  # Using Bedrock (no Docker needed!)
from qdrant_types import ProductMetadata

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
        Get autocomplete suggestions with intelligent prefix matching.
        
        Prioritizes matches where the prefix appears at the beginning of the text,
        followed by word-boundary matches, then substring matches.
        
        Since Qdrant doesn't have built-in prefix matching,
        we use a hybrid approach: vector search with low threshold
        + intelligent client-side scoring and ranking.
        
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
            logger.info(f"Autocomplete for: '{prefix}'")
            
            # Use vector search with lower threshold
            # This finds semantically similar items
            results = self.vector_search(
                query=prefix,
                limit=limit * 5,  # Get more candidates for better ranking
                category=category,
                min_score=0.0  # No minimum score for autocomplete
            )
            
            # Score and filter results that match the prefix
            scored_suggestions: List[Tuple[float, Dict[str, str]]] = []
            prefix_lower = prefix.lower()
            
            for result in results:
                ordering_num = result.get('orderingNumber', '')
                ordering_num_lower = ordering_num.lower()
                search_text = result.get('searchText', '')
                search_text_lower = search_text.lower() if search_text else ''
                
                # Calculate match score based on where prefix appears
                score = self._calculate_prefix_match_score(
                    prefix_lower,
                    ordering_num_lower,
                    search_text_lower
                )
                
                # Only include results that actually match the prefix (score > 0)
                if score > 0:
                    scored_suggestions.append((
                        score,
                        {
                            'orderingNumber': ordering_num,
                            'category': result.get('category', ''),
                            'searchText': search_text
                        }
                    ))
            
            # Sort by score (descending) and take top results
            scored_suggestions.sort(key=lambda x: x[0], reverse=True)
            suggestions = [item[1] for item in scored_suggestions[:limit]]
            
            logger.info(f"Returning {len(suggestions)} autocomplete suggestions")
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
        
        Args:
            score: Similarity score
            
        Returns:
            Relevance label
        """
        if score >= 0.85:
            return RelevanceLevel.HIGH
        elif score >= 0.70:
            return RelevanceLevel.MEDIUM
        else:
            return RelevanceLevel.LOW


class RelevanceLevel(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"

    def __str__(self) -> str:  # Helpful if logged or serialized implicitly
        return self.value

