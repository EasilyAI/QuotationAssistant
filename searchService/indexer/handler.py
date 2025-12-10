"""
Indexer Lambda Handler

Triggered by DynamoDB Streams to index products into Qdrant.
"""

import os
import json
import logging
from typing import Dict, Any, List
import sys

# Add parent directory and shared path to sys.path for imports
SERVICE_ROOT = os.path.dirname(os.path.dirname(__file__))
REPO_ROOT = os.path.abspath(os.path.join(SERVICE_ROOT, ".."))
SHARED_DIR = os.path.join(REPO_ROOT, "shared")

for path in {SERVICE_ROOT, REPO_ROOT, SHARED_DIR}:
    if path not in sys.path:
        sys.path.append(path)

from shared.product_service import fetch_product
from shared.product_types import decode_dynamo_image

from schemas.product_model import Product
from .embedding_bedrock import get_embedding_generator  # Using Bedrock (no Docker needed!)
from .qdrant_client import QdrantManager
from .transformers import prepare_product_metadata, prepare_search_text

# Configure logging
logger = logging.getLogger(__name__)
logger.setLevel(os.getenv('LOG_LEVEL', 'INFO'))

# Global clients (reused across Lambda invocations)
qdrant_manager = None
embedding_generator = None


def get_qdrant_manager() -> QdrantManager:
    """Get or create Qdrant manager singleton."""
    global qdrant_manager
    
    if qdrant_manager is None:
        qdrant_manager = QdrantManager()
        # Ensure collection exists
        qdrant_manager.ensure_collection_exists()
    
    return qdrant_manager


def process_insert_or_modify(record: Dict[str, Any]) -> None:
    """
    ADD GET PRODUCT FUNCTION FROM OTHER SERVICE - TO GET ALL PRODUCT INFORMATION.
    
    Process INSERT or MODIFY events from DynamoDB Stream.
    
    Args:
        record: DynamoDB Stream record
    """
    try:
        # Extract new image
        new_image = record['dynamodb'].get('NewImage')
        if not new_image:
            logger.warning("No NewImage in record, skipping")
            return
        
        logger.info(f"NewImage: {json.dumps(new_image, indent=2)}")

        decoded_image = decode_dynamo_image(new_image)
        ordering_number = decoded_image.get('orderingNumber')

        if not ordering_number:
            keys = decode_dynamo_image(record['dynamodb'].get('Keys', {}))
            ordering_number = keys.get('orderingNumber')
        
        if not ordering_number:
            logger.error("Product missing orderingNumber, cannot index")
            return
        
        logger.info(f"Indexing product: {ordering_number}")
        
        # Fetch full product with pointers resolved (no snapshots)
        product_data = fetch_product(ordering_number)
        print(f"Product data: {json.dumps(product_data, indent=2)}")

        # Prepare text for embedding
        search_text = prepare_search_text(product_data)
        print(f"Search text: {json.dumps(search_text, indent=2)}")
        
        if not search_text or search_text.strip() == "":
            logger.warning(f"No searchable text for product {ordering_number}, skipping")
            return
        
        # Generate embedding
        embedding_gen = get_embedding_generator()
        vector = embedding_gen.generate(search_text)
        print(f"Successfully generated embedding vector")
        
        # Prepare metadata
        metadata = prepare_product_metadata(product_data)
        metadata["searchText"] = search_text
        print(f"Metadata: {json.dumps(metadata, indent=2)}")
        
        # Upsert to Qdrant
        qdrant = get_qdrant_manager()
        qdrant.upsert_product(
            ordering_number=ordering_number,
            vector=vector,
            metadata=metadata
        )
        
        logger.info(f"Successfully indexed product {ordering_number}")
        
    except Exception as e:
        logger.error(f"Error processing INSERT/MODIFY: {str(e)}", exc_info=True)
        raise


def process_remove(record: Dict[str, Any]) -> None:
    """
    Process REMOVE events from DynamoDB Stream.
    
    Args:
        record: DynamoDB Stream record
    """
    try:
        # Extract old image
        old_image = record['dynamodb'].get('OldImage')
        if not old_image:
            logger.warning("No OldImage in record, skipping")
            return
        
        # Parse product to get ID
        product = Product.from_dynamodb_stream(old_image)
        
        if not product.orderingNumber:
            logger.error("Product missing orderingNumber, cannot delete")
            return
        
        logger.info(f"Deleting product from index: {product.orderingNumber}")
        
        # Delete from Qdrant
        qdrant = get_qdrant_manager()
        qdrant.delete_product(product.orderingNumber)
        
        logger.info(f"Successfully deleted product {product.orderingNumber}")
        
    except Exception as e:
        logger.error(f"Error processing REMOVE: {str(e)}", exc_info=True)
        raise


def handle_initialize() -> Dict[str, Any]:
    """
    Handle manual initialization request.
    Ensures the Qdrant collection exists.
    
    Returns:
        Response with initialization results
    """
    try:
        logger.info("Manual initialization requested")
        qdrant = get_qdrant_manager()
        created = qdrant.ensure_collection_exists()
        
        message = "Collection created" if created else "Collection already exists"
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': message,
                'collection': qdrant.collection_name
            })
        }
    except Exception as e:
        logger.error(f"Initialization error: {str(e)}", exc_info=True)
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)})
        }


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Lambda handler for DynamoDB Stream events.
    
    Args:
        event: DynamoDB Stream event or manual invocation
        context: Lambda context
        
    Returns:
        Response with processing results
    """
    logger.info(f"Received event with {len(event.get('Records', []))} records")
    # logger.info(f"Event: {json.dumps(event, indent=2)}")

    # Handle manual initialization
    if event.get('action') == 'initialize':
        return handle_initialize()
    
    # Process stream records
    processed = 0
    failed = 0
    errors = []
    
    try:
        for record in event.get('Records', []):
            try:
                event_name = record.get('eventName')
                logger.info(f"Processing event: {event_name}")
                
                if event_name in ['INSERT', 'MODIFY']:
                    process_insert_or_modify(record)
                    processed += 1
                    
                elif event_name == 'REMOVE':
                    process_remove(record)
                    processed += 1
                    
                else:
                    logger.warning(f"Unknown event type: {event_name}")
                    
            except Exception as e:
                failed += 1
                error_msg = f"Error processing record: {str(e)}"
                logger.error(error_msg, exc_info=True)
                errors.append(error_msg)
        
        response = {
            'statusCode': 200 if failed == 0 else 207,
            'body': json.dumps({
                'message': f'Processed {processed} records, {failed} failed',
                'processed': processed,
                'failed': failed,
                'errors': errors
            })
        }
        
        logger.info(f"Batch complete: {processed} successful, {failed} failed")
        return response
        
    except Exception as e:
        logger.error(f"Fatal error in handler: {str(e)}", exc_info=True)
        return {
            'statusCode': 500,
            'body': json.dumps({
                'message': f'Fatal error: {str(e)}',
                'processed': processed,
                'failed': failed
            })
        }

