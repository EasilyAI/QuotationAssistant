import { API_CONFIG } from '../config/apiConfig';

/**
 * Service for uploading files directly to S3 using presigned URLs
 */

/**
 * Request a presigned URL from the backend API
 * @param {string} fileName - Name of the file to upload
 * @param {string} fileType - Type of file (catalog, sales-drawing, price-list)
 * @param {string} contentType - MIME type of the file (e.g., 'application/pdf')
 * @returns {Promise<{uploadUrl: string, fileKey: string}>}
 */
const getPresignedUrl = async (fileName, fileType, contentType) => {
  // Normalize URL to avoid double slashes
  const baseUrl = API_CONFIG.BASE_URL.endsWith('/') 
    ? API_CONFIG.BASE_URL.slice(0, -1) 
    : API_CONFIG.BASE_URL;
  const endpoint = API_CONFIG.PRESIGNED_URL_ENDPOINT.startsWith('/')
    ? API_CONFIG.PRESIGNED_URL_ENDPOINT
    : `/${API_CONFIG.PRESIGNED_URL_ENDPOINT}`;
  
  const response = await fetch(`${baseUrl}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // TODO: Add authentication header if needed
      // 'Authorization': `Bearer ${getAuthToken()}`,
    },
    body: JSON.stringify({
      fileName,
      fileType,
      contentType,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to get presigned URL' }));
    throw new Error(error.message || `Failed to get presigned URL: ${response.statusText}`);
  }

  return response.json();
};

/**
 * Upload file directly to S3 using presigned URL
 * @param {File} file - File object to upload
 * @param {string} uploadUrl - Presigned URL from backend
 * @param {Function} onProgress - Optional progress callback (progress: number) => void
 * @returns {Promise<void>}
 */
const uploadToS3 = async (file, uploadUrl, onProgress) => {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    // Track upload progress
    if (onProgress) {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percentComplete = (e.loaded / e.total) * 100;
          onProgress(percentComplete);
        }
      });
    }

    xhr.addEventListener('load', () => {
      if (xhr.status === 200 || xhr.status === 204) {
        resolve();
      } else {
        reject(new Error(`Upload failed with status: ${xhr.status}`));
      }
    });

    xhr.addEventListener('error', () => {
      reject(new Error('Upload failed due to network error'));
    });

    xhr.addEventListener('abort', () => {
      reject(new Error('Upload was aborted'));
    });

    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.send(file);
  });
};

/**
 * Upload a file to S3
 * @param {File} file - File to upload
 * @param {string} fileType - Type of file (catalog, sales-drawing, price-list)
 * @param {Function} onProgress - Optional progress callback (progress: number) => void
 * @returns {Promise<{fileKey: string, fileUrl: string, fileId: string}>}
 */
export const uploadFileToS3 = async (file, fileType, onProgress) => {
  try {
    // Step 1: Get presigned URL from backend
    const { uploadUrl, fileKey, fileId } = await getPresignedUrl(
      file.name,
      fileType,
      file.type
    );

    // Step 2: Upload file directly to S3
    await uploadToS3(file, uploadUrl, onProgress);

    // Step 3: Return file key, URL, and fileId
    // TODO: Update this URL format based on your S3 bucket configuration
    const fileUrl = `https://${API_CONFIG.S3_BUCKET}.s3.${API_CONFIG.S3_REGION}.amazonaws.com/${fileKey}`;
    
    return {
      fileKey,
      fileUrl,
      fileId,
    };
  } catch (error) {
    console.error('S3 upload error:', error);
    throw error;
  }
};

/**
 * Get file information/status from backend after upload
 * @param {string} fileId - File ID returned from presigned URL
 * @returns {Promise<Object>} File information from backend
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
 * Validate file before upload
 * @param {File} file - File to validate
 * @param {string} fileType - Type of file
 * @returns {Object} { valid: boolean, error?: string }
 */
export const validateFile = (file, fileType) => {
  // Check if file is provided
  if (!file) {
    return { valid: false, error: 'No file selected' };
  }

  // Check file size (e.g., max 50MB)
  const maxSize = 50 * 1024 * 1024; // 50MB
  if (file.size > maxSize) {
    return { valid: false, error: 'File size exceeds 50MB limit' };
  }

  // Validate file type based on fileType parameter
  if (fileType === 'catalog' || fileType === 'sales-drawing') {
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      return { valid: false, error: 'Only PDF files are allowed for catalogs and sales drawings' };
    }
  } else if (fileType === 'price-list') {
    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel', // .xls
      'text/csv', // .csv
    ];
    const allowedExtensions = ['.xlsx', '.xls', '.csv'];
    const hasValidType = allowedTypes.includes(file.type);
    const hasValidExtension = allowedExtensions.some(ext => 
      file.name.toLowerCase().endsWith(ext)
    );
    
    if (!hasValidType && !hasValidExtension) {
      return { valid: false, error: 'Only Excel (.xlsx, .xls) or CSV files are allowed for price lists' };
    }
  }

  return { valid: true };
};

