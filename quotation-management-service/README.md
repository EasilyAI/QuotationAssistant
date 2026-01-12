# Quotation Management Service

AWS Serverless Framework service for managing quotations, line items, exports, and email drafts.

## Overview

This service provides REST endpoints for:
- Creating and managing quotations
- Managing quotation line items
- Calculating prices with margins and VAT
- Generating Excel exports (stock check and priority import)
- Generating email drafts with sales drawing attachments

## Architecture

- **Runtime**: Python 3.11
- **Framework**: Serverless Framework v3
- **API**: API Gateway HTTP API
- **Database**: DynamoDB (on-demand billing)
- **Storage**: S3 read-only access for sketch drawings (from `hb-files-raw` bucket)
- **Auth**: API key via `x-api-key` header

## Service Structure

```
quotation-management-service/
├── api/              # API endpoint handlers
├── schemas/          # Data models and validation
├── services/         # Business logic
├── layer/            # Lambda layer dependencies
└── serverless.yml    # Serverless configuration
```

## DynamoDB Schema

### Table: `quotations`

- **PK**: `quotation_id` (UUID string)
- **GSI1**: `status` (StatusIndex) - for filtering by status
- **GSI2**: `created_at` (CreatedAtIndex) - for sorting by date

**Attributes**:
- Quotation header fields (name, customer, currency, vat_rate, etc.)
- `lines`: DynamoDB List containing line item objects
- `totals`: Calculated totals (subtotal, vat_total, total)
- `exports`: Export metadata (S3 keys, timestamps)

## Local Development Setup

### Prerequisites

1. **AWS Credentials**: Configure AWS credentials to access DynamoDB tables:
   ```bash
   aws configure
   # Or set environment variables:
   export AWS_ACCESS_KEY_ID=your-key
   export AWS_SECRET_ACCESS_KEY=your-secret
   export AWS_DEFAULT_REGION=us-east-1
   ```

2. **DynamoDB Table**: The `quotations` table must exist in your AWS account. Deploy it first:
   ```bash
   serverless deploy
   ```

### Running Locally with Real AWS DynamoDB

```bash
# Install dependencies
npm install

# Set API key (optional, defaults to empty)
export QUOTATION_API_KEY=your-api-key

# Option 1: Use AWS profile via command line
serverless offline --profile hb-client

# Option 2: Set AWS profile as environment variable
export AWS_PROFILE=hb-client
serverless offline

# Option 3: Use default AWS profile (if configured in ~/.aws/config)
serverless offline
```

**Important**: Make sure your AWS profile is configured:
```bash
# Check your AWS profiles
aws configure list-profiles

# Verify the profile has access to DynamoDB
aws dynamodb list-tables --profile hb-client

# Verify the quotations table exists
aws dynamodb describe-table --table-name quotations --profile hb-client
```

### Using DynamoDB Local (Optional)

If you want to use DynamoDB Local instead of AWS:

1. **Install DynamoDB Local**:
   ```bash
   # Using Docker
   docker run -d -p 8000:8000 amazon/dynamodb-local
   
   # Or download and run manually
   # https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DynamoDBLocal.html
   ```

2. **Set endpoint environment variable**:
   ```bash
   export DYNAMODB_ENDPOINT=http://localhost:8000
   serverless offline
   ```

3. **Create table in DynamoDB Local**:
   ```bash
   aws dynamodb create-table \
     --table-name quotations \
     --attribute-definitions AttributeName=quotation_id,AttributeType=S \
     --key-schema AttributeName=quotation_id,KeyType=HASH \
     --billing-mode PAY_PER_REQUEST \
     --endpoint-url http://localhost:8000
   ```

### Installing Python Dependencies for Local Development

When running `serverless offline`, the `serverless-python-requirements` plugin will package dependencies automatically. All required dependencies (boto3, openpyxl, python-dateutil) are already included and should work out of the box with AWS SDK.

### Troubleshooting

**Error: "ResourceNotFoundException: Requested resource not found"**

This means the DynamoDB table doesn't exist or isn't accessible. Check:

1. **Table exists in AWS**:
   ```bash
   aws dynamodb list-tables
   ```

2. **AWS credentials are configured**:
   ```bash
   aws sts get-caller-identity
   ```

3. **Table name matches**:
   - Default: `quotations`
   - Check: `QUOTATIONS_TABLE` environment variable

4. **Region is correct**:
   - Default: `us-east-1`
   - Check: `AWS_DEFAULT_REGION` environment variable

## API Endpoints

### Quotation Management

- `POST /quotations` - Create quotation
- `GET /quotations` - List quotations (with filters: status, search, recent, incomplete)
- `GET /quotations/{quotationId}` - Get quotation with lines
- `PUT /quotations/{quotationId}` - Update quotation header
- `PATCH /quotations/{quotationId}/status` - Update status
- `DELETE /quotations/{quotationId}` - Delete quotation

### Line Items

- `POST /quotations/{quotationId}/lines` - Add line item
- `PUT /quotations/{quotationId}/lines/{lineId}` - Update line item
- `DELETE /quotations/{quotationId}/lines/{lineId}` - Remove line item
- `POST /quotations/{quotationId}/lines/batch` - Batch add (for product-search-api)
- `PATCH /quotations/{quotationId}/lines/apply-margin` - Apply global margin
- `POST /quotations/{quotationId}/lines/refresh-prices` - Refresh base prices from price list

