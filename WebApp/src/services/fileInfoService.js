import { API_CONFIG } from '../config/apiConfig';
import { BusinessFileType } from '../types/index';

/** Service for retrieving file information and checking file existence */



export const getFiles = async () => {
  const response = await fetch(`${API_CONFIG.BASE_URL}/api/files`, {
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
  // Normalize URL to avoid double slashes
  const baseUrl = API_CONFIG.BASE_URL.endsWith('/') 
    ? API_CONFIG.BASE_URL.slice(0, -1) 
    : API_CONFIG.BASE_URL;
  const endpoint = API_CONFIG.FILE_INFO_ENDPOINT.startsWith('/')
    ? API_CONFIG.FILE_INFO_ENDPOINT
    : `/${API_CONFIG.FILE_INFO_ENDPOINT}`;
  
  const response = await fetch(`${baseUrl}${endpoint}/${fileId}`, {
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
  const baseUrl = API_CONFIG.BASE_URL.endsWith('/')
    ? API_CONFIG.BASE_URL.slice(0, -1)
    : API_CONFIG.BASE_URL;
  const endpoint = API_CONFIG.FILE_INFO_ENDPOINT.startsWith('/')
    ? API_CONFIG.FILE_INFO_ENDPOINT
    : `/${API_CONFIG.FILE_INFO_ENDPOINT}`;

  const response = await fetch(`${baseUrl}${endpoint}/download-url`, {
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
 * Get products extracted from a file
 * @param {string} fileId - File ID
 * @returns {Promise<Object>} Products data from the file
 */
export const getFileProducts = async (fileId) => {
  // Normalize URL to avoid double slashes
  const baseUrl = API_CONFIG.BASE_URL.endsWith('/') 
    ? API_CONFIG.BASE_URL.slice(0, -1) 
    : API_CONFIG.BASE_URL;
  const endpoint = API_CONFIG.FILE_INFO_ENDPOINT.startsWith('/')
    ? API_CONFIG.FILE_INFO_ENDPOINT
    : `/${API_CONFIG.FILE_INFO_ENDPOINT}`;
  
  const response = await fetch(`${baseUrl}${endpoint}/${fileId}/products`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      // TODO: Add authentication header if needed
      // 'Authorization': `Bearer ${getAuthToken()}`,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to get products' }));
    throw new Error(error.message || `Failed to get products: ${response.statusText}`);
  }

  return response.json();
};

/**
 * Persist reviewed catalog products for a file
 * @param {string} fileId
 * @param {Array<object>} products
 */
export const updateFileProducts = async (fileId, products) => {
  const baseUrl = API_CONFIG.BASE_URL.endsWith('/')
    ? API_CONFIG.BASE_URL.slice(0, -1)
    : API_CONFIG.BASE_URL;
  const endpoint = API_CONFIG.FILE_INFO_ENDPOINT.startsWith('/')
    ? API_CONFIG.FILE_INFO_ENDPOINT
    : `/${API_CONFIG.FILE_INFO_ENDPOINT}`;

  const response = await fetch(`${baseUrl}${endpoint}/${fileId}/products`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      // TODO: Add authentication header if needed
      // 'Authorization': `Bearer ${getAuthToken()}`,
    },
    body: JSON.stringify({ products }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to update products' }));
    throw new Error(error.message || `Failed to update products: ${response.statusText}`);
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
      if (status === 'completed') {
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
 * @returns {Promise<{exists: boolean, file?: Object}>} Object with exists flag and file details if exists
 */
export const checkFileExistsInS3 = async (formData, fileType) => {
  try {
    // Normalize URL to avoid double slashes
    const baseUrl = API_CONFIG.BASE_URL.endsWith('/') 
      ? API_CONFIG.BASE_URL.slice(0, -1) 
      : API_CONFIG.BASE_URL;
    const endpoint = API_CONFIG.FILE_INFO_ENDPOINT.startsWith('/')
      ? API_CONFIG.FILE_INFO_ENDPOINT
      : `/${API_CONFIG.FILE_INFO_ENDPOINT}`;
    
    // Build request body based on file type
    const requestBody = {
      BusinessFileType: fileType,
    };

    requestBody.fileName = formData.fileName;
    requestBody.year = formData.year;

    // Add file type specific identifiers
    if (fileType === BusinessFileType.Catalog) {
      requestBody.catalogSerialNumber = formData.catalogSerialNumber;
    } else if (fileType === BusinessFileType.SalesDrawing) {
      requestBody.orderingNumber = formData.orderingNumber;
    }

    const response = await fetch(`${baseUrl}${endpoint}/check-file-exists`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // TODO: Add authentication header if needed
        // 'Authorization': `Bearer ${getAuthToken()}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      // If endpoint doesn't exist yet, assume file doesn't exist (don't block upload)
      if (response.status === 404) {
        console.warn('[checkFileExistsInS3] Check endpoint not implemented, skipping check');
        return { exists: false };
      }
      const error = await response.json().catch(() => ({ message: 'Failed to check file existence' }));
      throw new Error(error.message || `Failed to check file existence: ${response.statusText}`);
    }

    const result = await response.json();
    return {
      exists: result.exists || false,
      file: result.file || null
    };
  } catch (error) {
    // If check fails, log warning but don't block upload
    // This allows uploads to proceed even if the check endpoint is not yet implemented
    console.warn('[checkFileExistsInS3] Error checking file existence:', error.message);
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
  
  if (fileCheckResult.exists && fileCheckResult.file) {
    const errorMessage = buildFileExistsMessage(fileCheckResult.file, fileType);
    return {
      valid: false,
      error: errorMessage
    };
  }
  
  return { valid: true };
};

