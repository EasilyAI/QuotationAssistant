import { API_CONFIG, buildFileApiUrl, buildSearchApiUrl } from '../config/apiConfig';

/**
 * Check for existing products by ordering numbers
 * @param {string[]} orderingNumbers - Array of ordering numbers to check
 * @returns {Promise<Object>} Object with existing products keyed by orderingNumber
 */
export const checkExistingProducts = async (orderingNumbers) => {
  const response = await fetch(
    buildFileApiUrl(API_CONFIG.FILE_ENDPOINTS.PRODUCTS_CHECK_EXISTING),
    {
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
 * Save catalog products to the products table
 * This function is specifically for saving products extracted from catalog files
 * @param {Array<Object>} products - Array of products from catalog review to save
 * @returns {Promise<Object>} Save result
 */
export const saveProductsFromCatalog = async (products) => {
  const response = await fetch(
    buildFileApiUrl(API_CONFIG.FILE_ENDPOINTS.PRODUCTS_FROM_CATALOG),
    {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ products }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to save products from catalog' }));
    throw new Error(error.message || `Failed to save products from catalog: ${response.statusText}`);
  }

  return response.json();
};

/**
 * Save price list products to the products table
 * This function is specifically for saving products from price list files
 * @param {Array<Object>} products - Array of products from price list review to save
 * @returns {Promise<Object>} Save result
 */
export const saveProductsFromPriceList = async (products) => {
  const response = await fetch(
    buildFileApiUrl(API_CONFIG.FILE_ENDPOINTS.PRODUCTS_FROM_PRICE_LIST),
    {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ products }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to save products from price list' }));
    throw new Error(error.message || `Failed to save products from price list: ${response.statusText}`);
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

  const response = await fetch(
    buildSearchApiUrl(`${API_CONFIG.SEARCH_ENDPOINTS.PRODUCT}/${encodeURIComponent(orderingNumber)}`),
    {
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

  const url = `${buildSearchApiUrl(API_CONFIG.SEARCH_ENDPOINTS.PRODUCT)}${
    searchParams.toString() ? `?${searchParams.toString()}` : ''
  }`;
  const response = await fetch(url);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to fetch products' }));
    throw new Error(error.message || `Failed to fetch products: ${response.statusText}`);
  }

  return response.json();
};

