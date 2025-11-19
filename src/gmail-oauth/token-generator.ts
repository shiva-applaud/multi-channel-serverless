/**
 * Gmail OAuth2 Token Generator
 * 
 * This script generates OAuth2 tokens for personal Gmail accounts.
 * Run this once to get your refresh token, then use it in your Lambda function.
 * 
 * Usage:
 *   1. Download client_secret.json from Google Cloud Console (OAuth Desktop App)
 *   2. Place it in the project root
 *   3. Run: npm run token
 *   4. Follow the prompts to authorize and get tokens
 */

import { google } from 'googleapis';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
];

const TOKEN_PATH = path.join(process.cwd(), 'gmail_tokens.json');
const CREDENTIALS_PATH = path.join(process.cwd(), 'client_secret.json');

interface TokenData {
  access_token: string;
  refresh_token: string;
  expiry_date: number;
  token_type: string;
  scope: string;
}

/**
 * Load or request authorization credentials
 */
async function authorize(): Promise<void> {
  // Check if credentials file exists
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    console.error(`❌ Error: ${CREDENTIALS_PATH} not found!`);
    console.log('\n📝 Instructions:');
    console.log('1. Go to https://console.cloud.google.com/');
    console.log('2. Create a new project or select existing one');
    console.log('3. Enable Gmail API');
    console.log('4. Go to APIs & Services → Credentials');
    console.log('5. Create Credentials → OAuth client ID');
    console.log('6. Application type: Desktop app');
    console.log('7. Download the JSON file');
    console.log(`8. Save it as: ${CREDENTIALS_PATH}\n`);
    process.exit(1);
  }

  let client: any;
  try {
    const content = fs.readFileSync(CREDENTIALS_PATH, 'utf8');
    const credentials = JSON.parse(content);
    
    const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
    
    if (!client_id || !client_secret) {
      throw new Error('Missing client_id or client_secret in credentials file');
    }

    client = new google.auth.OAuth2(
      client_id,
      client_secret,
      redirect_uris?.[0] || 'http://localhost'
    );

    // Check if we have previously stored a token
    let token: TokenData | null = null;
    if (fs.existsSync(TOKEN_PATH)) {
      try {
        const tokenContent = fs.readFileSync(TOKEN_PATH, 'utf8');
        token = JSON.parse(tokenContent);
        console.log('✓ Found existing tokens');
      } catch (err) {
        console.log('⚠ Existing token file is invalid, will generate new tokens');
      }
    }

    if (token) {
      client.setCredentials(token);
      
      // Check if token is expired
      if (token.expiry_date && Date.now() < token.expiry_date) {
        console.log('✓ Existing token is still valid');
        return;
      }
      
      // Try to refresh the token
      try {
        const { credentials: newCredentials } = await client.refreshAccessToken();
        console.log('✓ Token refreshed successfully');
        
        const newToken: TokenData = {
          access_token: newCredentials.access_token!,
          refresh_token: token.refresh_token || newCredentials.refresh_token!,
          expiry_date: newCredentials.expiry_date!,
          token_type: newCredentials.token_type || 'Bearer',
          scope: newCredentials.scope || SCOPES.join(' '),
        };
        
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(newToken, null, 2));
        console.log(`✓ Tokens saved to ${TOKEN_PATH}`);
        return;
      } catch (err) {
        console.log('⚠ Could not refresh token, will generate new tokens');
      }
    }

    // Get new token
    await getNewToken(client);
  } catch (error) {
    console.error('❌ Error loading client secret file:', error);
    process.exit(1);
  }
}

/**
 * Get and store new token after prompting for user authorization
 */
async function getNewToken(oAuth2Client: any): Promise<void> {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent', // Force consent screen to get refresh token
  });

  console.log('\n🔐 Authorize this app by visiting this url:\n');
  console.log(authUrl);
  console.log('\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve, reject) => {
    rl.question('Enter the code from that page here: ', async (code) => {
      rl.close();

      try {
        const { tokens } = await oAuth2Client.getToken(code);
        
        const tokenData: TokenData = {
          access_token: tokens.access_token!,
          refresh_token: tokens.refresh_token!,
          expiry_date: tokens.expiry_date!,
          token_type: tokens.token_type || 'Bearer',
          scope: tokens.scope || SCOPES.join(' '),
        };

        // Store the token
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokenData, null, 2));
        console.log(`\n✅ Token stored to ${TOKEN_PATH}`);
        console.log('\n📋 Token Information:');
        console.log(`   Access Token: ${tokens.access_token?.substring(0, 20)}...`);
        console.log(`   Refresh Token: ${tokens.refresh_token?.substring(0, 20)}...`);
        console.log(`   Expires: ${new Date(tokens.expiry_date!).toLocaleString()}`);
        console.log(`   Scopes: ${tokens.scope}`);
        console.log('\n💡 Save these values to AWS Lambda environment variables:');
        console.log(`   GMAIL_CLIENT_ID=${(JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8')).installed || JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8')).web).client_id}`);
        console.log(`   GMAIL_CLIENT_SECRET=${(JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8')).installed || JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8')).web).client_secret}`);
        console.log(`   GMAIL_REFRESH_TOKEN=${tokens.refresh_token}`);
        
        resolve();
      } catch (err: any) {
        console.error('❌ Error while trying to retrieve access token', err);
        reject(err);
      }
    });
  });
}

// Run the authorization flow
authorize().catch(console.error);
