"""
Data models for quotations and line items.
"""

from typing import Dict, Any, List, Optional
from datetime import datetime
from enum import Enum
from decimal import Decimal


class QuotationStatus(str, Enum):
    """Quotation status enumeration."""
    DRAFT = "Draft"
    IN_PROGRESS = "In Progress"
    AWAITING_APPROVAL = "Awaiting Approval"
    APPROVED = "Approved"
    ORDER = "Order"
    QUOTE_REJECTED = "Quote Rejected"
    QUOTE_CANCELED = "Quote Canceled"
    NOT_APPLICABLE = "Not Applicable"
    QUOTE_REVISION = "Quote Revision"


class LineItemSource(str, Enum):
    """Source of line item creation."""
    SEARCH = "search"
    MANUAL = "manual"
    IMPORT = "import"


class Currency(str, Enum):
    """Supported currencies."""
    ILS = "ILS"
    USD = "USD"
    EUR = "EUR"


def create_line_item(
    ordering_number: Optional[str] = None,
    product_name: str = "",
    description: Optional[str] = None,
    quantity: float = 1.0,
    base_price: Optional[float] = None,
    margin_pct: Optional[float] = None,
    final_price: Optional[float] = None,
    drawing_link: Optional[str] = None,
    catalog_link: Optional[str] = None,
    notes: Optional[str] = None,
    source: str = LineItemSource.MANUAL,
    product_ref: Optional[Dict[str, Any]] = None,
    line_id: Optional[str] = None,
    original_request: Optional[str] = None
) -> Dict[str, Any]:
    """
    Create a line item dictionary.
    
    Args:
        ordering_number: Unique catalog identifier
        product_name: Product name (defaults to 'Item' if empty)
        description: Product description / specifications
        quantity: Quantity (required, >0)
        base_price: Base price from price list (None if not found)
        margin_pct: Per-line margin percentage (0..1)
        final_price: Computed final price
        drawing_link: S3 key for sketch drawing
        catalog_link: Catalog link URL
        notes: Line item notes
        source: How line was created (search/manual/import)
        product_ref: Optional reference to Products table
        line_id: Line item ID (auto-generated if not provided)
        original_request: Original customer request text
    
    Returns:
        Line item dictionary
    """
    import uuid
    from datetime import datetime
    
    now = datetime.utcnow().isoformat() + "Z"
    
    # Handle base_price - None indicates price not found
    base_price_value = None
    if base_price is not None:
        try:
            base_price_value = Decimal(str(base_price))
        except (ValueError, TypeError) as e:
            # Invalid base_price, set to None
            base_price_value = None
    
    # Validate and convert quantity
    try:
        quantity_decimal = Decimal(str(quantity))
        if quantity_decimal <= 0:
            quantity_decimal = Decimal('1.0')
    except (ValueError, TypeError):
        quantity_decimal = Decimal('1.0')
    
    # Validate and convert margin_pct
    margin_pct_decimal = None
    if margin_pct is not None:
        try:
            margin_pct_decimal = Decimal(str(margin_pct))
            if margin_pct_decimal < 0 or margin_pct_decimal > 1:
                margin_pct_decimal = None
        except (ValueError, TypeError):
            margin_pct_decimal = None
    
    # Validate and convert final_price
    final_price_decimal = None
    if final_price is not None:
        try:
            final_price_decimal = Decimal(str(final_price))
        except (ValueError, TypeError):
            final_price_decimal = None
    
    return {
        "line_id": line_id or str(uuid.uuid4()),
        "ordering_number": ordering_number or "",
        "product_name": product_name or "Item",
        "description": description or "",
        "quantity": quantity_decimal,
        "base_price": base_price_value,
        "margin_pct": margin_pct_decimal,
        "final_price": final_price_decimal,
        "drawing_link": drawing_link,
        "catalog_link": catalog_link,
        "notes": notes or "",
        "source": source,
        "product_ref": product_ref or {},
        "original_request": original_request or "",
        "created_at": now,
        "updated_at": now
    }


def create_quotation(
    name: Optional[str] = None,
    customer: Optional[Dict[str, Any]] = None,
    currency: str = Currency.ILS,
    vat_rate: Optional[float] = None,
    global_margin_pct: Optional[float] = None,
    notes: Optional[str] = None,
    quotation_id: Optional[str] = None,
    status: str = QuotationStatus.DRAFT
) -> Dict[str, Any]:
    """
    Create a quotation dictionary.
    
    Args:
        name: Quotation name (default: "Quotation - <date>")
        customer: Customer information dict
        currency: Currency code (ILS/USD/EUR)
        vat_rate: VAT rate (default from env)
        global_margin_pct: Global margin percentage (0..1)
        notes: Quotation notes
        quotation_id: Quotation ID (auto-generated if not provided)
        status: Quotation status
    
    Returns:
        Quotation dictionary
    """
    import uuid
    import os
    from datetime import datetime
    
    now = datetime.utcnow().isoformat() + "Z"
    
    if not name:
        name = f"Quotation - {datetime.utcnow().strftime('%Y-%m-%d')}"
    
    if vat_rate is None:
        vat_rate = Decimal(os.getenv('VAT_RATE', '0.18'))
    else:
        vat_rate = Decimal(str(vat_rate))
    
    if global_margin_pct is None:
        global_margin_pct = Decimal('0.0')
    else:
        global_margin_pct = Decimal(str(global_margin_pct))
    
    return {
        "quotation_id": quotation_id or str(uuid.uuid4()),
        "name": name,
        "created_at": now,
        "updated_at": now,
        "status": status,
        "customer": customer or {},
        "currency": currency,
        "vat_rate": vat_rate,
        "global_margin_pct": global_margin_pct,
        "notes": notes or "",
        "lines": [],
        "totals": {
            "subtotal": Decimal('0.0'),
            "vat_total": Decimal('0.0'),
            "total": Decimal('0.0')
        },
        "exports": {
            "last_exported_at": None
        }
    }

