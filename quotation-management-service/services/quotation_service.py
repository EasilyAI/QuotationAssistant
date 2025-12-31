"""
Quotation business logic service.
"""

import os
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime
from decimal import Decimal
import boto3
from boto3.dynamodb.conditions import Key, Attr

from schemas.quotation_model import create_quotation, QuotationStatus
from services.price_service import calculate_quotation_totals

logger = logging.getLogger(__name__)
logger.setLevel(os.getenv('LOG_LEVEL', 'INFO'))

# Configure log format
LOG_PREFIX = "[QUOTATION-SERVICE]"

QUOTATIONS_TABLE = os.getenv('QUOTATIONS_TABLE', 'quotations')

# Configure DynamoDB for local development
# When running serverless offline, we need to use AWS profile or credentials
dynamodb_endpoint = os.getenv('DYNAMODB_ENDPOINT')
aws_profile = os.getenv('AWS_PROFILE', os.getenv('AWS_DEFAULT_PROFILE'))
region = os.getenv('AWS_REGION', os.getenv('AWS_DEFAULT_REGION', 'us-east-1'))

if dynamodb_endpoint:
    # Use DynamoDB Local
    logger.info(f"Using DynamoDB Local endpoint: {dynamodb_endpoint}")
    dynamodb = boto3.resource('dynamodb', endpoint_url=dynamodb_endpoint)
elif aws_profile:
    # Use AWS profile (for serverless offline with real AWS)
    logger.info(f"Using AWS profile: {aws_profile} in region: {region}")
    session = boto3.Session(profile_name=aws_profile, region_name=region)
    dynamodb = session.resource('dynamodb')
else:
    # Use default AWS credentials (from environment or ~/.aws/credentials)
    logger.info(f"Using default AWS credentials in region: {region}")
    dynamodb = boto3.resource('dynamodb', region_name=region)

logger.info(f"QUOTATIONS_TABLE: {QUOTATIONS_TABLE}")

def get_quotations_table():
    """Get DynamoDB table."""
    return dynamodb.Table(QUOTATIONS_TABLE)


