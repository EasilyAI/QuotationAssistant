// API Configuration
// TODO: Update these values with your actual API endpoint and S3 bucket details

export const API_CONFIG = {
  // Base URL for your backend API
  // Example: 'https://api.yourdomain.com' or 'http://localhost:3001'
  // BASE_URL: process.env.REACT_APP_API_BASE_URL || 'YOUR_API_BASE_URL_HERE',
  BASE_URL: 'https://3knsgg9rw3.execute-api.us-east-1.amazonaws.com/',
  
  // Endpoint to get presigned URL for S3 upload
  // This endpoint should accept: POST /api/files/presigned-url
  // Body: { fileName: string, fileType: string, contentType: string }
  // Returns: { uploadUrl: string, fileKey: string }
  PRESIGNED_URL_ENDPOINT: '/api/files/presigned-url',
  
  // S3 Bucket Configuration
  S3_BUCKET: 'hb-files-raw',
  S3_REGION: process.env.REACT_APP_S3_REGION || 'us-east-1',
};

