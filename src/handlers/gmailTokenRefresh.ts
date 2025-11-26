/**
 * Gmail Token Refresh Lambda Handler
 * 
 * This Lambda function can be triggered:
 * 1. Automatically: Runs once per day via EventBridge schedule
 * 2. Manually: Via GET request to /gmail/oauth/refresh
 * 
 * Functionality:
 * - Check if Gmail OAuth tokens are expired or expiring soon
 * - Refresh access tokens using refresh token
 * - Store updated tokens in AWS Secrets Manager
 * 
 * Environment Variables:
 * - GMAIL_CLIENT_ID: OAuth2 client ID
 * - GMAIL_CLIENT_SECRET: OAuth2 client secret
 * - AWS_REGION: AWS region (defaults to us-east-1)
 */

import { EventBridgeEvent, APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { google } from 'googleapis';
import * as fs from 'fs';
import * as path from 'path';
import { getGmailTokens, storeSecret } from '../utils/secretsManager';

const TOKEN_REFRESH_THRESHOLD = 24 * 60 * 60 * 1000; // 24 hours before expiry

interface TokenData {
  access_token: string;
  refresh_token: string;
  expiry_date: number;
  token_type: string;
  scope: string;
}

/**
 * Write refreshed tokens to gmail_tokens.json (supports both repo root and /tmp for Lambda)
 */
function persistTokensToLocalFile(tokens: TokenData): void {
  const serializedTokens = JSON.stringify(tokens, null, 2);

  const candidatePaths = [
    path.join(process.cwd(), 'gmail_tokens.json'),
    path.join('/tmp', 'gmail_tokens.json'),
  ];

  for (const filePath of candidatePaths) {
    try {
      fs.writeFileSync(filePath, serializedTokens);
      console.log(`💾 Saved refreshed tokens to ${filePath}`);
      return;
    } catch (error: any) {
      console.warn(`⚠ Unable to write tokens to ${filePath}: ${error.message}`);
    }
  }

  console.warn('⚠ Could not persist refreshed tokens to any local path');
}

/**
 * Refresh Gmail OAuth tokens
 */
async function refreshTokens(refreshToken: string, clientId: string, clientSecret: string): Promise<TokenData> {
  const oAuth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    'http://localhost' // Not used for refresh flow
  );

  oAuth2Client.setCredentials({
    refresh_token: refreshToken,
  });

  const { credentials } = await oAuth2Client.refreshAccessToken();

  if (!credentials.access_token) {
    throw new Error('Failed to refresh access token');
  }

  return {
    access_token: credentials.access_token,
    refresh_token: refreshToken, // Keep existing refresh token
    expiry_date: credentials.expiry_date || Date.now() + 3600000, // Default 1 hour
    token_type: credentials.token_type || 'Bearer',
    scope: credentials.scope || 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.send',
  };
}

/**
 * Check if event is from API Gateway (HTTP request)
 */
function isApiGatewayEvent(event: any): event is APIGatewayProxyEvent {
  return event && event.httpMethod && event.requestContext;
}

/**
 * Core token refresh logic
 */
async function refreshTokenLogic(): Promise<{ success: boolean; message: string; tokensRefreshed?: boolean; tokenDetails?: any }> {
  // Get OAuth credentials
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET must be set');
  }

  // Get existing tokens from Secrets Manager
  const existingTokens = await getGmailTokens();

  if (!existingTokens || !existingTokens.refresh_token) {
    console.log('⚠ No refresh token found in Secrets Manager');
    return {
      success: false,
      message: 'No refresh token found. Please run OAuth authorization flow first.',
    };
  }

  const refreshToken = existingTokens.refresh_token;
  const currentExpiry = existingTokens.expiry_date || 0;
  const timeUntilExpiry = currentExpiry - Date.now();

  console.log('Token status:', {
    hasRefreshToken: !!refreshToken,
    currentExpiry: new Date(currentExpiry).toISOString(),
    timeUntilExpiry: Math.round(timeUntilExpiry / 1000 / 60), // minutes
    needsRefresh: timeUntilExpiry < TOKEN_REFRESH_THRESHOLD,
  });

  // Check if token needs refresh
  if (timeUntilExpiry > TOKEN_REFRESH_THRESHOLD) {
    console.log('✓ Token is still valid, no refresh needed');
    return {
      success: true,
      message: 'Token is still valid, no refresh needed',
      tokensRefreshed: false,
      tokenDetails: {
        expiresAt: new Date(currentExpiry).toISOString(),
        timeUntilExpiryMinutes: Math.round(timeUntilExpiry / 1000 / 60),
      },
    };
  }

  // Refresh tokens
  console.log('🔄 Refreshing access token...');
  const refreshedTokens = await refreshTokens(refreshToken, clientId, clientSecret);

  // Store updated tokens in Secrets Manager
  console.log('💾 Storing refreshed tokens in Secrets Manager...');
  await storeSecret('gmail-oauth-tokens', refreshedTokens);

  // Also persist tokens locally (for local development / reference)
  persistTokensToLocalFile(refreshedTokens);

  console.log('✅ Tokens refreshed and stored successfully');
  const tokenDetails = {
    expiresAt: new Date(refreshedTokens.expiry_date).toISOString(),
    timeUntilExpiryMinutes: Math.round((refreshedTokens.expiry_date - Date.now()) / 1000 / 60),
  };
  console.log('Token details:', tokenDetails);

  return {
    success: true,
    message: 'Tokens refreshed and stored successfully',
    tokensRefreshed: true,
    tokenDetails,
  };
}

/**
 * Lambda handler - supports both EventBridge (scheduled) and API Gateway (HTTP GET) events
 */
export const handler = async (
  event: EventBridgeEvent<string, any> | APIGatewayProxyEvent,
  context: Context
): Promise<{ success: boolean; message: string; tokensRefreshed?: boolean } | APIGatewayProxyResult> => {
  console.log('=== Gmail Token Refresh Lambda Started ===');
  console.log('Event type:', isApiGatewayEvent(event) ? 'API Gateway (HTTP)' : 'EventBridge (Scheduled)');
  console.log('Event:', JSON.stringify(event, null, 2));

  try {
    const result = await refreshTokenLogic();

    // If it's an API Gateway event, return HTTP response
    if (isApiGatewayEvent(event)) {
      return {
        statusCode: result.success ? 200 : 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          success: result.success,
          message: result.message,
          tokensRefreshed: result.tokensRefreshed,
          tokenDetails: result.tokenDetails,
          timestamp: new Date().toISOString(),
        }),
      };
    }

    // For EventBridge events, return the result object directly
    return result;
  } catch (error: any) {
    console.error('❌ Error refreshing tokens:', error);
    const errorMessage = error.message || 'Failed to refresh tokens';
    const errorResult = {
      success: false,
      message: errorMessage,
    };

    // If it's an API Gateway event, return HTTP error response
    if (isApiGatewayEvent(event)) {
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          ...errorResult,
          timestamp: new Date().toISOString(),
        }),
      };
    }

    // For EventBridge events, return the error result object directly
    return errorResult;
  }
};

