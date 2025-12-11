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

from shared.product_service import fetch_product
from .utils import get_query_params, create_response

# Configure logging
logger = logging.getLogger(__name__)


def handle_get_product(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    Handle /product/{orderingNumber} requests.
    """
    try:
        path_params = event.get("pathParameters") or {}
        ordering_number = path_params.get("orderingNumber") or path_params.get("orderingnumber")

        if not ordering_number:
            # allow query param fallback
            params = get_query_params(event)
            ordering_number = params.get("orderingNumber") or params.get("orderingnumber")

        if not ordering_number:
            return create_response(400, {"error": "orderingNumber is required"})

        logger.info(f"Fetching product {ordering_number}")
        product = fetch_product(ordering_number)
        return create_response(200, product)

    except ValueError as e:
        return create_response(404, {"error": str(e)})
    except Exception as e:
        logger.error(f"Get product error: {str(e)}", exc_info=True)
        return create_response(500, {
            "error": "Internal server error",
            "message": str(e)
        })

