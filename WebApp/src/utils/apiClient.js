/**
 * API Client utility with automatic authentication.
 * 
 * Automatically adds Cognito Bearer token or API key (fallback) to all requests.
 */

import { getAuthToken } from '../services/authService';
import { getFileApiKey, getQuotationApiKey, getSearchApiKey } from './apiKeys';

/**
 * Get authentication headers for API requests.
 * Tries Cognito token first, falls back to API key if not authenticated.
 * 
 * @param {string} serviceType - 'file', 'quotation', or 'search'
 * @returns {Promise<Object>} Headers object with Authorization or X-Api-Key
 */
const getAuthHeaders = async (serviceType = 'quotation') => {
  const headers = {};
  
  // Try Cognito token first
  const token = await getAuthToken();
  if (token) {
    headers['Authorization'] = token; // Already includes "Bearer " prefix
    return headers;
  }
  
  // Fallback to API keys for development
  let apiKey = '';
  switch (serviceType) {
    case 'file':
      apiKey = getFileApiKey();
      break;
    case 'search':
      apiKey = getSearchApiKey();
      break;
    case 'quotation':
    default:
      apiKey = getQuotationApiKey();
      break;
  }
  
  if (apiKey) {
    headers['X-Api-Key'] = apiKey;
  }
  
  return headers;
};

/**
 * Authenticated fetch wrapper.
 * Automatically adds authentication headers to requests.
 * 
 * @param {string} url - Request URL
 * @param {Object} options - Fetch options
 * @param {string} serviceType - Service type for API key fallback ('file', 'quotation', 'search')
 * @returns {Promise<Response>} Fetch response
 */
export const authenticatedFetch = async (url, options = {}, serviceType = 'quotation') => {
  const authHeaders = await getAuthHeaders(serviceType);
  
  const mergedOptions = {
    ...options,
    headers: {
      ...authHeaders,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  };
  
  return fetch(url, mergedOptions);
};

