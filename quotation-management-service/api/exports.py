"""
Export endpoint handlers.
"""

import os
import logging
import base64
import re
from typing import Dict, Any

from api.utils import get_path_parameter, create_response
from services.export_service import (
    export_stock_check,
    export_priority_import
)
from services.quotation_service import get_quotation

logger = logging.getLogger(__name__)
logger.setLevel(os.getenv('LOG_LEVEL', 'INFO'))


def sanitize_filename(text: str) -> str:
    """
    Sanitize text for use in filenames.
    Removes or replaces invalid characters.
    """
    if not text:
        return ''
    # Replace invalid filename characters with underscores
    # Invalid chars: < > : " / \ | ? *
    sanitized = re.sub(r'[<>:"/\\|?*]', '_', text)
    # Replace multiple spaces/underscores with single underscore
    sanitized = re.sub(r'[\s_]+', '_', sanitized)
    # Remove leading/trailing underscores
    sanitized = sanitized.strip('_')
    # Limit length to avoid filesystem issues
    return sanitized[:100] if len(sanitized) > 100 else sanitized


def generate_export_filename(quotation: Dict[str, Any], export_type: str) -> str:
    """
    Generate filename for export using quotation name and customer.
    
    Args:
        quotation: Quotation data
        export_type: Type of export ('stock-check' or 'priority-import')
    
    Returns:
        Sanitized filename
    """
    # Extract quotation name
    quotation_name = quotation.get('name', 'Untitled')
    
    # Extract customer name (handle both string and object formats)
    customer_name = ''
    customer = quotation.get('customer')
    if isinstance(customer, str):
        customer_name = customer
    elif isinstance(customer, dict) and customer.get('name'):
        customer_name = customer.get('name', '')
    
    # Sanitize both names
    sanitized_quotation = sanitize_filename(quotation_name)
    sanitized_customer = sanitize_filename(customer_name)
    
    # Build filename: export-type_quotation-name_customer-name.xlsx
    if sanitized_customer:
        filename = f'{export_type}_{sanitized_quotation}_{sanitized_customer}.xlsx'
    else:
        filename = f'{export_type}_{sanitized_quotation}.xlsx'
    
    return filename


def handle_export_stock_check(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    Handle POST /quotations/{quotationId}/exports/stock-check - Generate stock check Excel.
    Returns Excel file as base64-encoded string for direct download.
    """
    try:
        quotation_id = get_path_parameter(event, 'quotationId')
        
        if not quotation_id:
            return create_response(400, {'error': 'Missing quotationId'})
        
        # Get quotation to extract name and customer for filename
        quotation = get_quotation(quotation_id)
        if not quotation:
            return create_response(404, {'error': 'Quotation not found'})
        
        # Generate export
        excel_data = export_stock_check(quotation_id)
        
        if not excel_data:
            return create_response(404, {'error': 'Quotation not found'})
        
        # Convert BytesIO to base64 for JSON response
        excel_bytes = excel_data.getvalue()
        excel_base64 = base64.b64encode(excel_bytes).decode('utf-8')
        
        # Generate filename using quotation name and customer
        filename = generate_export_filename(quotation, 'stock-check')
        
        # Return file data with metadata
        return create_response(200, {
            'filename': filename,
            'content_type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'data': excel_base64,
            'export_type': 'stock-check'
        })
        
    except Exception as e:
        logger.error(f"Error exporting stock check: {str(e)}", exc_info=True)
        return create_response(500, {'error': 'Internal server error', 'message': 'Export operation failed'})


def handle_export_priority_import(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    Handle POST /quotations/{quotationId}/exports/priority-import - Generate priority import Excel.
    Returns Excel file as base64-encoded string for direct download.
    """
    try:
        quotation_id = get_path_parameter(event, 'quotationId')
        
        if not quotation_id:
            return create_response(400, {'error': 'Missing quotationId'})
        
        # Get quotation to extract name and customer for filename
        quotation = get_quotation(quotation_id)
        if not quotation:
            return create_response(404, {'error': 'Quotation not found'})
        
        # Generate export
        excel_data = export_priority_import(quotation_id)
        
        if not excel_data:
            return create_response(404, {'error': 'Quotation not found'})
        
        # Convert BytesIO to base64 for JSON response
        excel_bytes = excel_data.getvalue()
        excel_base64 = base64.b64encode(excel_bytes).decode('utf-8')
        
        # Generate filename using quotation name and customer
        filename = generate_export_filename(quotation, 'priority-import')
        
        # Return file data with metadata
        return create_response(200, {
            'filename': filename,
            'content_type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'data': excel_base64,
            'export_type': 'priority-import'
        })
        
    except Exception as e:
        logger.error(f"Error exporting priority import: {str(e)}", exc_info=True)
        return create_response(500, {'error': 'Internal server error', 'message': 'Export operation failed'})


def handle_get_export_download(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    Handle GET /quotations/{quotationId}/exports/{exportType}/download - Generate export on-demand.
    This endpoint is kept for backward compatibility but generates the file on-demand.
    """
    try:
        quotation_id = get_path_parameter(event, 'quotationId')
        export_type = get_path_parameter(event, 'exportType')
        
        if not quotation_id:
            return create_response(400, {'error': 'Missing quotationId'})
        if not export_type:
            return create_response(400, {'error': 'Missing exportType'})
        
        # Validate export type
        if export_type not in ['stock-check', 'priority-import']:
            return create_response(400, {'error': 'Invalid exportType. Must be stock-check or priority-import'})
        
        # Get quotation to extract name and customer for filename
        quotation = get_quotation(quotation_id)
        if not quotation:
            return create_response(404, {'error': 'Quotation not found'})
        
        # Generate export on-demand
        if export_type == 'stock-check':
            excel_data = export_stock_check(quotation_id)
        else:
            excel_data = export_priority_import(quotation_id)
        
        if not excel_data:
            return create_response(404, {'error': 'Quotation not found'})
        
        # Generate filename using quotation name and customer
        filename = generate_export_filename(quotation, export_type)
        
        # Convert to base64
        excel_bytes = excel_data.getvalue()
        excel_base64 = base64.b64encode(excel_bytes).decode('utf-8')
        
        return create_response(200, {
            'filename': filename,
            'content_type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'data': excel_base64,
            'export_type': export_type
        })
        
    except Exception as e:
        logger.error(f"Error getting export download: {str(e)}", exc_info=True)
        return create_response(500, {'error': 'Internal server error', 'message': 'Export operation failed'})