### Exports

- `POST /quotations/{quotationId}/exports/stock-check` - Generate stock check Excel
- `POST /quotations/{quotationId}/exports/priority-import` - Generate priority import Excel
- `GET /quotations/{quotationId}/exports/{exportType}/download` - Get presigned download URL

### Email

- `POST /quotations/{quotationId}/email-draft` - Generate email draft with sales drawing attachments
- `POST /quotations/{quotationId}/send-email` - Send email with attachments via AWS SES

## Environment Variables

Required:
- `QUOTATION_API_KEY` - API key for authentication
- `QUOTATIONS_TABLE` - DynamoDB table name (default: `quotations`)
- `PRODUCT_TABLE` - Products table name (default: `hb-products`)
- `PRICE_LIST_PRODUCTS_TABLE` - Price list table (default: `hb-pricelist-products`)
- `FILES_BUCKET` - S3 bucket for sketch drawings (default: `hb-files-raw`) - read-only access

Optional:
- `VAT_RATE` - Default VAT rate (default: `0.18`)
- `SES_SENDER_EMAIL` - AWS SES verified sender email address (default: `hbaws1925@gmail.com`)

## Price Calculation

Final price formula:
```
final_price = base_price * (1 + margin_pct) * (1 + global_margin_pct)
```

- If `margin_pct` is set on a line, it overrides the global margin for that line
- Manual `final_price` overrides can be set directly
- Totals include VAT: `total = subtotal + (subtotal * vat_rate)`

## Price Refresh

The price refresh endpoint (`POST /quotations/{quotationId}/lines/refresh-prices`) uses the shared `product_service.fetch_product()` function to:
1. Fetch current price from price list products table
2. Update `base_price` for lines with matching `ordering_number`
3. Recalculate `final_price` and totals

## Exports

Exports are generated on-demand and returned directly to the user's computer. They are **not stored in S3** - each export is generated fresh when requested.

### Stock Check Export
- Columns: `ordering_number`, `quantity`, `product_name`
- Only includes lines with `ordering_number`
- Returns Excel file as base64-encoded data in JSON response
- Frontend automatically triggers browser download

### Priority Import Export
- Includes all line fields formatted for ERP ingestion
- Columns: Order No, Ordering Number, Requested Item, Product Name, Description, Quantity, Base Price, Margin %, Final Price, Drawing Link, Catalog Link, Notes, Source
- Returns Excel file as base64-encoded data in JSON response
- Frontend automatically triggers browser download

## Email

### Email Draft

The email draft endpoint returns:
```json
{
  "subject": "Quotation {number} - {name}",
  "body": "Email body text...",
  "to": "customer@example.com",
  "cc": "optional@example.com",
  "attachments": [
    {
      "filename": "drawing.pdf",
      "s3_key": "uploads/drawing.pdf",
      "presigned_url": "https://..."
    }
  ]
}
```

**Note**: Attachments include ONLY sales drawings (sketch files) from line items. Excel exports are NOT included.

### Send Email with Attachments

The send email endpoint (`POST /quotations/{quotationId}/send-email`) uses AWS SES to send emails with all sales drawings attached as files.

**Prerequisites**:
1. **Verify sender email in AWS SES**: The sender email address must be verified in AWS SES. Default is `hbaws1925@gmail.com`.

2. **Set `SES_SENDER_EMAIL` in your `.env` file** (optional, defaults to `hbaws1925@gmail.com`):
   ```
   SES_SENDER_EMAIL=hbaws1925@gmail.com
   ```

3. **AWS Credentials**: Ensure your Lambda execution role has SES permissions:
   - `ses:SendEmail`
   - `ses:SendRawEmail`

**How it works**:
- Downloads all sales drawing files from S3
- Builds MIME multipart email message with attachments
- Sends email via AWS SES API with attachments
- Email is sent to the specified recipient (defaults to current user's email for forwarding)

**Request body** (optional):
```json
{
  "customer_email": "customer@example.com",
  "sender_email": "sender@example.com",
  "sender_name": "John Doe"
}
```

**Response**:
```json
{
  "message": "Email sent successfully",
  "email_id": "ses-message-id"
}
```

## Authentication

All endpoints require the `x-api-key` header with a valid API key matching `QUOTATION_API_KEY` environment variable.

## Deployment

```bash
# Install dependencies
npm install

# Deploy to AWS
serverless deploy

# Deploy to specific stage
serverless deploy --stage dev

# Run locally
serverless offline
```

## Integration with Product-Search-API

When products are selected from search results, the frontend or product-search-api can call:

```
POST /quotations/{quotationId}/lines/batch
```

With payload:
```json
{
  "lines": [
    {
      "ordering_number": "CYL-100-25",
      "product_name": "Hydraulic Cylinder",
      "quantity": 10,
      "base_price": 445.00,
      ...
    }
  ]
}
```

## Query Parameters

### List Quotations

- `status` - Filter by status (Draft, In Progress, etc.)
- `search` or `q` - Search in name, customer, quotation number
- `recent=true` - Get recent quotations (sorted by created_at desc)
- `limit` - Maximum results (default: 50)

## Status Values

- Draft
- In Progress
- Awaiting Approval
- Approved
- Order
- Quote Rejected
- Quote Canceled
- Not Applicable
- Quote Revision

