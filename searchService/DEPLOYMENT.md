# Deployment Guide - Qdrant + AWS Bedrock

Complete step-by-step deployment guide using **Bedrock for embeddings** (no Docker needed!).

## Prerequisites

- [ ] AWS CLI configured (`aws configure`)
- [ ] Node.js 18+ installed
- [ ] Python 3.12+ installed
- [ ] ~~Docker~~ **NOT NEEDED** (using Bedrock instead of local models)
- [ ] Qdrant Cloud account (free tier)
- [ ] AWS Bedrock access (available in us-east-1, us-west-2, etc.)

## Step 1: Set Up Qdrant Cloud

### 1.1 Create Free Account

1. Go to [https://cloud.qdrant.io/](https://cloud.qdrant.io/)
2. Sign up with email or GitHub
3. Verify your email

### 1.2 Create a Cluster

1. Click "Create Cluster"
2. Select **Free Tier** (1GB storage, 100 requests/sec)
3. Choose a region (same as your AWS region for lower latency)
4. Name it (e.g., `product-search`)
5. Click "Create"

### 1.3 Get Credentials

1. Click on your cluster
2. Go to "API Keys" tab
3. Create a new API key
4. **Copy and save:**
   - Cluster URL (e.g., `https://abc123.qdrant.io`)
   - API Key (e.g., `xyz...`)

## Step 2: Configure Environment

```bash
cd searchService

# Create .env file
cat > .env << EOF
QDRANT_URL=https://YOUR-CLUSTER-URL.qdrant.io
QDRANT_API_KEY=YOUR-API-KEY-HERE
QDRANT_COLLECTION=products
EMBEDDING_MODEL=amazon.titan-embed-text-v1
VECTOR_SIZE=1536
PRODUCT_TABLE=hb-products
LOG_LEVEL=INFO
AWS_REGION=us-east-1
EOF

# Export variables for deployment
export QDRANT_URL="https://YOUR-CLUSTER-URL.qdrant.io"
export QDRANT_API_KEY="YOUR-API-KEY-HERE"
```

**⚠️ Important:** Replace `YOUR-CLUSTER-URL` and `YOUR-API-KEY-HERE` with your actual values.

## Step 3: Install Dependencies

```bash
# Install Node.js dependencies
npm install

# Verify serverless is installed
npx serverless --version
```

**Note:** The code is already configured to use AWS Bedrock for embeddings. No changes needed!

## Step 4: Deploy to AWS

**Good News!** AWS Bedrock models (including Titan Embeddings) are **automatically enabled** on first use. No manual activation required! 🎉

```bash
# Deploy to dev environment (NO Docker needed!)
npx serverless deploy --stage dev

# Wait 2-3 minutes for deployment
```

**Expected Output:**
```
✔ Service deployed to stack product-search-service-dev (180s)

endpoints:
  GET - https://xxxxx.execute-api.us-east-1.amazonaws.com/search
  GET - https://xxxxx.execute-api.us-east-1.amazonaws.com/autocomplete
functions:
  searchIndexer: product-search-service-dev-searchIndexer
  searchApi: product-search-service-dev-searchApi
```

**Save the API URL** - you'll need it for testing!

## Step 5: Initialize Qdrant Collection

Create the products collection in Qdrant:

```bash
# Invoke indexer to create the products collection
aws lambda invoke \
  --function-name product-search-service-dev-searchIndexer \
  --payload '{"action": "initialize"}' \
  response.json

# Check response
cat response.json
```

**Expected Response:**
```json
{
  "statusCode": 200,
  "body": "{\"message\": \"Collection created\", \"collection\": \"products\"}"
}
```

## Step 6: Enable DynamoDB Stream

### 6.1 Check if Stream Exists

```bash
aws dynamodb describe-table \
  --table-name hb-products \
  --query 'Table.{StreamArn:LatestStreamArn,StreamEnabled:StreamSpecification.StreamEnabled}' \
  --output json
```

### 6.2 Enable Stream (if not enabled)

```bash
aws dynamodb update-table \
  --table-name hb-products \
  --stream-specification StreamEnabled=true,StreamViewType=NEW_AND_OLD_IMAGES
```

### 6.3 Get Stream ARN

```bash
aws dynamodb describe-table \
  --table-name hb-products \
  --query 'Table.LatestStreamArn' \
  --output text
```

**Copy the ARN** - you'll need it for the next step!

Example: `arn:aws:dynamodb:us-east-1:123456789012:table/hb-products/stream/2024-12-09T12:00:00.000`

### 6.4 Update serverless.yml

Edit `serverless.yml` and uncomment the `events` section under `searchIndexer`:

```yaml
functions:
  searchIndexer:
    handler: indexer/handler.handler
    description: Indexes products into Qdrant from DynamoDB Stream
    memorySize: 2048
    timeout: 60
    events:
      - stream:
          type: dynamodb
          arn: arn:aws:dynamodb:us-east-1:123456789012:table/hb-products/stream/2024-12-09T12:00:00.000
          batchSize: 10
          startingPosition: LATEST
          maximumRetryAttempts: 3
          enabled: true
```

### 6.5 Redeploy

```bash
npx serverless deploy --stage dev
```

## Step 7: Test the Service

### 7.1 Get API URL

```bash
export API_URL=$(npx serverless info --stage dev --verbose | grep -A 1 "HttpApiUrl" | tail -1 | awk '{print $2}')
echo $API_URL
```

### 7.2 Add a Test Product

```bash
aws dynamodb put-item \
  --table-name hb-products \
  --item '{
    "orderingNumber": {"S": "TEST-001"},
    "category": {"S": "Test Category"},
    "oneLiner": {"S": "Test Hydraulic Cylinder 100mm"},
    "specs": {"S": "100mm bore, 200mm stroke, 250 bar max pressure"},
    "manualNotes": {"S": "Standard hydraulic cylinder for testing"}
  }'
```

### 7.3 Wait for Indexing

```bash
# Wait 5-10 seconds for the Lambda to process the stream event

# Check indexer logs
npx serverless logs -f searchIndexer --stage dev

# Look for: "Successfully indexed product TEST-001"
```

### 7.4 Test Search

```bash
# Test search
curl "${API_URL}/search?q=hydraulic+cylinder"

# Test autocomplete
curl "${API_URL}/autocomplete?q=hydr"

# Test with category filter
curl "${API_URL}/search?q=test&category=Test+Category"
```

**Expected Response:**
```json
{
  "query": "hydraulic cylinder",
  "category": null,
  "results": [
    {
      "orderingNumber": "TEST-001",
      "category": "Test Category",
      "oneLiner": "Test Hydraulic Cylinder 100mm",
      "specs": "100mm bore, 200mm stroke, 250 bar max pressure",
      "manualNotes": "Standard hydraulic cylinder for testing",
      "score": 0.9234,
      "relevance": "high"
    }
  ],
  "count": 1,
  "total": 1
}
```

## Step 8: Verify Everything Works

### 8.1 Check Qdrant Collection

1. Log into Qdrant Cloud Console
2. Select your cluster
3. Click "Collections"
4. Verify `products` collection exists
5. Check points count > 0

### 8.2 Check Lambda Logs

```bash
# Indexer logs
npx serverless logs -f searchIndexer --stage dev

# API logs
npx serverless logs -f searchApi --stage dev
```

Look for:
- ✅ "Successfully indexed product..."
- ✅ "Search returned X results"
- ❌ No errors

### 8.3 Test with Real Products

If you have existing products in `hb-products`, update one to trigger indexing:

```bash
# Update an existing product
aws dynamodb update-item \
  --table-name hb-products \
  --key '{"orderingNumber": {"S": "YOUR-REAL-SKU"}}' \
  --update-expression "SET #notes = :notes" \
  --expression-attribute-names '{"#notes": "manualNotes"}' \
  --expression-attribute-values '{":notes": {"S": "Updated notes"}}}'

# Check logs to verify indexing
npx serverless logs -f searchIndexer -t --stage dev

# Search for it
curl "${API_URL}/search?q=YOUR-REAL-SKU"
```

## Step 9: Production Deployment (Optional)

When ready for production:

```bash
# Deploy to prod
export STAGE=prod
npx serverless deploy --stage prod

# Initialize collection
aws lambda invoke \
  --function-name product-search-service-prod-searchIndexer \
  --payload '{"action": "initialize"}' \
  response.json

# Update stream ARN in serverless.yml (same as dev)
# Redeploy
npx serverless deploy --stage prod
```

## Troubleshooting

### Error: "Could not connect to Bedrock" or "AccessDeniedException"

**Problem:** Region doesn't support Bedrock or IAM permissions issue.

**Solution:**
1. **Check region:** Bedrock is available in `us-east-1`, `us-west-2`, `eu-west-1`, etc.
2. **Verify IAM permissions:** Lambda role already has `bedrock:InvokeModel` permission in `serverless.yml`
3. **First invocation:** Bedrock models auto-enable on first use - this is normal!
4. If error persists after first attempt, check CloudWatch Logs for details

**Note:** As of 2024, Bedrock serverless models (including Titan Embeddings) are **automatically enabled** when first invoked. No manual activation needed!

### Error: "QDRANT_URL environment variable not set"

**Problem:** Environment variables not exported.

**Solution:**
```bash
export QDRANT_URL="https://your-cluster.qdrant.io"
export QDRANT_API_KEY="your-api-key"
npx serverless deploy --stage dev
```

### Indexer Not Triggered by DynamoDB

**Problem:** Stream not connected.

**Solution:**
1. Verify stream is enabled (Step 6.1)
2. Check stream ARN is correct in serverless.yml
3. Verify event source mapping exists:
   ```bash
   aws lambda list-event-source-mappings \
     --function-name product-search-service-dev-searchIndexer
   ```

### Search Returns No Results

**Problem:** Products not indexed yet.

**Solution:**
1. Check Qdrant collection has points (Step 8.1)
2. Manually trigger indexing by updating a product (Step 8.3)
3. Check indexer logs for errors

### High Cold Start Time

**Expected:** First invocation ~500ms (Bedrock API call).

**Solution:**
- This is much faster than sentence-transformers (no model loading!)
- Subsequent invocations ~200ms
- Bedrock handles scaling automatically

## Cost Monitoring

### Check Current Costs

```bash
# Lambda costs
aws ce get-cost-and-usage \
  --time-period Start=2024-12-01,End=2024-12-31 \
  --granularity MONTHLY \
  --metrics "BlendedCost" \
  --filter file://filter.json

# Qdrant: Check in Qdrant Cloud Console → Billing
```

### Expected Monthly Costs

| Service | Monthly Cost | Notes |
|---------|--------------|-------|
| Qdrant Cloud Free Tier | **$0** | Up to 1GB storage, 100 QPS |
| Lambda Functions | **~$2-3** | Pay per invocation |
| API Gateway | **~$1** | First 1M requests free, then $1/million |
| DynamoDB Streams | **~$0.20** | Per stream read |
| **Bedrock Embeddings** | **~$0.05** | One-time indexing + occasional updates |
| **TOTAL** | **~$3-5/month** | 90% cheaper than OpenSearch! |

**Bedrock Cost Breakdown:**
- Initial indexing: 8,000 products × 50 tokens avg = 400K tokens
- 400K / 1,000 × $0.0001 = **$0.04 one-time**
- Monthly updates: ~100 products × 50 tokens = 5K tokens = **$0.0005/month**

## Next Steps

- [ ] Add authentication to API
- [ ] Set up CloudWatch alarms
- [ ] Create monitoring dashboard
- [ ] Index all existing products (see README)
- [ ] Integrate with frontend application

## Cleanup (If Needed)

To remove everything:

```bash
# Delete AWS resources
npx serverless remove --stage dev

# Delete Qdrant collection (optional)
# Use Qdrant Cloud Console
```

**Note:** This will NOT delete your DynamoDB table (preserved).

---

**Deployment Complete! 🎉**

Your search service is now live using:
- ✅ **Qdrant Cloud** for vector storage (free tier)
- ✅ **AWS Bedrock** for embeddings (no Docker, no heavy dependencies)
- ✅ **Auto-indexing** from DynamoDB Streams
- ✅ **Total cost: ~$3-5/month**

**Benefits of Bedrock approach:**
- 🚫 No Docker needed
- ⚡ Faster deployments (2-3 min vs 5-10 min)
- 📦 Smaller Lambda packages (~5MB vs ~500MB)
- 🚀 Faster cold starts (~500ms vs ~2-3s)
- 💰 Similar cost (~$0.05/month for embeddings)

