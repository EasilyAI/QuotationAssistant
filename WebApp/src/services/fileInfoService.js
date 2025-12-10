import { API_CONFIG, buildFileApiUrl } from '../config/apiConfig';
import { BusinessFileType } from '../types/index';

/** Service for retrieving file information and checking file existence */



export const getFiles = async () => {
  const response = await fetch(buildFileApiUrl(API_CONFIG.FILE_ENDPOINTS.FILES), {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      // 'Authorization': `Bearer ${getAuthToken()}`,
    },
  });
  return response.json();
};


/**
 * Get file information/status from backend after upload
 * @param {string} fileId - File ID returned from presigned URL
 * @returns {Promise<Object>} File information from backend including status and processing metadata
 */
export const getFileInfo = async (fileId) => {
  const response = await fetch(
    buildFileApiUrl(`${API_CONFIG.FILE_ENDPOINTS.FILES}/${fileId}`),
    {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      // TODO: Add authentication header if needed
      // 'Authorization': `Bearer ${getAuthToken()}`,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to get file information' }));
    throw new Error(error.message || `Failed to get file information: ${response.statusText}`);
  }

  return response.json();
};

/**
 * Request a presigned download URL for a given S3 key.
 * @param {string} key - S3 object key
 * @returns {Promise<{url: string}>}
 */
export const getFileDownloadUrl = async (key) => {
  const response = await fetch(buildFileApiUrl(API_CONFIG.FILE_ENDPOINTS.DOWNLOAD_URL), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ key }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to get file download URL' }));
    throw new Error(error.message || `Failed to get file download URL: ${response.statusText}`);
  }

  return response.json();
};

/**
 * Get catalog products extracted from a file
 * @param {string} fileId - File ID
 * @returns {Promise<Object>} Products data from the file
 */
