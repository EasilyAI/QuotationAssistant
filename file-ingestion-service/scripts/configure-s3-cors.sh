#!/bin/bash
# Post-deployment script to configure S3 bucket CORS
# 
# IMPORTANT: This script MUST be run after every deployment!
# The S3 bucket CORS configuration is not managed by CloudFormation
# to avoid conflicts with Serverless Framework's auto-generated bucket.
#
# Usage:
#   ./scripts/configure-s3-cors.sh
#   OR
#   npm run deploy:full    (runs deploy + this script)
#   OR
#   make deploy-full       (runs deploy + this script)

set -e

BUCKET_NAME="hb-files-raw"
PRODUCTION_URL="${PRODUCTION_FRONTEND_URL:-https://main.d1xymtccqgi62h.amplifyapp.com}"

echo "Configuring CORS for S3 bucket: $BUCKET_NAME"

# Create CORS configuration JSON
cat > /tmp/cors-config.json <<EOF
{
  "CORSRules": [
    {
      "AllowedOrigins": [
        "http://localhost:3000",
        "http://localhost:3001",
        "$PRODUCTION_URL"
      ],
      "AllowedHeaders": ["*"],
      "AllowedMethods": ["GET", "PUT", "POST", "HEAD"],
      "MaxAgeSeconds": 3600,
      "ExposeHeaders": [
        "ETag",
        "x-amz-server-side-encryption",
        "x-amz-request-id",
        "x-amz-id-2"
      ]
    }
  ]
}
EOF

# Apply CORS configuration
aws s3api put-bucket-cors \
  --bucket "$BUCKET_NAME" \
  --cors-configuration file:///tmp/cors-config.json \
  --region us-east-1

# Configure PublicAccessBlock
aws s3api put-public-access-block \
  --bucket "$BUCKET_NAME" \
  --public-access-block-configuration \
    "BlockPublicAcls=true,BlockPublicPolicy=true,IgnorePublicAcls=true,RestrictPublicBuckets=true" \
  --region us-east-1

echo "✅ S3 bucket CORS and PublicAccessBlock configured successfully"
rm -f /tmp/cors-config.json

