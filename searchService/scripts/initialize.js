#!/usr/bin/env node

/**
 * Initialize Qdrant collection using AWS Lambda SDK
 * 
 * Usage: 
 *   node scripts/initialize.js           # invoke AWS dev Lambda
 *   node scripts/initialize.js prod      # invoke AWS prod Lambda
 */

const { Lambda } = require('@aws-sdk/client-lambda');

const stage = process.argv[2] || 'dev';
const functionName = `product-search-service-${stage}-searchIndexer`;

// Create Lambda client for AWS
const lambda = new Lambda({
  region: process.env.AWS_REGION || 'us-east-1'
});

async function initialize() {
  console.log('Initializing Qdrant collection');
  console.log('========================================');
  console.log(`Stage: ${stage}`);
  console.log(`Function: ${functionName}`);
  console.log('');

  try {
    const params = {
      FunctionName: functionName,
      InvocationType: 'RequestResponse',
      Payload: JSON.stringify({ action: 'initialize' })
    };

    console.log('Invoking Lambda function...');
    console.log('');

    const response = await lambda.invoke(params);
    
    const payload = JSON.parse(Buffer.from(response.Payload).toString());
    
    console.log('Response:');
    console.log(JSON.stringify(payload, null, 2));
    console.log('');
    
    if (response.FunctionError) {
      console.log('❌ Function returned an error');
      console.log('========================================');
      process.exit(1);
    }
    
    console.log('✅ Initialization complete!');
    console.log('========================================');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('');
    console.log('Make sure:');
    console.log('1. Lambda function is deployed: npm run deploy:dev');
    console.log('2. AWS credentials are configured: aws configure');
    console.log('3. Environment variables are set (QDRANT_URL, QDRANT_API_KEY in Lambda)');
    console.log('');
    process.exit(1);
  }
}

initialize();

