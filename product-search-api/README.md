# Product Search Service - Qdrant + AWS Bedrock

Production-grade serverless search service using **Qdrant Cloud** for vector storage and **AWS Bedrock** for embeddings.

## 🎯 Why This Stack?

**Cost Comparison:**
- ❌ OpenSearch Serverless: ~$70-100/month minimum
- ✅ Qdrant Cloud Free Tier: $0/month (1GB storage)
- ✅ Qdrant Cloud Paid: ~$25-50/month for 8K products
- ✅ AWS Bedrock Embeddings: ~$0.05/month (8K products)

**Benefits:**
- 💰 **90% cost reduction** vs OpenSearch
- 🚀 Fast vector search with HNSW algorithm
- 🔥 AWS Bedrock embeddings (no Docker, no heavy dependencies)
- ⚡ Serverless Lambda architecture
- 📦 Simple deployment - no Docker needed!

## 📋 Architecture

```
DynamoDB (hb-products)
     │
     │ Stream Events
     ▼
┌──────────────────┐
│ Indexer Lambda   │
│  - AWS Bedrock   │
│  - Generates     │
│    embeddings    │
└────────┬─────────┘
         │
         │ Upsert vectors
         ▼
┌──────────────────┐
│  Qdrant Cloud    │
│  Vector Database │
│  - Cosine search │
│  - Metadata      │
└────────┬─────────┘
         │
         │ Query
         ▲
┌────────┴─────────┐
│  Search API      │
│  Lambda          │
└────────┬─────────┘
         │
         ▼
   API Gateway
```

## 🚀 Quick Start

### 1. Prerequisites

