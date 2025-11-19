/**
 * Local test script for webhookEmail Lambda function
 * Simulates an EventBridge scheduled event to test the polling function locally
 * 
 * Usage:
 *   node scripts/test-webhookEmail-local.js
 *   node scripts/test-webhookEmail-local.js --maxResults 20 --query "is:unread"
 */

const path = require('path');
const fs = require('fs');

// Load environment variables from .env file if it exists
try {
  if (fs.existsSync('.env')) {
    console.log('Loading environment variables from .env file...');
    require('dotenv').config();
    
    // Verify critical environment variables are set
    if (!process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
      console.error('ERROR: GOOGLE_SERVICE_ACCOUNT_KEY is not set in .env file');
      process.exit(1);
    }
    if (!process.env.GOOGLE_WORKSPACE_EMAIL) {
      console.error('ERROR: GOOGLE_WORKSPACE_EMAIL is not set in .env file');
      process.exit(1);
    }
    
    // Show a preview of the credentials (without exposing sensitive data)
    const creds = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    if (creds.startsWith('{')) {
      console.log('✓ GOOGLE_SERVICE_ACCOUNT_KEY appears to be a JSON string');
    } else if (creds.includes('\\') || creds.includes('/') || creds.includes(':')) {
      console.log(`✓ GOOGLE_SERVICE_ACCOUNT_KEY appears to be a file path: ${creds}`);
      if (!fs.existsSync(creds)) {
        console.error(`ERROR: File path does not exist: ${creds}`);
        process.exit(1);
      }
    } else {
      console.warn('⚠ GOOGLE_SERVICE_ACCOUNT_KEY format is unclear. Expected JSON string or file path.');
    }
    console.log(`✓ GOOGLE_WORKSPACE_EMAIL: ${process.env.GOOGLE_WORKSPACE_EMAIL}`);
  } else {
    console.warn('Warning: .env file not found. Make sure environment variables are set.');
    if (!process.env.GOOGLE_SERVICE_ACCOUNT_KEY || !process.env.GOOGLE_WORKSPACE_EMAIL) {
      console.error('ERROR: Required environment variables are not set.');
      process.exit(1);
    }
  }
} catch (e) {
  // dotenv might not be installed, that's okay - use system env vars
  console.log('Note: Using system environment variables');
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_KEY || !process.env.GOOGLE_WORKSPACE_EMAIL) {
    console.error('ERROR: Required environment variables are not set.');
    process.exit(1);
  }
}

// Import the compiled handler
const { handler } = require('../dist/handlers/webhookEmail');

// Parse command line arguments
const args = process.argv.slice(2);
const maxResults = args.includes('--maxResults') 
  ? parseInt(args[args.indexOf('--maxResults') + 1]) 
  : 10;
const query = args.includes('--query')
  ? args[args.indexOf('--query') + 1]
  : undefined;
const includeFullBody = args.includes('--includeFullBody');

// Create a mock EventBridge scheduled event
const mockEventBridgeEvent = {
  version: '0',
  id: 'test-event-id-' + Date.now(),
  'detail-type': 'Scheduled Event',
  source: 'aws.events',
  account: '123456789012',
  time: new Date().toISOString(),
  region: 'eu-central-1',
  resources: [
    'arn:aws:events:eu-central-1:123456789012:rule/test-rule'
  ],
  detail: {
    maxResults: maxResults,
    query: query,
    includeFullBody: includeFullBody
  }
};

console.log('=== Testing webhookEmail Lambda Locally ===');
console.log('EventBridge Event:', JSON.stringify(mockEventBridgeEvent, null, 2));
console.log('');

// Invoke the handler
handler(mockEventBridgeEvent)
  .then((result) => {
    console.log('');
    console.log('=== Handler Completed Successfully ===');
    if (result) {
      console.log('Response:', JSON.stringify(result, null, 2));
    }
    process.exit(0);
  })
  .catch((error) => {
    console.error('');
    console.error('=== Handler Failed ===');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  });

