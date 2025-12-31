/**
 * Centralized authentication utilities for frontend services.
 * 
 * Now uses AWS Cognito for authentication instead of API keys.
 * Falls back to API keys if Cognito is not configured (for development).
 */

import { getAuthToken } from '../services/authService';

/**
 * Get authentication header for API requests.
 * Uses Cognito token if available, falls back to API key.
 * 
 * @returns {Promise<string>} Authorization header value or empty string
 */
export const getAuthHeader = async () => {
  // Try Cognito token first
  const token = await getAuthToken();
  if (token) {
    return token; // Already includes "Bearer " prefix
  }
  
  // Fallback to API keys for development
  return getFileApiKey() ? `X-Api-Key: ${getFileApiKey()}` : '';
};

/**
 * Get API key for file-ingestion-service (fallback only)
 * @returns {string} API key or empty string
 */
export const getFileApiKey = () => {
  return process.env.REACT_APP_FILE_API_KEY || process.env.REACT_APP_QUOTATION_API_KEY || '';
};

/**
 * Get API key for quotation-management-service (fallback only)
 * @returns {string} API key or empty string
 */
export const getQuotationApiKey = () => {
  return process.env.REACT_APP_QUOTATION_API_KEY || '';
};

/**
 * Get API key for product-search-api (fallback only)
 * @returns {string} API key or empty string
 */
export const getSearchApiKey = () => {
  return process.env.REACT_APP_SEARCH_API_KEY || process.env.REACT_APP_QUOTATION_API_KEY || '';
};