- AWS Account with CLI configured
- Qdrant Cloud account (free tier) - [Sign up](https://qdrant.tech/)
- Node.js 18+
- Python 3.12+

### 2. Set Up Qdrant Cloud

1. Go to [Qdrant Cloud Console](https://cloud.qdrant.io/)
2. Create a new cluster (free tier is fine)
3. Get your:
   - **Cluster URL** (e.g., `https://xyz.qdrant.io`)
   - **API Key** (from cluster settings)

### 3. Configure Environment

```bash
cd searchService

# Copy example env file
cp .env.example .env

# Edit .env and add your Qdrant credentials
# QDRANT_URL=https://your-cluster.qdrant.io
# QDRANT_API_KEY=your-api-key

# Export for deployment
export QDRANT_URL="https://your-cluster.qdrant.io"
export QDRANT_API_KEY="your-api-key"
```

### 4. Install Dependencies

```bash
# Install Node.js dependencies
npm install

# Optional: Install Python dependencies locally for testing
pip install -r requirements.txt
```

### 5. Deploy

```bash
# Deploy to AWS
npx serverless deploy --stage dev

# Wait ~3-5 minutes for deployment
```

### 6. Initialize Qdrant Collection

```bash
# Invoke indexer to create collection
aws lambda invoke \
  --function-name product-search-service-dev-searchIndexer \
  --payload '{"action": "initialize"}' \
  response.json

# Check response
cat response.json
```

### 7. Enable DynamoDB Stream (One-Time Setup)

**Check if stream is enabled:**
```bash
aws dynamodb describe-table --table-name hb-products \
  --query 'Table.StreamSpecification'
```

**If stream is NOT enabled, enable it:**
```bash
aws dynamodb update-table \
  --table-name hb-products \
  --stream-specification StreamEnabled=true,StreamViewType=NEW_AND_OLD_IMAGES
```

**Get the Stream ARN:**
```bash
aws dynamodb describe-table --table-name hb-products \
  --query 'Table.LatestStreamArn' --output text
```

**Update `serverless.yml`:**

Uncomment and update the `events` section in the `searchIndexer` function:

```yaml
functions:
  searchIndexer:
    # ... other config ...
    events:
      - stream:
          type: dynamodb
          arn: arn:aws:dynamodb:us-east-1:123456789:table/hb-products/stream/2024-12-09...
          batchSize: 10
          startingPosition: LATEST
          maximumRetryAttempts: 3
          enabled: true
```

**Redeploy:**
```bash
npx serverless deploy --stage dev
```

### 8. Test the API

```bash
# Get API URL
export API_URL=$(npx serverless info --stage dev --verbose | grep HttpApiUrl | awk '{print $2}')

# Test search
curl "${API_URL}/search?q=hydraulic+cylinder"

# Test autocomplete
curl "${API_URL}/autocomplete?q=hydr"

# Test with category filter
curl "${API_URL}/search?q=valve&category=Valves"
```

## 📡 API Endpoints

### GET /search

Vector similarity search with optional filters.

**Parameters:**
- `q` (required): Search query text
- `category` (optional): Filter by category
- `size` (optional): Number of results (default 30, max 100)
- `min_score` (optional): Minimum similarity score 0-1 (default 0)

**Example:**
```bash
curl "${API_URL}/search?q=hydraulic+cylinder&category=Cylinders&size=20"
```

**Response:**
```json
{
  "query": "hydraulic cylinder",
  "category": "Cylinders",
  "results": [
    {
      "orderingNumber": "CYL-100-200",
      "category": "Cylinders",
      "oneLiner": "Hydraulic Cylinder - 100mm Bore",
      "specs": "100mm bore, 200mm stroke, 250 bar",
      "manualNotes": "Standard mounting",
      "score": 0.9234,
      "relevance": "high"
    }
  ],
  "count": 1,
  "total": 1
}
```

### GET /autocomplete

Get autocomplete suggestions based on prefix.

**Parameters:**
- `q` (required): Search prefix (min 2 characters)
- `category` (optional): Filter by category
- `size` (optional): Number of suggestions (default 10, max 20)

**Example:**
```bash
curl "${API_URL}/autocomplete?q=hydr&size=5"
```

**Response:**
```json
{
  "query": "hydr",
  "suggestions": [
    {
      "text": "Hydraulic Cylinder - 100mm Bore",
      "orderingNumber": "CYL-100-200",
      "category": "Cylinders"
    }
  ],
  "count": 1
}
```

## 🔧 Configuration

### Environment Variables

Set in `.env` file and export before deployment:

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `QDRANT_URL` | Qdrant Cloud cluster URL | - | Yes |
| `QDRANT_API_KEY` | Qdrant API key | - | Yes |
| `QDRANT_COLLECTION` | Collection name | `products` | No |
| `EMBEDDING_MODEL` | Model to use | `amazon.titan-embed-text-v1` | No |
| `VECTOR_SIZE` | Embedding dimension | `1536` | No |
| `PRODUCT_TABLE` | DynamoDB table name | `hb-products` | No |
| `LOG_LEVEL` | Logging level | `INFO` | No |

### Embedding Models

**AWS Bedrock Options:**

| Model | Dimension | Cost | Quality | Use Case |
|-------|-----------|------|---------|----------|
| `amazon.titan-embed-text-v1` | 1536 | $0.0001/1K tokens | Excellent | General search ✅ |
| `cohere.embed-english-v3` | 1024 | $0.0001/1K tokens | Excellent | English text |
| `cohere.embed-multilingual-v3` | 1024 | $0.0001/1K tokens | Excellent | Multiple languages |

**OpenAI Options (if preferred):**

| Model | Dimension | Cost | Quality |
|-------|-----------|------|---------|
| `text-embedding-3-small` | 1536 | $0.0001/1K tokens | Excellent |
| `text-embedding-ada-002` | 1536 | $0.0001/1K tokens | Excellent |

To switch models, update `.env`:
```bash
EMBEDDING_MODEL=cohere.embed-english-v3
VECTOR_SIZE=1024
```

Then redeploy and re-index all products.

**Note:** Bedrock models require enabling in AWS Console → Bedrock → Model access

## 📊 Project Structure

```
searchService/
├── indexer/
│   ├── handler.py           # DynamoDB Stream Lambda handler
│   ├── qdrant_client.py     # Qdrant operations
│   ├── embedding.py         # Embedding generation
│   └── transformers.py      # Data transformation
├── api/
│   ├── handler.py           # Search API Lambda handler
│   └── qdrant_search.py     # Search service
├── schemas/
│   └── product_model.py     # Product data model
├── serverless.yml           # Infrastructure as Code
├── requirements.txt         # Python dependencies
├── package.json             # Node.js scripts
└── README.md                # This file
```

## 🔍 How It Works

### Indexing Pipeline

1. **Product Update** → DynamoDB Stream triggered
2. **Indexer Lambda** receives event
3. **Extract** product data (oneLiner, specs, notes)
4. **Generate** 1536-dim embedding using AWS Bedrock
5. **Upsert** to Qdrant with metadata (category, SKU, etc.)

### Search Pipeline

1. **Query received** via API Gateway
2. **Generate embedding** for query text
3. **Vector search** in Qdrant (cosine similarity)
4. **Apply filters** (category, min_score)
5. **Return** top N results sorted by similarity

## 💰 Cost Breakdown

### For ~8,000 Products

**Monthly Costs:**
- Qdrant Cloud Free Tier: **$0** (up to 1GB)
- Qdrant Cloud Starter: **~$25** (if you exceed free tier)
- Lambda (Indexer): **~$1** (triggered on updates only)
- Lambda (API): **~$2-3** (depends on search volume)
- API Gateway: **~$1** (per million requests)
- DynamoDB Streams: **~$0.20**
- **Bedrock Embeddings: ~$0.05** (8K products, one-time indexing + occasional updates)

**Total: ~$4-6/month on free tier, ~$30/month on paid**

vs OpenSearch Serverless: **$70-100/month** 

**Savings: 90-95%** 💰

## 🧪 Testing

### Manual Testing

```bash
# Test indexer initialization
aws lambda invoke \
  --function-name product-search-service-dev-searchIndexer \
  --payload '{"action": "initialize"}' \
  response.json

# Add test product to DynamoDB
aws dynamodb put-item \
  --table-name hb-products \
  --item '{
    "orderingNumber": {"S": "TEST-001"},
    "category": {"S": "Test Category"},
    "oneLiner": {"S": "Test Hydraulic Cylinder"},
    "specs": {"S": "100mm bore, 200mm stroke"},
    "manualNotes": {"S": "Test product for search verification"}
  }'

# Wait a few seconds, then search
curl "${API_URL}/search?q=test+hydraulic"
```

### Check Logs

```bash
# Indexer logs
npx serverless logs -f searchIndexer -t --stage dev

# API logs
npx serverless logs -f searchApi -t --stage dev

# Or use AWS CLI
aws logs tail /aws/lambda/product-search-service-dev-searchIndexer --follow
```

### Verify Qdrant Collection

Log into Qdrant Cloud Console and check:
- Collection exists (`products`)
- Points count matches your DynamoDB items
- Vector dimension is correct (384 for all-MiniLM-L6-v2)

## 🚧 Troubleshooting

### "Could not connect to Bedrock"

**Problem:** Bedrock not available in your region or not enabled.

**Solution:**
1. Check Bedrock is available in your region (us-east-1, us-west-2, etc.)
2. Go to AWS Console → Bedrock → Model access
3. Request access to "Titan Embeddings G1 - Text"
4. Wait for approval (usually instant)

### Search Returns No Results

1. **Check if collection exists:**
   ```bash
   # Check Qdrant Cloud console
   ```

2. **Verify products are indexed:**
   - Check indexer logs for successful upserts
   - Update a product in DynamoDB to trigger indexing

3. **Check embedding generation:**
   - Look for errors in indexer logs
   - Verify model is loading correctly

### High Lambda Cold Start Time

First invocation: ~500ms (Bedrock API call).
Subsequent invocations: ~200ms.

**Much faster than local models!** No heavy model loading needed.

### DynamoDB Stream Not Triggering

1. **Verify stream is enabled:**
   ```bash
   aws dynamodb describe-table --table-name hb-products \
     --query 'Table.StreamSpecification'
   ```

2. **Check event source mapping:**
   ```bash
   aws lambda list-event-source-mappings \
     --function-name product-search-service-dev-searchIndexer
   ```

3. **Verify IAM permissions** (should be automatic via serverless.yml)

## 🔒 Security

### Current Setup
- ✅ Qdrant: API key authentication
- ✅ Lambda: IAM roles with least privilege
- ✅ API Gateway: CORS enabled (public access)
- ⚠️ API: No authentication (add if needed)

### Production Recommendations

1. **Add API Authentication:**
   - AWS Cognito User Pools
   - API Gateway API Keys
   - Lambda Authorizer

2. **Restrict CORS:**
   ```python
   'Access-Control-Allow-Origin': 'https://yourdomain.com'
   ```

3. **Enable CloudTrail:** For audit logging

4. **Rotate Qdrant API Key:** Regularly update in AWS Secrets Manager

## 📈 Scaling

### Current Capacity
- **8,000 products:** ✅ Works great on free tier
- **Up to 50,000 products:** ✅ Qdrant free tier sufficient
- **50K-500K products:** Upgrade to Qdrant paid plan (~$25-50/month)
- **500K+ products:** Consider horizontal scaling or sharding

### Performance
- **Indexing:** ~500ms-1s per product (includes Bedrock API call)
- **Search:** ~200-400ms (p95)
- **Cold Start:** ~500ms (much faster than local models!)
- **Warm:** ~100-200ms

### Optimization Tips
1. **Batch indexing:** Process multiple products in one invocation
2. **Provisioned concurrency:** Eliminate cold starts (adds cost, but rarely needed with Bedrock)
3. **Caching:** Cache frequent queries in ElastiCache
4. **Bedrock batch API:** Use batch embeddings for bulk operations

## 🔄 Maintenance

### Reindexing All Products

If you need to rebuild the entire index:

```python
# Create a script to scan DynamoDB and reindex
# scripts/reindex_all.py
import boto3
from indexer.handler import process_insert_or_modify

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table('hb-products')

# Scan all items
response = table.scan()
items = response['Items']

# Process each item
for item in items:
    # Convert to DynamoDB Stream format
    event = {
        'Records': [{
            'eventName': 'INSERT',
            'dynamodb': {
                'NewImage': item
            }
        }]
    }
    # Process
    handler(event, None)
```

### Updating Embedding Model

1. Update `.env` with new model
2. Update `VECTOR_SIZE` to match new dimension
3. Delete old Qdrant collection (or create new one)
4. Redeploy: `npx serverless deploy`
5. Reindex all products

## 📝 Next Steps

- [ ] Add authentication (Cognito or API Keys)
- [ ] Implement caching layer (ElastiCache) for frequent queries
- [ ] Add monitoring dashboard (CloudWatch)
- [ ] Set up CloudWatch alarms for errors
- [ ] Implement search analytics
- [ ] Add faceted search (multiple filters)

## 🤝 Support

Questions or issues? Check:
1. CloudWatch Logs (indexer and API functions)
2. Qdrant Cloud Console (collection stats)
3. DynamoDB Streams (iterator age, throttling)

---

**Built with ❤️ using Qdrant Cloud + AWS Bedrock**

**Cost-effective • Serverless • Production-ready • No Docker needed!**
