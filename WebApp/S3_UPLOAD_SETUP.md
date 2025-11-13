# S3 File Upload Setup Guide

This guide explains how to configure the S3 file upload functionality for the FileUpload component.

## Overview

The file upload system uses **presigned URLs** to upload files directly from the browser to S3. This approach is secure and efficient as it doesn't require exposing AWS credentials to the frontend.

## Architecture

1. **Frontend** requests a presigned URL from your backend API
2. **Backend** generates a presigned URL with appropriate permissions
3. **Frontend** uploads the file directly to S3 using the presigned URL

## Configuration Steps

### 1. Update API Configuration

Edit `/webApp/src/config/apiConfig.js` and update the following:

```javascript
export const API_CONFIG = {
  // Replace with your actual backend API base URL
  BASE_URL: 'https://api.yourdomain.com', // or 'http://localhost:3001' for local dev
  
  // Endpoint path (usually doesn't need to change)
  PRESIGNED_URL_ENDPOINT: '/api/files/presigned-url',
  
  // Replace with your S3 bucket name
  S3_BUCKET: 'your-bucket-name',
  
  // Replace with your AWS region
  S3_REGION: 'us-east-1', // or your preferred region
};
```

### 2. Environment Variables (Optional but Recommended)

Create a `.env` file in the `webApp` directory:

```env
REACT_APP_API_BASE_URL=https://api.yourdomain.com
REACT_APP_S3_BUCKET=your-bucket-name
REACT_APP_S3_REGION=us-east-1
```

The config file will automatically use these environment variables if they're set.

### 3. Backend API Endpoint

You need to implement a backend endpoint that generates presigned URLs. The endpoint should:

**Request:**
- Method: `POST`
- Path: `/api/files/presigned-url`
- Headers: `Content-Type: application/json`
- Body:
  ```json
  {
    "fileName": "example.pdf",
    "fileType": "catalog",
    "contentType": "application/pdf"
  }
  ```

**Response:**
```json
{
  "uploadUrl": "https://your-bucket.s3.amazonaws.com/path/to/file?X-Amz-Algorithm=...",
  "fileKey": "uploads/catalog/2024/example.pdf"
}
```

### 4. Backend Implementation Example (Node.js/Express)

```javascript
const AWS = require('aws-sdk');
const s3 = new AWS.S3({
  region: process.env.AWS_REGION || 'us-east-1'
});

app.post('/api/files/presigned-url', async (req, res) => {
  const { fileName, fileType, contentType } = req.body;
  
  // Generate a unique file key
  const timestamp = Date.now();
  const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
  const fileKey = `uploads/${fileType}/${new Date().getFullYear()}/${timestamp}-${sanitizedFileName}`;
  
  // Generate presigned URL
  const params = {
    Bucket: process.env.S3_BUCKET,
    Key: fileKey,
    ContentType: contentType,
    Expires: 3600, // URL expires in 1 hour
  };
  
  try {
    const uploadUrl = await s3.getSignedUrlPromise('putObject', params);
    res.json({ uploadUrl, fileKey });
  } catch (error) {
    console.error('Error generating presigned URL:', error);
    res.status(500).json({ error: 'Failed to generate upload URL' });
  }
});
```

### 5. Backend Implementation Example (Python/Flask)

```python
import boto3
from flask import Flask, request, jsonify
from datetime import datetime

s3_client = boto3.client('s3', region_name='us-east-1')

@app.route('/api/files/presigned-url', methods=['POST'])
def get_presigned_url():
    data = request.json
    file_name = data.get('fileName')
    file_type = data.get('fileType')
    content_type = data.get('contentType')
    
    # Generate a unique file key
    timestamp = int(datetime.now().timestamp() * 1000)
    sanitized_file_name = file_name.replace(' ', '_').replace('/', '_')
    file_key = f"uploads/{file_type}/{datetime.now().year}/{timestamp}-{sanitized_file_name}"
    
    # Generate presigned URL
    try:
        upload_url = s3_client.generate_presigned_url(
            'put_object',
            Params={
                'Bucket': os.getenv('S3_BUCKET'),
                'Key': file_key,
                'ContentType': content_type,
            },
            ExpiresIn=3600  # URL expires in 1 hour
        )
        
        return jsonify({
            'uploadUrl': upload_url,
            'fileKey': file_key
        })
    except Exception as e:
        print(f'Error generating presigned URL: {e}')
        return jsonify({'error': 'Failed to generate upload URL'}), 500
```

### 6. AWS S3 Bucket Configuration

Ensure your S3 bucket has the following configuration:

1. **CORS Configuration** - Add CORS rules to allow uploads from your frontend domain:
   ```json
   [
     {
       "AllowedHeaders": ["*"],
       "AllowedMethods": ["PUT", "POST"],
       "AllowedOrigins": ["https://yourdomain.com", "http://localhost:3000"],
       "ExposeHeaders": ["ETag"],
       "MaxAgeSeconds": 3000
     }
   ]
   ```

2. **Bucket Policy** - Ensure your bucket allows presigned URL uploads (presigned URLs handle permissions automatically, but verify your bucket policy)

3. **Encryption** - Consider enabling server-side encryption for your bucket

### 7. Authentication (Optional)

If your API requires authentication, update the `getPresignedUrl` function in `/webApp/src/services/s3UploadService.js`:

```javascript
const getPresignedUrl = async (fileName, fileType, contentType) => {
  const token = localStorage.getItem('authToken'); // or your auth method
  
  const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.PRESIGNED_URL_ENDPOINT}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`, // Add auth header
    },
    body: JSON.stringify({
      fileName,
      fileType,
      contentType,
    }),
  });
  // ... rest of the function
};
```

### 8. File Metadata Storage (TODO)

After a successful upload, you may want to save file metadata to your database. The `handleUpload` function in `FileUpload.jsx` has a TODO comment where you can add this:

```javascript
// TODO: Save file metadata to your backend API
await saveFileMetadata({
  fileKey,
  fileUrl,
  fileName: selectedFile.name,
  fileType,
  ...formData
});
```

## Testing

1. Start your backend API server
2. Start your React app: `npm start`
3. Navigate to `/files/upload`
4. Select a PDF file
5. Fill in the form
6. Click "Upload"
7. Check your S3 bucket to verify the file was uploaded

## Troubleshooting

### Error: "Failed to get presigned URL"
- Check that your backend API is running
- Verify the `BASE_URL` in `apiConfig.js` is correct
- Check browser console for CORS errors
- Verify your backend endpoint is returning the correct format

### Error: "Upload failed with status: 403"
- Check S3 bucket CORS configuration
- Verify the presigned URL hasn't expired
- Check S3 bucket permissions

### Error: "Upload failed due to network error"
- Check your internet connection
- Verify the presigned URL is valid
- Check browser console for detailed error messages

## Security Considerations

1. **File Size Limits**: The service validates file size (max 50MB). Adjust in `s3UploadService.js` if needed
2. **File Type Validation**: Only PDFs are allowed for catalogs/sales drawings, Excel/CSV for price lists
3. **Presigned URL Expiration**: URLs expire after 1 hour (configurable in backend)
4. **Authentication**: Implement authentication on your presigned URL endpoint
5. **File Key Sanitization**: Ensure file names are sanitized to prevent path traversal attacks

## Next Steps

1. Implement the backend presigned URL endpoint
2. Configure S3 bucket CORS settings
3. Update `apiConfig.js` with your actual values
4. Test the upload functionality
5. Implement file metadata storage in your database
6. Add authentication if needed