def create_quotation_item(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Create a new quotation.
    
    Args:
        data: Quotation data from request
    
    Returns:
        Created quotation
    """
    # Convert float values to Decimal
    vat_rate = data.get('vat_rate')
    if vat_rate is not None:
        vat_rate = Decimal(str(vat_rate))
    
    global_margin_pct = data.get('global_margin_pct', 0.0)
    if global_margin_pct is not None:
        global_margin_pct = Decimal(str(global_margin_pct))
    
    quotation = create_quotation(
        name=data.get('name'),
        customer=data.get('customer'),
        currency=data.get('currency', 'ILS'),
        vat_rate=vat_rate,
        global_margin_pct=global_margin_pct,
        notes=data.get('notes'),
        status=data.get('status', QuotationStatus.DRAFT)
    )
    
    table = get_quotations_table()
    table.put_item(Item=quotation)
    
    logger.info(f"{LOG_PREFIX} CREATE | ID: {quotation['quotation_id'][:8]}... | Name: {quotation['name']}")
    return quotation


def get_quotation(quotation_id: str) -> Optional[Dict[str, Any]]:
    """
    Get quotation by ID.
    
    Args:
        quotation_id: Quotation ID
    
    Returns:
        Quotation or None if not found
    """
    table = get_quotations_table()
    
    try:
        response = table.get_item(Key={'quotation_id': quotation_id})
        item = response.get('Item')
        if item:
            logger.debug(f"{LOG_PREFIX} GET | ID: {quotation_id[:8]}... | Found")
        else:
            logger.warning(f"{LOG_PREFIX} GET | ID: {quotation_id[:8]}... | Not found")
        return item
    except Exception as e:
        logger.error(f"{LOG_PREFIX} GET | ID: {quotation_id[:8]}... | Error: {str(e)}")
        return None


def list_quotations(
    status: Optional[str] = None,
    search_query: Optional[str] = None,
    recent: bool = False,
    incomplete: bool = False,
    limit: int = 50
) -> List[Dict[str, Any]]:
    """
    List quotations with optional filtering.
    
    Args:
        status: Filter by status
        search_query: Search in name, customer name, quotation number
        recent: Return recent quotations (sorted by created_at desc)
        incomplete: Filter for quotations with incomplete items
        limit: Maximum number of results
    
    Returns:
        List of quotations
    """
    table = get_quotations_table()
    quotations = []
    
    try:
        if status:
            # Use GSI1 (StatusIndex)
            response = table.query(
                IndexName='StatusIndex',
                KeyConditionExpression=Key('status').eq(status),
                Limit=limit
            )
            quotations = response.get('Items', [])
        elif recent:
            # Use GSI2 (CreatedAtIndex) - scan and sort
            response = table.scan(
                IndexName='CreatedAtIndex',
                Limit=limit * 2  # Get more to sort
            )
            items = response.get('Items', [])
            # Sort by created_at descending
            items.sort(key=lambda x: x.get('created_at', ''), reverse=True)
            quotations = items[:limit]
        else:
            # Scan all
            response = table.scan(Limit=limit)
            quotations = response.get('Items', [])
        
        # Apply search filter
        if search_query:
            search_lower = search_query.lower()
            quotations = [
                q for q in quotations
                if search_lower in q.get('name', '').lower()
                or search_lower in str(q.get('quotation_id', '')).lower()
                or search_lower in (q.get('customer', {}).get('name', '') or '').lower()
            ]
        
        # Filter incomplete items if requested
        if incomplete:
            quotations = [
                q for q in quotations
                if any(
                    not line.get('ordering_number') or not line.get('ordering_number').strip()
                    for line in q.get('lines', [])
                )
            ]
        
        logger.info(f"{LOG_PREFIX} LIST | Count: {len(quotations)} | Status: {status or 'all'}")
        return quotations
        
    except Exception as e:
        logger.error(f"{LOG_PREFIX} LIST | Error: {str(e)}")
        return []


def update_quotation(quotation_id: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Update quotation header fields.
    
    Args:
        quotation_id: Quotation ID
        data: Update data
    
    Returns:
        Updated quotation or None if not found
    """
    table = get_quotations_table()
    
    # Get existing quotation
    quotation = get_quotation(quotation_id)
    if not quotation:
        return None
    
    # Build update expression
    update_expr_parts = []
    expr_attr_names = {}
    expr_attr_values = {}
    
    updatable_fields = [
        'name', 'customer', 'currency', 'vat_rate',
        'global_margin_pct', 'notes', 'status'
    ]
    
    for field in updatable_fields:
        if field in data:
            value = data[field]
            # Convert float to Decimal for numeric fields
            if field in ['vat_rate', 'global_margin_pct'] and value is not None:
                value = Decimal(str(value))
            update_expr_parts.append(f"#{field} = :{field}")
            expr_attr_names[f"#{field}"] = field
            expr_attr_values[f":{field}"] = value
    
    if not update_expr_parts:
        return quotation  # No updates
    
    # Always update updated_at
    update_expr_parts.append("#updated_at = :updated_at")
    expr_attr_names["#updated_at"] = "updated_at"
    expr_attr_values[":updated_at"] = datetime.utcnow().isoformat() + "Z"
    
    # Recalculate totals if margin or VAT changed
    if 'global_margin_pct' in data or 'vat_rate' in data:
        global_margin = data.get('global_margin_pct', quotation.get('global_margin_pct', Decimal('0.0')))
        if isinstance(global_margin, (int, float)):
            global_margin = Decimal(str(global_margin))
        vat_rate = data.get('vat_rate', quotation.get('vat_rate', Decimal('0.18')))
        if isinstance(vat_rate, (int, float)):
            vat_rate = Decimal(str(vat_rate))
        totals = calculate_quotation_totals(
            quotation.get('lines', []),
            vat_rate,
            global_margin
        )
        update_expr_parts.append("#totals = :totals")
        expr_attr_names["#totals"] = "totals"
        expr_attr_values[":totals"] = totals
    
    try:
        response = table.update_item(
            Key={'quotation_id': quotation_id},
            UpdateExpression=f"SET {', '.join(update_expr_parts)}",
            ExpressionAttributeNames=expr_attr_names,
            ExpressionAttributeValues=expr_attr_values,
            ReturnValues='ALL_NEW'
        )
        updated_fields = list(data.keys())
        logger.info(f"{LOG_PREFIX} UPDATE | ID: {quotation_id[:8]}... | Fields: {', '.join(updated_fields)}")
        return response.get('Attributes')
    except Exception as e:
        logger.error(f"{LOG_PREFIX} UPDATE | ID: {quotation_id[:8]}... | Error: {str(e)}")
        return None


def delete_quotation(quotation_id: str) -> bool:
    """
    Delete quotation.
    
    Args:
        quotation_id: Quotation ID
    
    Returns:
        True if deleted, False otherwise
    """
    table = get_quotations_table()
    
    try:
        table.delete_item(Key={'quotation_id': quotation_id})
        logger.info(f"{LOG_PREFIX} DELETE | ID: {quotation_id[:8]}...")
        return True
    except Exception as e:
        logger.error(f"{LOG_PREFIX} DELETE | ID: {quotation_id[:8]}... | Error: {str(e)}")
        return False


def update_quotation_totals(quotation_id: str, quotation: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
    """
    Recalculate and update quotation totals.
    
    Args:
        quotation_id: Quotation ID
        quotation: Optional quotation data (if provided, avoids fetching)
    
    Returns:
        Updated quotation or None if not found
    """
    # Fetch quotation if not provided
    if quotation is None:
        quotation = get_quotation(quotation_id)
        if not quotation:
            return None
    
    totals = calculate_quotation_totals(
        quotation.get('lines', []),
        quotation.get('vat_rate', 0.18),
        quotation.get('global_margin_pct', 0.0)
    )
    
    table = get_quotations_table()
    try:
        response = table.update_item(
            Key={'quotation_id': quotation_id},
            UpdateExpression="SET #totals = :totals, #updated_at = :updated_at",
            ExpressionAttributeNames={
                '#totals': 'totals',
                '#updated_at': 'updated_at'
            },
            ExpressionAttributeValues={
                ':totals': totals,
                ':updated_at': datetime.utcnow().isoformat() + "Z"
            },
            ReturnValues='ALL_NEW'
        )
        return response.get('Attributes')
    except Exception as e:
        logger.error(f"Error updating totals for quotation {quotation_id}: {str(e)}")
        return None


def update_quotation_with_lines_and_totals(
    quotation_id: str,
    lines: List[Dict[str, Any]],
    quotation: Optional[Dict[str, Any]] = None
) -> Optional[Dict[str, Any]]:
    """
    Update quotation with new lines and recalculated totals in a single operation.
    This eliminates the need for double fetching.
    
    Args:
        quotation_id: Quotation ID
        lines: Updated list of line items
        quotation: Optional quotation data (if provided, avoids fetching for totals calculation)
    
    Returns:
        Updated quotation or None if not found
    """
    # Fetch quotation if not provided (needed for vat_rate and global_margin_pct)
    if quotation is None:
        quotation = get_quotation(quotation_id)
        if not quotation:
            return None
    
    # Calculate totals from the new lines
    vat_rate = quotation.get('vat_rate', Decimal('0.18'))
    if not isinstance(vat_rate, Decimal):
        vat_rate = Decimal(str(vat_rate))
    
    global_margin_pct = quotation.get('global_margin_pct', Decimal('0.0'))
    if not isinstance(global_margin_pct, Decimal):
        global_margin_pct = Decimal(str(global_margin_pct))
    
    totals = calculate_quotation_totals(lines, vat_rate, global_margin_pct)
    
    # Update quotation with lines and totals in a single operation
    table = get_quotations_table()
    try:
        response = table.update_item(
            Key={'quotation_id': quotation_id},
            UpdateExpression="SET #lines = :lines, #totals = :totals, #updated_at = :updated_at",
            ExpressionAttributeNames={
                '#lines': 'lines',
                '#totals': 'totals',
                '#updated_at': 'updated_at'
            },
            ExpressionAttributeValues={
                ':lines': lines,
                ':totals': totals,
                ':updated_at': datetime.utcnow().isoformat() + "Z"
            },
            ReturnValues='ALL_NEW'
        )
        return response.get('Attributes')
    except Exception as e:
        logger.error(f"Error updating quotation {quotation_id} with lines and totals: {str(e)}")
        return None

