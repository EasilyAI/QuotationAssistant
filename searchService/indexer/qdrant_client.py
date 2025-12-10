"""
Qdrant Cloud client for vector storage operations.
"""

import os
import logging
import uuid
from typing import List, Dict, Any, Optional
from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance,
    VectorParams,
    PointStruct,
    Filter,
    FieldCondition,
    MatchValue,
)

logger = logging.getLogger(__name__)
logger.setLevel(os.getenv('LOG_LEVEL', 'INFO'))


class QdrantManager:
    """
    Manages Qdrant Cloud operations for product search.
    """
    
    def __init__(self):
        """Initialize Qdrant client with cloud credentials."""
        self.url = os.getenv('QDRANT_URL')
        self.api_key = os.getenv('QDRANT_API_KEY')
        self.collection_name = os.getenv('QDRANT_COLLECTION', 'products')
        self.vector_size = int(os.getenv('VECTOR_SIZE', '384'))  # all-MiniLM-L6-v2 default
        
        if not self.url or not self.api_key:
            raise ValueError("QDRANT_URL and QDRANT_API_KEY must be set")
        
        # Initialize client
        self.client = QdrantClient(
            url=self.url,
            api_key=self.api_key,
            timeout=30
        )
        
        logger.info(f"Qdrant client initialized for collection: {self.collection_name}")
    
    def ensure_collection_exists(self) -> bool:
        """
        Create collection if it doesn't exist.
        
        Returns:
            bool: True if collection was created, False if already exists
        """
        try:
            # Check if collection exists
            collections = self.client.get_collections().collections
            exists = any(c.name == self.collection_name for c in collections)
            
            if exists:
                logger.info(f"Collection {self.collection_name} already exists")
                return False
            
            # Create collection
            self.client.create_collection(
                collection_name=self.collection_name,
                vectors_config=VectorParams(
                    size=self.vector_size,
                    distance=Distance.COSINE
                )
            )
            
            logger.info(f"Created collection {self.collection_name}")
            return True
            
        except Exception as e:
            logger.error(f"Error ensuring collection exists: {str(e)}")
            raise
    
    def _build_point_id(self, ordering_number: str) -> str:
        """
        Build a deterministic UUID for a product based on its ordering number.
        Using uuid5 keeps the point id stable across upserts/deletes without
        storing an extra mapping.
        """
        return str(uuid.uuid5(uuid.NAMESPACE_URL, f"products:{ordering_number}"))

    def upsert_product(
        self,
        ordering_number: str,
        vector: List[float],
        metadata: Dict[str, Any]
    ) -> bool:
        """
        Upsert a single product into Qdrant.
        
        Args:
            product_id: Unique product identifier (orderingNumber)
            vector: Embedding vector
            metadata: Product metadata to store
            
        Returns:
            bool: True if successful
        """
        try:
            point = PointStruct(
                id=self._build_point_id(ordering_number),
                vector=vector,
                payload=metadata
            )
            
            self.client.upsert(
                collection_name=self.collection_name,
                points=[point]
            )
            
            logger.info(f"Upserted product {ordering_number} to Qdrant")
            return True
            
        except Exception as e:
            logger.error(f"Error upserting product {ordering_number}: {str(e)}")
            raise
    
    def batch_upsert_products(
        self,
        products: List[Dict[str, Any]]
    ) -> bool:
        """
        Batch upsert multiple products.
        
        Args:
            products: List of dicts with 'id', 'vector', and 'metadata' keys
            
        Returns:
            bool: True if successful
        """
        try:
            points = [
                PointStruct(
                    id=p['id'],
                    vector=p['vector'],
                    payload=p['metadata']
                )
                for p in products
            ]
            
            self.client.upsert(
                collection_name=self.collection_name,
                points=points
            )
            
            logger.info(f"Batch upserted {len(products)} products to Qdrant")
            return True
            
        except Exception as e:
            logger.error(f"Error batch upserting products: {str(e)}")
            raise
    
    def delete_product(self, ordering_number: str) -> bool:
        """
        Delete a product from Qdrant.
        
        Args:
            product_id: Product ID to delete
            
        Returns:
            bool: True if successful
        """
        try:
            point_id = self._build_point_id(ordering_number)
            self.client.delete(collection_name=self.collection_name, points_selector=[point_id])
            
            logger.info(f"Deleted product {ordering_number} from Qdrant")
            return True
            
        except Exception as e:
            logger.error(f"Error deleting product {ordering_number}: {str(e)}")
            raise
    
    def search(
        self,
        query_vector: List[float],
        limit: int = 30,
        category_filter: Optional[str] = None,
        score_threshold: Optional[float] = None
    ) -> List[Dict[str, Any]]:
        """
        Search for similar products.
        
        Args:
            query_vector: Query embedding vector
            limit: Number of results to return
            category_filter: Optional category to filter by
            score_threshold: Minimum similarity score
            
        Returns:
            List of search results with scores and metadata
        """
        try:
            # Build filter if category specified
            query_filter = None
            if category_filter:
                query_filter = Filter(
                    must=[
                        FieldCondition(
                            key="category",
                            match=MatchValue(value=category_filter)
                        )
                    ]
                )
            
            # Execute search
            results = self.client.search(
                collection_name=self.collection_name,
                query_vector=query_vector,
                limit=limit,
                query_filter=query_filter,
                score_threshold=score_threshold
            )
            
            # Format results
            formatted_results = []
            for result in results:
                formatted_results.append({
                    'id': result.id,
                    'score': result.score,
                    'metadata': result.payload
                })
            
            logger.info(f"Search returned {len(formatted_results)} results")
            return formatted_results
            
        except Exception as e:
            logger.error(f"Error searching Qdrant: {str(e)}")
            raise
    
    def get_product(self, product_id: str) -> Optional[Dict[str, Any]]:
        """
        Retrieve a specific product by ID.
        
        Args:
            product_id: Product ID to retrieve
            
        Returns:
            Product data or None if not found
        """
        try:
            result = self.client.retrieve(
                collection_name=self.collection_name,
                ids=[product_id]
            )
            
            if result:
                return {
                    'id': result[0].id,
                    'metadata': result[0].payload
                }
            return None
            
        except Exception as e:
            logger.error(f"Error retrieving product {product_id}: {str(e)}")
            return None
    
    def get_collection_info(self) -> Dict[str, Any]:
        """Get collection information and stats."""
        try:
            info = self.client.get_collection(self.collection_name)
            return {
                'name': info.config.params.vectors.size,
                'vector_size': info.config.params.vectors.size,
                'distance': info.config.params.vectors.distance,
                'points_count': info.points_count,
                'status': info.status
            }
        except Exception as e:
            logger.error(f"Error getting collection info: {str(e)}")
            raise

