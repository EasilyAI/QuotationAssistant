// API Configuration
// Best Practice: Use environment variables for values that change per environment
// These values are NOT secrets (they're visible in browser network requests)
// but should be configurable for different environments (dev, staging, prod)

// Normalize helpers to keep URL building consistent across the app
const normalizeBaseUrl = (baseUrl = '') =>
  baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl || '';

const normalizeEndpoint = (endpoint = '') =>
  endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

export const API_CONFIG = {
  // Base URL for the file processing service (extractCatalogInfo)
  // Set via REACT_APP_API_BASE_URL environment variable
  FILE_API_BASE_URL: process.env.REACT_APP_API_BASE_URL || 'http://localhost:3000',

  // Base URL for the product search service (product-search-service)
  // Set via REACT_APP_SEARCH_API_BASE_URL environment variable
  // Defaults to FILE_API_BASE_URL for local/dev convenience
  SEARCH_API_BASE_URL:
    // process.env.REACT_APP_SEARCH_API_BASE_URL ||
    'http://localhost:3000',

  // Base URL for the quotation management service
  // Set via REACT_APP_QUOTATION_API_BASE_URL environment variable
  QUOTATION_API_BASE_URL:
    // process.env.REACT_APP_QUOTATION_API_BASE_URL ||
    'http://localhost:3004',

  // Extract Catalog Info service endpoints (see extractCatalogInfo/serverless.yml)
  FILE_ENDPOINTS: {
    FILES: '/api/files',
    PRESIGNED_URL: '/api/files/presigned-url',
    DOWNLOAD_URL: '/api/files/download-url',
    CHECK_EXISTS: '/api/files/check-file-exists',
    COMPLETE_REVIEW: '/api/files', // add /{fileId}/complete in callers
    CATALOG_PRODUCTS: '/api/files', // add /{fileId}/catalog-products in callers
    PRICE_LIST_PRODUCTS: '/api/files', // add /{fileId}/price-list-products in callers
    PRODUCTS: '/api/products',
    PRODUCTS_CHECK_EXISTING: '/api/products/check-existing',
    PRODUCTS_FROM_CATALOG: '/api/products/from-catalog',
    PRODUCTS_FROM_PRICE_LIST: '/api/products/from-price-list',
  },

  // Product search service endpoints (see searchService/serverless.yml)
  SEARCH_ENDPOINTS: {
    SEARCH: '/search',
    AUTOCOMPLETE: '/autocomplete',
    PRODUCT: '/product', // append /{orderingNumber} in callers
  },

  // Quotation management service endpoints
  QUOTATION_ENDPOINTS: {
    QUOTATIONS: '/quotations',
    QUOTATION: '/quotations', // append /{quotationId} in callers
    LINES: '/quotations', // append /{quotationId}/lines in callers
    EXPORTS: '/quotations', // append /{quotationId}/exports/{type} in callers
    EMAIL_DRAFT: '/quotations', // append /{quotationId}/email-draft in callers
  },

  // S3 Bucket Configuration (public values, configurable per environment)
  S3_BUCKET: process.env.REACT_APP_S3_BUCKET || 'hb-files-raw',
  S3_REGION: process.env.REACT_APP_S3_REGION || 'us-east-1',
};

export const getFileApiBaseUrl = () => normalizeBaseUrl(API_CONFIG.FILE_API_BASE_URL);
export const getSearchApiBaseUrl = () =>
  normalizeBaseUrl(API_CONFIG.SEARCH_API_BASE_URL || API_CONFIG.FILE_API_BASE_URL);
export const getQuotationApiBaseUrl = () =>
  normalizeBaseUrl(API_CONFIG.QUOTATION_API_BASE_URL);

export const buildFileApiUrl = (endpoint = '') =>
  `${getFileApiBaseUrl()}${normalizeEndpoint(endpoint)}`;

export const buildSearchApiUrl = (endpoint = '') =>
  `${getSearchApiBaseUrl()}${normalizeEndpoint(endpoint)}`;

export const buildQuotationApiUrl = (endpoint = '') =>
  `${getQuotationApiBaseUrl()}${normalizeEndpoint(endpoint)}`;

