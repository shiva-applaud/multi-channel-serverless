/**
 * Gmail OAuth2 Lambda Handler - Automated OAuth Flow
 * 
 * This Lambda function automatically handles Gmail OAuth2 authentication:
 * 1. GET /gmail/oauth/authorize - Serves HTML page that auto-redirects to Google OAuth
 * 2. GET /gmail/oauth/callback - Automatically exchanges code for tokens and stores them
 * 3. GET /gmail/oauth/status - Check OAuth status and token info
 * 
 * Tokens are automatically stored in AWS Secrets Manager
 * 
 * Environment Variables Required:
 * - GMAIL_CLIENT_ID: OAuth2 client ID from Google Cloud Console
 * - GMAIL_CLIENT_SECRET: OAuth2 client secret from Google Cloud Console
 * - GMAIL_REDIRECT_URI: OAuth2 redirect URI (must match Google Cloud Console)
 * - AWS_REGION: AWS region (defaults to us-east-1)
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { google } from 'googleapis';
import { SecretsManagerClient, GetSecretValueCommand, PutSecretValueCommand, CreateSecretCommand } from '@aws-sdk/client-secrets-manager';
import { storeSecret } from '../utils/secretsManager';

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
];

const SECRET_NAME = 'gmail-oauth-tokens';

interface TokenData {
  access_token: string;
  refresh_token: string;
  expiry_date: number;
  token_type: string;
  scope: string;
}

/**
 * Get AWS Secrets Manager client
 */
function getSecretsManagerClient() {
  return new SecretsManagerClient({
    region: process.env.AWS_REGION || 'us-east-1',
  });
}

/**
 * Store tokens in AWS Secrets Manager
 */
async function storeTokens(tokens: TokenData): Promise<void> {
  const client = getSecretsManagerClient();
  const secretValue = JSON.stringify(tokens, null, 2);

  try {
    // Try to update existing secret
    await client.send(new PutSecretValueCommand({
      SecretId: SECRET_NAME,
      SecretString: secretValue,
    }));
    console.log('✓ Tokens updated in Secrets Manager');
  } catch (error: any) {
    if (error.name === 'ResourceNotFoundException') {
      // Secret doesn't exist, create it
      await client.send(new CreateSecretCommand({
        Name: SECRET_NAME,
        SecretString: secretValue,
        Description: 'Gmail OAuth2 tokens for Lambda functions',
      }));
      console.log('✓ Tokens stored in Secrets Manager');
    } else {
      throw error;
    }
  }
}

/**
 * Retrieve tokens from AWS Secrets Manager
 */
async function getTokens(): Promise<TokenData | null> {
  const client = getSecretsManagerClient();

  try {
    const response = await client.send(new GetSecretValueCommand({
      SecretId: SECRET_NAME,
    }));

    if (response.SecretString) {
      return JSON.parse(response.SecretString) as TokenData;
    }
    return null;
  } catch (error: any) {
    if (error.name === 'ResourceNotFoundException') {
      return null;
    }
    throw error;
  }
}

/**
 * Get OAuth2 client instance
 */
function getOAuth2Client() {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const redirectUri = process.env.GMAIL_REDIRECT_URI;

  if (!clientId || !clientSecret) {
    throw new Error('GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET must be set in environment variables');
  }

  if (!redirectUri) {
    throw new Error('GMAIL_REDIRECT_URI must be set in environment variables');
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

/**
 * Generate authorization URL
 */
function generateAuthUrl(): string {
  const oAuth2Client = getOAuth2Client();
  
  return oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent', // Force consent screen to get refresh token
  });
}

/**
 * Exchange authorization code for tokens
 */
async function exchangeCodeForTokens(code: string): Promise<TokenData> {
  const oAuth2Client = getOAuth2Client();
  
  const { tokens } = await oAuth2Client.getToken(code);
  
  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error('Failed to get access_token or refresh_token');
  }

  return {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: tokens.expiry_date || Date.now() + 3600000, // Default 1 hour
    token_type: tokens.token_type || 'Bearer',
    scope: tokens.scope || SCOPES.join(' '),
  };
}

/**
 * HTML page for auto-redirect to OAuth
 */
