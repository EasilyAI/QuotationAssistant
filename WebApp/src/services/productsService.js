import { API_CONFIG } from '../config/apiConfig';

const getBaseUrl = () => {
  const base = API_CONFIG.BASE_URL || '';
  return base.endsWith('/') ? base.slice(0, -1) : base;
};

/**
 * Check for existing products by ordering numbers
 * @param {string[]} orderingNumbers - Array of ordering numbers to check
 * @returns {Promise<Object>} Object with existing products keyed by orderingNumber
 */
export const checkExistingProducts = async (orderingNumbers) => {
  const baseUrl = getBaseUrl();

  const response = await fetch(`${baseUrl}/api/products/check-existing`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ orderingNumbers }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to check existing products' }));
    throw new Error(error.message || `Failed to check existing products: ${response.statusText}`);
  }

  return response.json();
};

/**
 * Save products to the products table
 * @param {Array<Object>} products - Array of products to save
 * @returns {Promise<Object>} Save result
 */
export const saveProducts = async (products) => {
  const baseUrl = getBaseUrl();

  const response = await fetch(`${baseUrl}/api/products`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ products }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to save products' }));
    throw new Error(error.message || `Failed to save products: ${response.statusText}`);
  }

  return response.json();
};

/**
 * Fetch a product by its ordering number
 * @param {string} orderingNumber
 * @returns {Promise<Object>}
 */
export const fetchProductByOrderingNumber = async (orderingNumber) => {
  if (!orderingNumber) {
    throw new Error('orderingNumber is required');
  }

  const baseUrl = getBaseUrl();
  const response = await fetch(`${baseUrl}/api/products/${encodeURIComponent(orderingNumber)}`, {
    method: 'GET',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to fetch product' }));
    throw new Error(error.message || `Failed to fetch product: ${response.statusText}`);
  }

  return response.json();
};

/**
 * List products with optional category filtering
 * @param {{ productCategory?: string; limit?: number; cursor?: string }} params
 * @returns {Promise<{ products: Object[]; count: number; hasMore: boolean; cursor?: string }>}
 */
export const fetchProducts = async (params = {}) => {
  const baseUrl = getBaseUrl();
  const { productCategory, limit = 50, cursor } = params;

  const searchParams = new URLSearchParams();
  if (productCategory && productCategory !== 'All Types') {
    searchParams.set('category', productCategory);
  }
  if (limit) {
    searchParams.set('limit', String(limit));
  }
  if (cursor) {
    searchParams.set('cursor', cursor);
  }

  const url = `${baseUrl}/api/products${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
  const response = await fetch(url);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to fetch products' }));
    throw new Error(error.message || `Failed to fetch products: ${response.statusText}`);
  }

  return response.json();
};

