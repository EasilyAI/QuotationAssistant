import { buildSearchApiUrl } from '../config/apiConfig';

/**
 * Execute a batch product search against the search API.
 *
 * Maps to the `/batch-search` endpoint defined in `product-search-api/serverless.yml`.
 *
 * @param {Object} params
 * @param {Array} params.items - Array of items to search, each with:
 *   - orderingNumber (optional): Ordering number/SKU to search by
 *   - description (required if no orderingNumber): Description to search by
 *   - quantity (required): Quantity needed
 *   - productCategory (required): Product category from ProductCategory enum
 * @param {number} [params.size=30] - Number of results to retrieve before re-ranking (1–100)
 * @param {number} [params.minScore=0] - Minimum similarity score (0–1)
 * @param {boolean} [params.useAI=true] - Whether to enable LLM-based re-ranking (for description searches only)
 * @param {number} [params.resultSize=5] - Number of results to return after re-ranking
 * @returns {Promise<Object>} Batch search response from the API
 */
export const batchSearchProducts = async ({
  items,
  size = 30,
  minScore = 0,
  useAI = true,
  resultSize = 5,
} = {}) => {
  if (!items || !Array.isArray(items) || items.length === 0) {
    throw new Error('Items array is required and must not be empty');
  }

  // Validate items structure
  const invalidItems = items.filter(
    (item) =>
      !item.description &&
      !item.orderingNumber
  );
  if (invalidItems.length > 0) {
    throw new Error(
      'All items must have either an orderingNumber or description'
    );
  }

  const url = buildSearchApiUrl('/batch-search');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      items: items.map((item) => ({
        orderingNumber: item.orderingNumber || null,
        description: item.description || null,
        quantity: item.quantity || 1,
        productCategory: item.productType || item.productCategory,
      })),
      size,
      min_score: minScore,
      use_ai: useAI,
      result_size: resultSize,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({
      message: 'Failed to execute batch search',
    }));
    throw new Error(
      error.message || `Failed to execute batch search: ${response.statusText}`
    );
  }

  return response.json();
};

