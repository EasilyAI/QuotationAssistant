import { API_CONFIG, buildSearchApiUrl } from '../config/apiConfig';
import { authenticatedFetch } from '../utils/apiClient';
import { getSearchApiKey } from '../utils/apiKeys';

/**
 * Execute a product search against the search API.
 *
 * Maps to the `/search` endpoint defined in `product-search-api/serverless.yml`.
 *
 * @param {Object} params
 * @param {string} params.query - Free-text search query (required, sent as `q`)
 * @param {string} [params.category] - Optional product category filter
 * @param {number} [params.size=30] - Number of results to retrieve before re-ranking (1–100)
 * @param {number} [params.minScore=0] - Minimum similarity score (0–1)
 * @param {boolean} [params.useAI=true] - Whether to enable LLM-based re-ranking
 * @param {number} [params.resultSize=5] - Number of results to return after re-ranking
 * @returns {Promise<Object>} Search response from the API
 */
export const searchProducts = async ({
  query,
  category,
  size = 30,
  minScore = 0,
  useAI = true,
  resultSize = 5,
} = {}) => {
  if (!query || !query.trim()) {
    throw new Error('Search query (q) is required');
  }

  const params = new URLSearchParams();
  params.set('q', query.trim());

  if (category && category !== 'All Types') {
    params.set('category', category);
  }

  if (size != null) {
    params.set('size', String(size));
  }

  if (minScore != null) {
    params.set('min_score', String(minScore));
  }

  if (useAI != null) {
    params.set('use_ai', String(useAI));
  }

  if (resultSize != null) {
    params.set('result_size', String(resultSize));
  }

  const url = `${buildSearchApiUrl(API_CONFIG.SEARCH_ENDPOINTS.SEARCH)}?${params.toString()}`;

  const response = await authenticatedFetch(url, { method: 'GET' }, 'search');

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to execute search' }));
    throw new Error(error.message || `Failed to execute search: ${response.statusText}`);
  }

  return response.json();
};

/**
 * Fetch autocomplete suggestions from the search API.
 *
 * Maps to the `/autocomplete` endpoint defined in `product-search-api/serverless.yml`.
 *
 * @param {Object} params
 * @param {string} params.query - Search prefix (required, sent as `q`)
 * @param {string} [params.category] - Optional product category filter
 * @param {number} [params.size=10] - Number of suggestions to return (1–20)
 * @param {AbortSignal} [params.signal] - AbortSignal for request cancellation
 * @returns {Promise<Object>} Autocomplete response from the API
 */
export const fetchAutocompleteSuggestions = async ({
  query,
  category,
  size = 10,
  signal,
} = {}) => {
  if (!query || !query.trim()) {
    throw new Error('Autocomplete query (q) is required');
  }

  const params = new URLSearchParams();
  params.set('q', query.trim());

  if (category && category !== 'All Types') {
    params.set('category', category);
  }

  if (size != null) {
    params.set('size', String(size));
  }

  const url = `${buildSearchApiUrl(API_CONFIG.SEARCH_ENDPOINTS.AUTOCOMPLETE)}?${params.toString()}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'X-Api-Key': getSearchApiKey()
    },
    signal, // Support request cancellation
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to fetch autocomplete suggestions' }));
    throw new Error(error.message || `Failed to fetch autocomplete suggestions: ${response.statusText}`);
  }

  return response.json();
};


