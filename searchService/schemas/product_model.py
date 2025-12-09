"""
Product data model schemas.
"""

from typing import Optional, Dict, Any
from dataclasses import dataclass


@dataclass
class Product:
    """Product data model matching DynamoDB schema."""
    
    orderingNumber: str
    category: str
    oneLiner: str
    specs: str
    manualNotes: str
    catalogProduct: Optional[Dict[str, Any]] = None
    priceListProducts: Optional[Dict[str, Any]] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            'orderingNumber': self.orderingNumber,
            'category': self.category,
            'oneLiner': self.oneLiner,
            'specs': self.specs,
            'manualNotes': self.manualNotes,
            'catalogProduct': self.catalogProduct,
            'priceListProducts': self.priceListProducts,
        }
    
    def get_search_text(self) -> str:
        """Get combined text for search indexing."""
        parts = []
        
        if self.orderingNumber:
            parts.append(f"SKU: {self.orderingNumber}")
        
        if self.category:
            parts.append(f"Category: {self.category}")
        
        if self.oneLiner:
            parts.append(self.oneLiner)
        
        if self.specs:
            parts.append(f"Specifications: {self.specs}")
        
        if self.manualNotes:
            parts.append(f"Notes: {self.manualNotes}")
        
        return " | ".join(parts)
    
    @classmethod
    def from_dynamodb(cls, item: Dict[str, Any]) -> 'Product':
        """Create Product from DynamoDB item (already deserialized)."""
        return cls(
            orderingNumber=item.get('orderingNumber', ''),
            category=item.get('category', ''),
            oneLiner=item.get('oneLiner', ''),
            specs=item.get('specs', ''),
            manualNotes=item.get('manualNotes', ''),
            catalogProduct=item.get('catalogProduct'),
            priceListProducts=item.get('priceListProducts'),
        )
    
    @classmethod
    def from_dynamodb_stream(cls, dynamodb_record: Dict[str, Any]) -> 'Product':
        """Create Product from DynamoDB Stream record format."""
        product_dict = {}
        
        for key, value in dynamodb_record.items():
            if isinstance(value, dict):
                # Extract actual value from DynamoDB format
                if 'S' in value:  # String
                    product_dict[key] = value['S']
                elif 'N' in value:  # Number
                    product_dict[key] = value['N']
                elif 'M' in value:  # Map
                    product_dict[key] = value['M']
                elif 'L' in value:  # List
                    product_dict[key] = value['L']
                elif 'BOOL' in value:  # Boolean
                    product_dict[key] = value['BOOL']
                elif 'NULL' in value:  # Null
                    product_dict[key] = None
            else:
                product_dict[key] = value
        
        return cls.from_dynamodb(product_dict)

