"""
Qdrant search operations for the API.
"""

import logging
from typing import List, Dict, Any, Optional

import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from indexer.qdrant_client import QdrantManager
from indexer.embedding_bedrock import get_embedding_generator  # Using Bedrock (no Docker needed!)

logger = logging.getLogger(__name__)


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
        min_score: float = 0.0
    ) -> List[Dict[str, Any]]:
        """
        Perform vector similarity search.
        
        Args:
            query: Search query text
            limit: Maximum number of results
            category: Optional category filter
            min_score: Minimum similarity score threshold
            
        Returns:
            List of search results with scores
        """
        if not query or not query.strip():
            logger.warning("Empty query provided")
            return []
        
        try:
            # Generate query embedding
            logger.info(f"Searching for: '{query}' (category: {category})")
            query_vector = self.embedder.generate(query)
            
            # Search Qdrant
            results = self.qdrant.search(
                query_vector=query_vector,
                limit=limit,
                category_filter=category,
                score_threshold=min_score if min_score > 0 else None
            )
            
            # Format results for API response
            formatted_results = []
            for result in results:
                metadata = result['metadata']
                formatted_results.append({
                    'orderingNumber': result['id'],
                    'category': metadata.get('category', ''),
                    'oneLiner': metadata.get('oneLiner', ''),
                    'specs': metadata.get('specs', ''),
                    'manualNotes': metadata.get('manualNotes', ''),
                    'score': round(result['score'], 4),
                    'relevance': self._calculate_relevance(result['score']),
                    'catalogProduct': metadata.get('catalogProduct'),
                    'priceListProducts': metadata.get('priceListProducts'),
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
        Get autocomplete suggestions.
        
        Since Qdrant doesn't have built-in prefix matching,
        we use a hybrid approach: vector search with low threshold
        + metadata filtering on the client side.
        
        Args:
            prefix: Query prefix
            limit: Number of suggestions
            category: Optional category filter
            
        Returns:
            List of suggestions
        """
        if not prefix or len(prefix) < 2:
            return []
        
        try:
            logger.info(f"Autocomplete for: '{prefix}'")
            
            # Use vector search with lower threshold
            # This finds semantically similar items
            results = self.vector_search(
                query=prefix,
                limit=limit * 3,  # Get more candidates
                category=category,
                min_score=0.0  # No minimum score for autocomplete
            )
            
            # Filter results that actually match the prefix
            suggestions = []
            prefix_lower = prefix.lower()
            
            for result in results:
                # Check if oneLiner or orderingNumber contains the prefix
                one_liner = result.get('oneLiner', '').lower()
                ordering_num = result.get('orderingNumber', '').lower()
                
                if prefix_lower in one_liner or prefix_lower in ordering_num:
                    suggestions.append({
                        'text': result['oneLiner'],
                        'orderingNumber': result['orderingNumber'],
                        'category': result['category']
                    })
                    
                    if len(suggestions) >= limit:
                        break
            
            logger.info(f"Returning {len(suggestions)} autocomplete suggestions")
            return suggestions
            
        except Exception as e:
            logger.error(f"Autocomplete error: {str(e)}", exc_info=True)
            return []
    
    @staticmethod
    def _calculate_relevance(score: float) -> str:
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
            return "high"
        elif score >= 0.70:
            return "medium"
        else:
            return "low"

