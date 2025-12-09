#!/usr/bin/env node

/**
 * Invoke Lambda function running in serverless-offline
 * 
 * Usage: node scripts/invoke-offline.js <function-name> [payload]
 * 
 * Examples:
 *   node scripts/invoke-offline.js searchIndexer '{"action":"initialize"}'
 *   node scripts/invoke-offline.js searchApi
 * 
 * Make sure serverless-offline is running: npm run dev
 */

const { Lambda } = require('@aws-sdk/client-lambda');

const functionShortName = process.argv[2] || 'searchIndexer';
const payloadData = process.argv[3] || '{"action": "initialize"}';

const functionName = `product-search-service-dev-${functionShortName}`;

// Create Lambda client pointing to serverless-offline
const lambda = new Lambda({
  region: 'us-east-1',
  endpoint: 'http://localhost:3002',
  credentials: {
    accessKeyId: 'local',
    secretAccessKey: 'local'
  }
});

async function invokeOffline() {
  console.log(`Invoking serverless-offline Lambda ${functionName}`);

  try {
    const params = {
      FunctionName: functionName,
      InvocationType: 'RequestResponse',
      Payload: JSON.stringify(JSON.parse(payloadData))
    };

    console.log('Invoking...');
    console.log('');

    const response = await lambda.invoke(params);
    
    const payload = JSON.parse(Buffer.from(response.Payload).toString());
    
    console.log('Response:');
    console.log(JSON.stringify(payload, null, 2));
    
  } catch (error) {
    console.error('Error:', error.message);

  }
}

invokeOffline();