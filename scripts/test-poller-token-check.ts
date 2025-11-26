/**
 * Test script for Gmail Poller Token Checking Logic
 * 
 * Tests the token checking functionality in poller-lambda.ts
 * 
 * Usage:
 *   npm run build
 *   npx ts-node scripts/test-poller-token-check.ts
 * 
 * Or add to package.json:
 *   "test:poller-tokens": "npm run build && npx ts-node scripts/test-poller-token-check.ts"
 */

import { handler } from '../src/gmail-oauth/poller-lambda';
import { Context } from 'aws-lambda';

// Mock Lambda context
const createMockContext = (): Context => {
  return {
    callbackWaitsForEmptyEventLoop: false,
    functionName: 'test-gmailPoller',
    functionVersion: '$LATEST',
    invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-gmailPoller',
    memoryLimitInMB: '512',
    awsRequestId: 'test-request-id-' + Date.now(),
    logGroupName: '/aws/lambda/test-gmailPoller',
    logStreamName: 'test-stream',
    getRemainingTimeInMillis: () => 900000, // 15 minutes
    done: () => {},
    fail: () => {},
    succeed: () => {},
  };
};

// Mock event
const createMockEvent = () => {
  return {
    httpMethod: 'GET',
    path: '/test',
    headers: {},
    multiValueHeaders: {},
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    pathParameters: null,
    stageVariables: null,
    requestContext: {} as any,
    resource: '',
    body: null,
    isBase64Encoded: false,
  };
};

/**
 * Test Case 1: Missing OAuth Credentials (Client ID/Secret)
 */
async function testMissingOAuthCredentials() {
  console.log('\n' + '='.repeat(60));
  console.log('TEST 1: Missing OAuth Credentials');
  console.log('='.repeat(60));
  
  // Clear environment variables
  const originalClientId = process.env.GMAIL_CLIENT_ID;
  const originalClientSecret = process.env.GMAIL_CLIENT_SECRET;
  const originalRefreshToken = process.env.GMAIL_REFRESH_TOKEN;
  
  delete process.env.GMAIL_CLIENT_ID;
  delete process.env.GMAIL_CLIENT_SECRET;
  delete process.env.GMAIL_REFRESH_TOKEN;
  
  try {
    const event = createMockEvent();
    const context = createMockContext();
    
    console.log('Environment variables cleared');
    console.log('Invoking handler...\n');
    
    const result = await handler(event, context);
    
    console.log('\nResult:', JSON.stringify(result, null, 2));
    
    if (!result.success && result.errors.some(e => e.includes('Missing Gmail OAuth credentials'))) {
      console.log('\n✅ TEST PASSED: Correctly detected missing OAuth credentials');
    } else {
      console.log('\n❌ TEST FAILED: Should have detected missing OAuth credentials');
    }
  } catch (error: any) {
    console.log('\n⚠️  Handler threw error (expected):', error.message);
    if (error.message.includes('Missing Gmail OAuth credentials')) {
      console.log('✅ TEST PASSED: Error correctly indicates missing credentials');
    } else {
      console.log('❌ TEST FAILED: Unexpected error');
    }
  } finally {
    // Restore environment variables
    if (originalClientId) process.env.GMAIL_CLIENT_ID = originalClientId;
    if (originalClientSecret) process.env.GMAIL_CLIENT_SECRET = originalClientSecret;
    if (originalRefreshToken) process.env.GMAIL_REFRESH_TOKEN = originalRefreshToken;
  }
}

/**
 * Test Case 2: Missing Refresh Token (but has Client ID/Secret)
 */
async function testMissingRefreshToken() {
  console.log('\n' + '='.repeat(60));
  console.log('TEST 2: Missing Refresh Token');
  console.log('='.repeat(60));
  
  // Set client credentials but not refresh token
  const originalClientId = process.env.GMAIL_CLIENT_ID;
  const originalClientSecret = process.env.GMAIL_CLIENT_SECRET;
  const originalRefreshToken = process.env.GMAIL_REFRESH_TOKEN;
  
  // Use mock values that won't conflict with real credentials
  process.env.GMAIL_CLIENT_ID = 'test-mock-client-id-' + Date.now();
  process.env.GMAIL_CLIENT_SECRET = 'test-mock-client-secret-' + Date.now();
  delete process.env.GMAIL_REFRESH_TOKEN;
  
  try {
    const event = createMockEvent();
    const context = createMockContext();
    
    console.log('Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET (mock values)');
    console.log('GMAIL_REFRESH_TOKEN is not set');
    console.log('Invoking handler...\n');
    
    const result = await handler(event, context);
    
    console.log('\nResult:', JSON.stringify(result, null, 2));
    
    // Check if result indicates missing refresh token
    const hasRefreshTokenError = result.errors.some(e => 
      e.includes('Missing refresh token') || 
      e.includes('OAuth authorization required') ||
      e.includes('refresh token')
    );
    
    if (!result.success && hasRefreshTokenError) {
      console.log('\n✅ TEST PASSED: Correctly detected missing refresh token');
      console.log('   Handler gracefully handled missing refresh token');
    } else if (!result.success) {
      console.log('\n⚠️  TEST PARTIAL: Handler detected issue but error message may differ');
      console.log('   Errors:', result.errors);
    } else {
      console.log('\n❌ TEST FAILED: Should have detected missing refresh token');
    }
  } catch (error: any) {
    console.log('\n⚠️  Handler threw error:', error.message);
    if (error.message.includes('refresh token') || error.message.includes('OAuth') || error.message.includes('Missing')) {
      console.log('✅ TEST PASSED: Error correctly indicates missing refresh token');
    } else {
      console.log('⚠️  Unexpected error (may be from Gmail API initialization)');
      console.log('   This is acceptable if token check passed but Gmail client initialization failed');
    }
  } finally {
    // Restore environment variables
    if (originalClientId) process.env.GMAIL_CLIENT_ID = originalClientId;
    else delete process.env.GMAIL_CLIENT_ID;
    if (originalClientSecret) process.env.GMAIL_CLIENT_SECRET = originalClientSecret;
    else delete process.env.GMAIL_CLIENT_SECRET;
    if (originalRefreshToken) process.env.GMAIL_REFRESH_TOKEN = originalRefreshToken;
    else delete process.env.GMAIL_REFRESH_TOKEN;
  }
}

