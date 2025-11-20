import { API_CONFIG } from '../config/apiConfig';

/**
 * Check for existing products by ordering numbers
 * @param {string[]} orderingNumbers - Array of ordering numbers to check
 * @returns {Promise<Object>} Object with existing products keyed by orderingNumber
 */
export const checkExistingProducts = async (orderingNumbers) => {
  const baseUrl = API_CONFIG.BASE_URL.endsWith('/')
    ? API_CONFIG.BASE_URL.slice(0, -1)
    : API_CONFIG.BASE_URL;

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
  const baseUrl = API_CONFIG.BASE_URL.endsWith('/')
    ? API_CONFIG.BASE_URL.slice(0, -1)
    : API_CONFIG.BASE_URL;

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

