"""
Product endpoint handler.
"""

import logging
import sys
import os
from typing import Dict, Any

# Add parent and shared directories to path
SERVICE_ROOT = os.path.dirname(os.path.dirname(__file__))
REPO_ROOT = os.path.abspath(os.path.join(SERVICE_ROOT, ".."))
SHARED_DIR = os.path.abspath(os.path.join(REPO_ROOT, "shared"))

for path in {SERVICE_ROOT, REPO_ROOT, SHARED_DIR}:
    if path not in sys.path:
        sys.path.append(path)

from shared.product_service import fetch_product, list_products_page
from .utils import get_query_params, create_response

# Configure logging
logger = logging.getLogger(__name__)


def handle_get_product(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    Handle product requests.

    Behavior:
      - If an orderingNumber is provided (path or query), return that single product.
      - If no orderingNumber is provided, return the first X products (limit, default 50).
    """
    try:
        path_params = event.get("pathParameters") or {}

        # Try path parameter first: /product/{orderingNumber}
        ordering_number = path_params.get("orderingNumber") or path_params.get(
            "orderingnumber"
        )

        # Fallback to query params (e.g. /product?orderingNumber=...)
        params = get_query_params(event)
        if not ordering_number:
            ordering_number = params.get("orderingNumber") or params.get(
                "orderingnumber"
            )

        # Parse limit for list mode (when no specific orderingNumber is provided)
        limit_param = params.get("limit")
        limit = None
        if limit_param is not None:
            try:
                limit = int(limit_param)
            except (TypeError, ValueError):
                # Invalid limit -> leave as None so shared helper applies defaults
                logger.warning(f"Invalid limit parameter value: {limit_param!r}")

        if ordering_number:
            logger.info(f"Fetching product {ordering_number}")
            product = fetch_product(ordering_number)
            return create_response(200, product)

        # No ordering number provided – mirror legacy behavior: list first X products
        effective_limit = limit if limit is not None else 50
        logger.info(
            f"No orderingNumber provided, listing first {effective_limit} products"
        )
        products_page = list_products_page(limit=effective_limit)
        return create_response(200, products_page)

    except ValueError as e:
        return create_response(404, {"error": str(e)})
    except Exception as e:
        logger.error(f"Get product error: {str(e)}", exc_info=True)
        return create_response(
            500,
            {
                "error": "Internal server error",
                "message": "Failed to retrieve product",
            },
        )