export const getCatalogProducts = async (fileId) => {
  const response = await fetch(
    buildFileApiUrl(`${API_CONFIG.FILE_ENDPOINTS.FILES}/${fileId}/catalog-products`),
    {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to get catalog products' }));
    throw new Error(error.message || `Failed to get catalog products: ${response.statusText}`);
  }

  return response.json();
};

/**
 * Get price list products extracted from a file
 * @param {string} fileId - File ID
 * @returns {Promise<Object>} Products data from the file
 */
export const getPriceListProducts = async (fileId) => {
  const response = await fetch(
    buildFileApiUrl(`${API_CONFIG.FILE_ENDPOINTS.FILES}/${fileId}/price-list-products`),
    {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to get price list products' }));
    throw new Error(error.message || `Failed to get price list products: ${response.statusText}`);
  }

  return response.json();
};

/**
 * Get products extracted from a file based on file type
 * @param {string} fileId - File ID
 * @param {string} businessFileType - Type of file (Catalog, Price List, etc.)
 * @returns {Promise<Object>} Products data from the file
 */
export const getFileProducts = async (fileId, businessFileType = 'Catalog') => {
  if (businessFileType === BusinessFileType.PriceList || businessFileType === 'Price List') {
    return getPriceListProducts(fileId);
  }
  return getCatalogProducts(fileId);
};

/**
 * Persist reviewed catalog products for a file
 * @param {string} fileId
 * @param {Array<object>} products
 */
export const updateCatalogProducts = async (fileId, products) => {
  const response = await fetch(
    buildFileApiUrl(`${API_CONFIG.FILE_ENDPOINTS.FILES}/${fileId}/catalog-products`),
    {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ products }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to update catalog products' }));
    throw new Error(error.message || `Failed to update catalog products: ${response.statusText}`);
  }

  return response.json();
};

/**
 * Persist reviewed price list products for a file
 * @param {string} fileId
 * @param {Array<object>} products
 */
export const updatePriceListProducts = async (fileId, products) => {
  const response = await fetch(
    buildFileApiUrl(`${API_CONFIG.FILE_ENDPOINTS.FILES}/${fileId}/price-list-products`),
    {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ products }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to update price list products' }));
    throw new Error(error.message || `Failed to update price list products: ${response.statusText}`);
  }

  return response.json();
};

/**
 * Persist reviewed products for a file (generic - detects type)
 * @deprecated Use updateCatalogProducts or updatePriceListProducts instead
 * @param {string} fileId
 * @param {Array<object>} products
 */
export const updateFileProducts = async (fileId, products) => {
  // For backward compatibility - try to detect type from products
  // Catalog products have 'specs', price list products have 'price'
  const isPriceList = products.length > 0 && 'price' in products[0];
  
  if (isPriceList) {
    return updatePriceListProducts(fileId, products);
  }
  return updateCatalogProducts(fileId, products);
};

/**
 * Mark a file review as completed
 * @param {string} fileId
 */
export const completeFileReview = async (fileId) => {
  const response = await fetch(
    buildFileApiUrl(`${API_CONFIG.FILE_ENDPOINTS.FILES}/${fileId}/complete`),
    {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to update file status' }));
    throw new Error(error.message || `Failed to update file status: ${response.statusText}`);
  }

  return response.json();
};

/**
 * Poll file status until processing is complete
 * @param {string} fileId - File ID to poll
 * @param {Function} onStatusUpdate - Callback for status updates (status, fileInfo) => void
 * @param {number} maxAttempts - Maximum number of polling attempts (default: 60)
 * @param {number} intervalMs - Interval between polls in milliseconds (default: 2000)
 * @returns {Promise<Object>} Final file info when processing is complete
 */
export const pollFileStatus = async (fileId, onStatusUpdate, maxAttempts = 60, intervalMs = 2000) => {
  let attempts = 0;
  
  while (attempts < maxAttempts) {
    try {
      const fileInfo = await getFileInfo(fileId);
      const status = fileInfo.status;
      
      // Call status update callback
      if (onStatusUpdate) {
        onStatusUpdate(status, fileInfo);
      }
      
      // Check if processing is complete
      if (status === 'pending_review' || status === 'pending_review_with_errors' || status === 'completed') {
        console.log('[pollFileStatus] Processing completed successfully');
        return fileInfo;
      }
      
      // Check if processing failed - STOP immediately, don't retry
      if (status === 'failed') {
        const errorMsg = fileInfo.error || fileInfo.processingStage || 'File processing failed';
        console.error('[pollFileStatus] Processing failed:', errorMsg);
        throw new Error(errorMsg);
      }
      
      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, intervalMs));
      attempts++;
      
    } catch (error) {
      // If status is 'failed', throw immediately (don't retry)
      if (error.message && (error.message.includes('failed') || error.message.includes('Failed'))) {
        throw error;
      }
      
      // For network errors, retry up to maxAttempts
      console.warn(`[pollFileStatus] Attempt ${attempts + 1}/${maxAttempts} failed:`, error.message);
      
      if (attempts >= maxAttempts - 1) {
        throw new Error(`Failed to get file status after ${maxAttempts} attempts: ${error.message}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, intervalMs));
      attempts++;
    }
  }
  
  throw new Error(`File processing timed out after ${maxAttempts * intervalMs / 1000} seconds`);
};


/**
 * Format a timestamp into a readable date string
 * @param {any} timestamp - Timestamp to format (string or number)
 * @returns {string} Formatted date string
 */
const formatCreatedAt = (timestamp) => {
  if (!timestamp) return 'Unknown date';
  try {
    const ts = typeof timestamp === 'string' ? parseInt(timestamp, 10) : timestamp;
    return new Date(ts).toLocaleDateString();
  } catch {
    return 'Unknown date';
  }
};

/**
 * Build an error message for when a file already exists
 * @param {Object} file - File information object
 * @param {string} fileType - Type of file (BusinessFileType enum)
 * @returns {string} Formatted error message
 */
const buildFileExistsMessage = (file, fileType) => {
  const fields = {
    'File Name': file.fileName,
    'Year': file.year,
    'Catalog Serial Number': fileType === BusinessFileType.Catalog ? file.catalogSerialNumber : null,
    'Ordering Number': fileType === BusinessFileType.SalesDrawing ? file.orderingNumber : null,
    'Status': file.status,
    'Created': formatCreatedAt(file.createdAt)
  };

  return `A file with this information already exists:\n\n${
    Object.entries(fields)
      .filter(([_, value]) => value)
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n')
  }`;
};

/**
 * Check if a file already exists in S3 based on form data
 * @param {Object} formData - Form data containing file information
 * @param {string} fileType - Type of file (BusinessFileType enum)
 * @returns {Promise<{exists: boolean, file?: Object, error?: string, status?: number, isClientError?: boolean}>}
 *          Object with exists flag and file details if exists, or error metadata for client-side validation
 */
export const checkFileExistsInS3 = async (formData, fileType) => {
  try {
    console.log('[checkFileExistsInS3] Starting existence check', {
      fileType,
      fileName: formData?.fileName,
      year: formData?.year,
    });

    // Build request body based on file type
    const requestBody = {
      // IMPORTANT: Align with backend field names
      // Backend expects: fileType, fileName, year, catalogSerialNumber, orderingNumber
      fileType,
    };

    // Normalize filename to lowercase to avoid case-sensitive duplicates
    requestBody.fileName = formData.fileName ? formData.fileName.toLowerCase() : formData.fileName;
    requestBody.year = formData.year;

    // Add file type specific identifiers
    if (fileType === BusinessFileType.Catalog) {
      requestBody.catalogSerialNumber = formData.catalogSerialNumber;
    } else if (fileType === BusinessFileType.SalesDrawing) {
      requestBody.orderingNumber = formData.orderingNumber;
    }

    console.log('[checkFileExistsInS3] Request payload for backend check_file_exists:', requestBody);

    const response = await fetch(
      buildFileApiUrl(API_CONFIG.FILE_ENDPOINTS.CHECK_EXISTS),
      {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // TODO: Add authentication header if needed
        // 'Authorization': `Bearer ${getAuthToken()}`,
      },
      body: JSON.stringify(requestBody),
    });

    const result = await response.json().catch(() => ({}));

    // Endpoint not found -> keep existing behavior (don't block upload)
    if (response.status === 404) {
      console.warn('[checkFileExistsInS3] Check endpoint not implemented (404), skipping existence check');
      return { exists: false };
    }

    // 2xx -> normal success path
    if (response.ok) {
      const exists = !!result.exists;
      console.log('[checkFileExistsInS3] Backend responded successfully', {
        status: response.status,
        exists,
        reason: result.reason,
      });
      return {
        exists,
        file: result.file || null,
      };
    }

    // 4xx -> treat as validation / client error that SHOULD block the upload
    if (response.status >= 400 && response.status < 500) {
      const message =
        result.error ||
        result.message ||
        `Failed to check file existence: ${response.statusText}`;
      console.warn('[checkFileExistsInS3] Client/validation error from backend', {
        status: response.status,
        message,
        result,
      });
      return {
        exists: false,
        error: message,
        status: response.status,
        isClientError: true,
      };
    }

    // 5xx -> log but do NOT block the upload (treat as best-effort check)
    const serverMessage =
      result.error ||
      result.message ||
      `Failed to check file existence: ${response.statusText}`;
    console.warn('[checkFileExistsInS3] Server error during existence check, allowing upload to proceed', {
      status: response.status,
      message: serverMessage,
    });
    return {
      exists: false,
      error: serverMessage,
      status: response.status,
    };
  } catch (error) {
    // If check fails, log warning but don't block upload
    // This allows uploads to proceed even if the check endpoint is not yet implemented
    console.warn('[checkFileExistsInS3] Network or unexpected error checking file existence, allowing upload to proceed:', error.message);
    return { exists: false };
  }
};

/**
 * Validate that a file does not already exist in S3
 * @param {Object} formData - Form data containing file information
 * @param {string} fileType - Type of file (BusinessFileType enum)
 * @returns {Promise<{valid: boolean, error?: string}>} Validation result with error message if file exists
 */
export const validateFileDoesNotExist = async (formData, fileType) => {
  const fileCheckResult = await checkFileExistsInS3(formData, fileType);
  
   // If backend reported a client/validation error (e.g. missing year for price list),
   // surface it as a blocking validation error.
   if (fileCheckResult.isClientError && fileCheckResult.error) {
     console.warn('[validateFileDoesNotExist] Blocking upload due to backend validation error:', fileCheckResult.error);
     return {
       valid: false,
       error: fileCheckResult.error,
     };
   }

  if (fileCheckResult.exists && fileCheckResult.file) {
    const errorMessage = buildFileExistsMessage(fileCheckResult.file, fileType);
    console.warn('[validateFileDoesNotExist] Blocking upload because a matching file already exists');
    return {
      valid: false,
      error: errorMessage
    };
  }
  
  return { valid: true };
};

/**
 * Delete a file and all associated data (S3 objects, database records)
 * @param {string} fileId - File ID to delete
 * @returns {Promise<Object>} Deletion result
 */
export const deleteFile = async (fileId) => {
  const response = await fetch(
    buildFileApiUrl(`${API_CONFIG.FILE_ENDPOINTS.FILES}/${fileId}`),
    {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      // TODO: Add authentication header if needed
      // 'Authorization': `Bearer ${getAuthToken()}`,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to delete file' }));
    throw new Error(error.message || error.error || `Failed to delete file: ${response.statusText}`);
  }

  return response.json();
};

