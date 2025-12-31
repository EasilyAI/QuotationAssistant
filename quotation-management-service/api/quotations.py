"""
Quotation CRUD endpoint handlers.
"""

import os
import logging
from typing import Dict, Any

from api.utils import get_query_params, get_path_parameter, get_request_body, create_response
from schemas.validation import validate_create_quotation, validate_update_quotation
from services.quotation_service import (
    create_quotation_item,
    get_quotation,
    list_quotations,
    update_quotation,
    delete_quotation
)

logger = logging.getLogger(__name__)
logger.setLevel(os.getenv('LOG_LEVEL', 'INFO'))


def handle_create_quotation(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    Handle POST /quotations - Create quotation.
    """
    logger.info(f"[CREATE-QUOTATION] Handling create quotation request")
    try:
        body = get_request_body(event)
        
        # Validate request
        is_valid, error = validate_create_quotation(body)
        if not is_valid:
            return create_response(400, {'error': 'Validation error', 'message': error})
        
        # Create quotation
        quotation = create_quotation_item(body)
        logger.info(f"[CREATE-QUOTATION] Created quotation {quotation['name']}, ID: {quotation['quotation_id'][:8]}")
        return create_response(201, quotation)
        
    except Exception as e:
        logger.error(f"[CREATE-QUOTATION] Error creating quotation: {str(e)}", exc_info=True)
        # Don't expose internal error details
        return create_response(500, {'error': 'Internal server error', 'message': 'Failed to create quotation'})


def handle_get_quotations(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    Handle GET /quotations - List quotations.
    
    Query parameters:
    - status: Filter by status
    - search: Search query
    - recent: Get recent quotations (true/false)
    - incomplete: Filter incomplete items (true/false)
    - limit: Maximum results (default 50)
    """
    try:
        logger.info(f"[GET-QUOTATIONS] Handling list quotations request")
        params = get_query_params(event)
        
        status = params.get('status')
        search_query = params.get('search') or params.get('q')
        recent = params.get('recent', '').lower() == 'true'
        incomplete = params.get('incomplete', '').lower() == 'true'
        limit = int(params.get('limit', 50))
        logger.info(f"[GET-QUOTATIONS] Status: {status}, Search query: {search_query}, Recent: {recent}, Incomplete: {incomplete}, Limit: {limit}")
        
        quotations = list_quotations(
            status=status,
            search_query=search_query,
            recent=recent,
            incomplete=incomplete,
            limit=limit
        )
        
        logger.info(f"[GET-QUOTATIONS] Listed {len(quotations)} quotations")
        
        return create_response(200, {
            'quotations': quotations,
            'count': len(quotations)
        })
        
    except Exception as e:
        logger.error(f"[GET-QUOTATIONS] Error listing quotations: {str(e)}", exc_info=True)
        return create_response(500, {'error': 'Internal server error', 'message': 'Failed to list quotations'})


def handle_get_quotation(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    Handle GET /quotations/{quotationId} - Get quotation.
    """
    logger.info(f"[GET-QUOTATION] Handling get single quotation request")
    try:
        quotation_id = get_path_parameter(event, 'quotationId')
        logger.info(f"[GET-QUOTATION] Quotation ID: {quotation_id}")
        
        if not quotation_id:
            return create_response(400, {'error': 'Missing quotationId'})
        
        quotation = get_quotation(quotation_id)
        logger.info(f"[GET-QUOTATION] Quotation: {quotation}")
        
        if not quotation:
            return create_response(404, {'error': 'Quotation not found'})
        
        return create_response(200, quotation)
        
    except Exception as e:
        logger.error(f"[GET-QUOTATION] Error getting quotation: {str(e)}", exc_info=True)
        return create_response(500, {'error': 'Internal server error', 'message': 'Failed to get quotation'})


def handle_update_quotation(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    Handle PUT /quotations/{quotationId} - Update quotation.
    """
    logger.info(f"[UPDATE-QUOTATION] Handling update quotation request")
    try:
        quotation_id = get_path_parameter(event, 'quotationId')
        logger.info(f"[UPDATE-QUOTATION] Quotation ID: {quotation_id}")
        
        if not quotation_id:
            return create_response(400, {'error': 'Missing quotationId'})
        
        body = get_request_body(event)
        
        # Validate request
        is_valid, error = validate_update_quotation(body)
        if not is_valid:
            return create_response(400, {'error': 'Validation error', 'message': error})
        
        # Update quotation
        quotation = update_quotation(quotation_id, body)
        logger.info(f"[UPDATE-QUOTATION] Updated quotation: {quotation}")
        
        if not quotation:
            return create_response(404, {'error': 'Quotation not found'})
        
        return create_response(200, quotation)
        
    except Exception as e:
        logger.error(f"Error updating quotation: {str(e)}", exc_info=True)
        return create_response(500, {'error': 'Internal server error', 'message': 'Failed to update quotation'})


def handle_update_status(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    Handle PATCH /quotations/{quotationId}/status - Update status.
    """
    try:
        quotation_id = get_path_parameter(event, 'quotationId')
        
        if not quotation_id:
            return create_response(400, {'error': 'Missing quotationId'})
        
        body = get_request_body(event)
        
        if 'status' not in body:
            return create_response(400, {'error': 'Missing status field'})
        
        # Update quotation status
        quotation = update_quotation(quotation_id, {'status': body['status']})
        
        if not quotation:
            return create_response(404, {'error': 'Quotation not found'})
        
        return create_response(200, quotation)
        
    except Exception as e:
        logger.error(f"Error updating status: {str(e)}", exc_info=True)
        return create_response(500, {'error': 'Internal server error', 'message': 'Failed to update status'})


def handle_delete_quotation(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    Handle DELETE /quotations/{quotationId} - Delete quotation.
    """
    try:
        quotation_id = get_path_parameter(event, 'quotationId')
        
        if not quotation_id:
            return create_response(400, {'error': 'Missing quotationId'})
        
        success = delete_quotation(quotation_id)
        
        if not success:
            return create_response(404, {'error': 'Quotation not found'})
        
        return create_response(200, {'message': 'Quotation deleted successfully'})
        
    except Exception as e:
        logger.error(f"Error deleting quotation: {str(e)}", exc_info=True)
        return create_response(500, {'error': 'Internal server error', 'message': 'Failed to delete quotation'})

