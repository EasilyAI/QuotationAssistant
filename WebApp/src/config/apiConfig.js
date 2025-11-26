// API Configuration
// Best Practice: Use environment variables for values that change per environment
// These values are NOT secrets (they're visible in browser network requests)
// but should be configurable for different environments (dev, staging, prod)

export const API_CONFIG = {
  // Base URL for your backend API
  // Set via REACT_APP_API_BASE_URL environment variable
  // Example: REACT_APP_API_BASE_URL=https://api.yourdomain.com
  // BASE_URL: process.env.REACT_APP_API_BASE_URL || 'http://localhost:3000',
  BASE_URL: 'http://localhost:3000',
  
  // Endpoint paths (not secrets, part of API contract)
  // Endpoint to get presigned URL for S3 upload
  // This endpoint should accept: POST /api/files/presigned-url
  // Body: { fileName: string, fileType: string, contentType: string }
  // Returns: { uploadUrl: string, fileKey: string, fileId: string }
  PRESIGNED_URL_ENDPOINT: '/api/files/presigned-url',
  
  // Endpoint to get file information after upload
  // This endpoint should accept: GET /api/files/{fileId}
  // Returns: { fileId, fileName, fileType, status, ...other file metadata }
  FILE_INFO_ENDPOINT: '/api/files',
  
  // S3 Bucket Configuration
  // Set via REACT_APP_S3_BUCKET environment variable
  // Bucket names are public (not secrets) but should be configurable per environment
  S3_BUCKET: process.env.REACT_APP_S3_BUCKET || 'hb-files-raw',
  S3_REGION: process.env.REACT_APP_S3_REGION || 'us-east-1',
};