function getAuthorizeHtml(authUrl: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <title>Gmail OAuth Authorization</title>
  <meta charset="utf-8">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    }
    .container {
      background: white;
      padding: 2rem;
      border-radius: 10px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.2);
      text-align: center;
      max-width: 500px;
    }
    h1 {
      color: #333;
      margin-bottom: 1rem;
    }
    p {
      color: #666;
      margin-bottom: 2rem;
    }
    .spinner {
      border: 4px solid #f3f3f3;
      border-top: 4px solid #667eea;
      border-radius: 50%;
      width: 40px;
      height: 40px;
      animation: spin 1s linear infinite;
      margin: 0 auto 1rem;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    .redirect-text {
      color: #667eea;
      font-weight: 500;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🔐 Gmail Authorization</h1>
    <p>Redirecting to Google to authorize access...</p>
    <div class="spinner"></div>
    <p class="redirect-text">If you are not redirected automatically, <a href="${authUrl}">click here</a></p>
  </div>
  <script>
    // Auto-redirect after 1 second
    setTimeout(function() {
      window.location.href = "${authUrl}";
    }, 1000);
  </script>
</body>
</html>`;
}

/**
 * Success page after token storage
 */
function getSuccessHtml(refreshToken: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <title>Gmail OAuth Success</title>
  <meta charset="utf-8">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
    }
    .container {
      background: white;
      padding: 2rem;
      border-radius: 10px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.2);
      text-align: center;
      max-width: 600px;
    }
    h1 {
      color: #11998e;
      margin-bottom: 1rem;
    }
    .success-icon {
      font-size: 4rem;
      margin-bottom: 1rem;
    }
    .token-box {
      background: #f5f5f5;
      padding: 1rem;
      border-radius: 5px;
      margin: 1rem 0;
      word-break: break-all;
      font-family: monospace;
      font-size: 0.9rem;
    }
    .instructions {
      text-align: left;
      background: #e8f5e9;
      padding: 1rem;
      border-radius: 5px;
      margin-top: 1rem;
    }
    .instructions h3 {
      margin-top: 0;
      color: #2e7d32;
    }
    .instructions code {
      background: white;
      padding: 0.2rem 0.4rem;
      border-radius: 3px;
      font-family: monospace;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="success-icon">✅</div>
    <h1>Authorization Successful!</h1>
    <p>Your Gmail OAuth tokens have been automatically stored in AWS Secrets Manager.</p>
    
    <div class="token-box">
      <strong>Refresh Token:</strong><br>
      ${refreshToken.substring(0, 50)}...
    </div>
    
    <div class="instructions">
      <h3>Next Steps:</h3>
      <ol>
        <li>Tokens are stored in AWS Secrets Manager: <code>${SECRET_NAME}</code></li>
        <li>Your Lambda functions can now use these tokens automatically</li>
        <li>The Gmail poller will automatically refresh tokens when needed</li>
        <li>No manual configuration required!</li>
      </ol>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Lambda handler
 */
export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const path = event.path || '';
    const httpMethod = event.httpMethod || 'GET';
    const queryParams = event.queryStringParameters || {};

    console.log('Gmail OAuth Handler:', { path, httpMethod });

    // Route: GET /gmail/oauth/authorize - Auto-redirect to OAuth
    if (path.includes('/authorize') && httpMethod === 'GET') {
      const authUrl = generateAuthUrl();
      const html = getAuthorizeHtml(authUrl);
      
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'text/html',
        },
        body: html,
      };
    }

    // Route: GET /gmail/oauth/callback - Automatically handle callback and store tokens
    if (path.includes('/callback') && httpMethod === 'GET') {
      const code = queryParams.code;
      const error = queryParams.error;

      if (error) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'text/html',
          },
          body: `<html><body><h1>Authorization Failed</h1><p>Error: ${error}</p></body></html>`,
        };
      }

      if (!code) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'text/html',
          },
          body: '<html><body><h1>Missing Authorization Code</h1><p>Please start the authorization process again.</p></body></html>',
        };
      }

      try {
        // Exchange code for tokens
        const tokens = await exchangeCodeForTokens(code);
        
        // Automatically store tokens in Secrets Manager
        await storeTokens(tokens);
        
        // Also store OAuth credentials if not already stored
        try {
          const oauthCreds = {
            client_id: process.env.GMAIL_CLIENT_ID || '',
            client_secret: process.env.GMAIL_CLIENT_SECRET || '',
          };
          if (oauthCreds.client_id && oauthCreds.client_secret) {
            await storeSecret('gmail-oauth-credentials', oauthCreds);
            console.log('✓ OAuth credentials stored in Secrets Manager');
          }
        } catch (credError) {
          console.warn('Could not store OAuth credentials:', credError);
        }
        
        console.log('✓ Tokens stored successfully in Secrets Manager');

        // Return success page
        const html = getSuccessHtml(tokens.refresh_token);
        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'text/html',
          },
          body: html,
        };
      } catch (error: any) {
        console.error('Error exchanging code for tokens:', error);
        return {
          statusCode: 500,
          headers: {
            'Content-Type': 'text/html',
          },
          body: `<html><body><h1>Error</h1><p>${error.message || 'Failed to exchange code for tokens'}</p></body></html>`,
        };
      }
    }

    // Route: GET /gmail/oauth/status - Check token status
    if (path.includes('/status') && httpMethod === 'GET') {
      try {
        const tokens = await getTokens();
        
        if (!tokens) {
          return {
            statusCode: 200,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
            body: JSON.stringify({
              success: false,
              message: 'No tokens found. Please authorize first.',
              authorizeUrl: `/gmail/oauth/authorize`,
            }),
          };
        }

        const isExpired = tokens.expiry_date < Date.now();
        
        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({
            success: true,
            tokens: {
              hasAccessToken: !!tokens.access_token,
              hasRefreshToken: !!tokens.refresh_token,
              expiresAt: new Date(tokens.expiry_date).toISOString(),
              isExpired,
              scope: tokens.scope,
            },
          }),
        };
      } catch (error: any) {
        return {
          statusCode: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({
            success: false,
            error: error.message || 'Failed to get token status',
          }),
        };
      }
    }

    // Default route - show info
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        success: true,
        message: 'Gmail OAuth2 Automated Handler',
        endpoints: {
          authorize: 'GET /gmail/oauth/authorize - Auto-redirects to Google OAuth',
          callback: 'GET /gmail/oauth/callback?code=CODE - Automatically stores tokens',
          status: 'GET /gmail/oauth/status - Check token status',
        },
        automation: 'Tokens are automatically stored in AWS Secrets Manager',
      }),
    };
  } catch (error: any) {
    console.error('Error in Gmail OAuth handler:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        success: false,
        error: error.message || 'Internal server error',
      }),
    };
  }
};
