"""
Lightweight embedding generation using AWS Bedrock.
NO DOCKER NEEDED - uses cloud API instead of local models.
"""

import os
import logging
import json
from typing import List, Union
import boto3

logger = logging.getLogger(__name__)
logger.setLevel(os.getenv('LOG_LEVEL', 'INFO'))


class EmbeddingGenerator:
    """
    Generates embeddings using AWS Bedrock.
    No heavy dependencies, no Docker needed!
    """
    
    def __init__(self):
        """Initialize Bedrock client."""
        self.model_name = os.getenv('EMBEDDING_MODEL', 'amazon.titan-embed-text-v1')
        self.region = os.getenv('AWS_REGION', 'us-east-1')
        
        # Initialize Bedrock client
        self.bedrock = boto3.client('bedrock-runtime', region_name=self.region)
        
        # Set vector size based on model
        if 'titan' in self.model_name.lower():
            self.vector_size = 1536  # Titan Embeddings
        elif 'cohere' in self.model_name.lower():
            self.vector_size = 1024  # Cohere Embed
        else:
            self.vector_size = 1536  # Default
        
        logger.info(f"Embedding generator initialized with Bedrock model: {self.model_name}")
    
    def generate(self, text: Union[str, List[str]]) -> Union[List[float], List[List[float]]]:
        """
        Generate embeddings for text using AWS Bedrock.
        
        Args:
            text: Single text string or list of strings
            
        Returns:
            Single embedding vector or list of vectors
        """
        if not text:
            logger.warning("Empty text provided, returning zero vector")
            return [0.0] * self.vector_size
        
        is_single = isinstance(text, str)
        texts = [text] if is_single else text
        
        try:
            embeddings = []
            
            for t in texts:
                # Prepare request based on model
                if 'titan' in self.model_name.lower():
                    body = json.dumps({"inputText": t})
                elif 'cohere' in self.model_name.lower():
                    body = json.dumps({"texts": [t], "input_type": "search_document"})
                else:
                    body = json.dumps({"inputText": t})
                
                # Call Bedrock
                response = self.bedrock.invoke_model(
                    modelId=self.model_name,
                    body=body,
                    contentType='application/json',
                    accept='application/json'
                )
                
                # Parse response
                response_body = json.loads(response['body'].read())
                
                # Extract embedding based on model
                if 'titan' in self.model_name.lower():
                    embedding = response_body.get('embedding')
                elif 'cohere' in self.model_name.lower():
                    embedding = response_body.get('embeddings', [[]])[0]
                else:
                    embedding = response_body.get('embedding')
                
                embeddings.append(embedding)
                logger.debug(f"Generated embedding with dimension {len(embedding)}")
            
            return embeddings[0] if is_single else embeddings
            
        except Exception as e:
            logger.error(f"Error generating Bedrock embeddings: {str(e)}", exc_info=True)
            raise
    
    def get_vector_size(self) -> int:
        """Get the dimension of embedding vectors."""
        return self.vector_size


# Global instance (reused across Lambda invocations)
_embedding_generator = None


def get_embedding_generator() -> EmbeddingGenerator:
    """Get or create singleton embedding generator."""
    global _embedding_generator
    
    if _embedding_generator is None:
        _embedding_generator = EmbeddingGenerator()
    
    return _embedding_generator