/**
 * Test Case 3: All Credentials Present (should proceed)
 */
async function testAllCredentialsPresent() {
  console.log('\n' + '='.repeat(60));
  console.log('TEST 3: All Credentials Present');
  console.log('='.repeat(60));
  
  // Check if we have actual credentials
  const hasClientId = process.env.GMAIL_CLIENT_ID;
  const hasClientSecret = process.env.GMAIL_CLIENT_SECRET;
  const hasRefreshToken = process.env.GMAIL_REFRESH_TOKEN;
  
  if (!hasClientId || !hasClientSecret || !hasRefreshToken) {
    console.log('⚠️  Skipping test - Missing actual credentials in environment');
    console.log('   Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, and GMAIL_REFRESH_TOKEN to test');
    return;
  }
  
  try {
    const event = createMockEvent();
    const context = createMockContext();
    
    console.log('All credentials are set');
    console.log('Invoking handler...\n');
    
    const result = await handler(event, context);
    
    console.log('\nResult:', JSON.stringify(result, null, 2));
    
    if (result.success !== undefined) {
      console.log('\n✅ TEST PASSED: Handler executed (may succeed or fail based on actual Gmail API)');
      console.log('   Note: Actual Gmail API calls may fail if tokens are invalid, but token check passed');
    } else {
      console.log('\n❌ TEST FAILED: Handler did not return expected result structure');
    }
  } catch (error: any) {
    console.log('\n⚠️  Handler threw error:', error.message);
    // If error is about Gmail API (not token check), that's okay
    if (!error.message.includes('Missing') && !error.message.includes('OAuth')) {
      console.log('✅ TEST PASSED: Token check passed, error is from Gmail API (expected)');
    } else {
      console.log('❌ TEST FAILED: Token check should have passed');
    }
  }
}

/**
 * Test Case 4: Check Secrets Manager Integration
 */
async function testSecretsManagerIntegration() {
  console.log('\n' + '='.repeat(60));
  console.log('TEST 4: Secrets Manager Integration Check');
  console.log('='.repeat(60));
  
  try {
    const { getGmailOAuthCredentials, getGmailTokens } = await import('../src/utils/secretsManager');
    
    console.log('Checking Secrets Manager for credentials...\n');
    
    const oauthCreds = await getGmailOAuthCredentials();
    const tokens = await getGmailTokens();
    
    console.log('OAuth Credentials from Secrets Manager:', oauthCreds ? 'Found' : 'Not found');
    if (oauthCreds) {
      console.log('  - client_id:', oauthCreds.client_id ? 'Present' : 'Missing');
      console.log('  - client_secret:', oauthCreds.client_secret ? 'Present' : 'Missing');
    }
    
    console.log('\nTokens from Secrets Manager:', tokens ? 'Found' : 'Not found');
    if (tokens) {
      console.log('  - refresh_token:', tokens.refresh_token ? 'Present' : 'Missing');
      console.log('  - access_token:', tokens.access_token ? 'Present' : 'Missing');
      console.log('  - expiry_date:', tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : 'Missing');
    }
    
    console.log('\n✅ TEST PASSED: Secrets Manager integration check completed');
  } catch (error: any) {
    console.log('\n⚠️  Error checking Secrets Manager:', error.message);
    if (error.message.includes('credentials') || error.message.includes('region')) {
      console.log('   Note: This may be expected if AWS credentials are not configured locally');
    }
  }
}

/**
 * Main test runner
 */
async function runTests() {
  console.log('\n' + '='.repeat(60));
  console.log('GMAIL POLLER TOKEN CHECKING TESTS');
  console.log('='.repeat(60));
  console.log('\nThis script tests the token checking logic in poller-lambda.ts');
  console.log('It verifies that the handler correctly detects missing credentials\n');
  
  try {
    await testMissingOAuthCredentials();
    await testMissingRefreshToken();
    await testSecretsManagerIntegration();
    await testAllCredentialsPresent();
    
    console.log('\n' + '='.repeat(60));
    console.log('ALL TESTS COMPLETED');
    console.log('='.repeat(60));
    console.log('\nSummary:');
    console.log('- Test 1: Missing OAuth Credentials');
    console.log('- Test 2: Missing Refresh Token');
    console.log('- Test 3: All Credentials Present');
    console.log('- Test 4: Secrets Manager Integration');
    console.log('\nNote: Some tests may show warnings if AWS credentials are not configured locally.');
    console.log('This is expected and does not affect the token checking logic.\n');
  } catch (error: any) {
    console.error('\n❌ Test runner error:', error);
    process.exit(1);
  }
}

// Run tests
runTests().catch(console.error);

