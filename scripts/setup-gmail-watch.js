/**
 * Script to set up Gmail Push notifications watch
 * 
 * This script subscribes Gmail to send notifications to a Pub/Sub topic
 * when new emails arrive.
 * 
 * Usage:
 *   node scripts/setup-gmail-watch.js
 * 
 * Required environment variables:
 *   - GOOGLE_CLIENT_ID: OAuth2 client ID
 *   - GOOGLE_CLIENT_SECRET: OAuth2 client secret
 *   - GOOGLE_REFRESH_TOKEN: OAuth2 refresh token
 *   - GOOGLE_PUBSUB_TOPIC: Pub/Sub topic name (e.g., projects/PROJECT_ID/topics/gmail-notifications)
 *   - GMAIL_LABEL_IDS: Comma-separated label IDs to watch (default: INBOX)
 */

const { google } = require('googleapis');
const readline = require('readline');

// Configuration
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/oauth2callback';
const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;
const TOPIC_NAME = process.env.GOOGLE_PUBSUB_TOPIC;
const LABEL_IDS = process.env.GMAIL_LABEL_IDS ? process.env.GMAIL_LABEL_IDS.split(',') : ['INBOX'];

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Error: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set');
  console.error('\nTo get OAuth2 credentials:');
  console.error('1. Go to Google Cloud Console → APIs & Services → Credentials');
  console.error('2. Create OAuth 2.0 Client ID');
  console.error('3. Add authorized redirect URI: http://localhost:3000/oauth2callback');
  console.error('4. Download credentials and set environment variables');
  process.exit(1);
}

if (!TOPIC_NAME) {
  console.error('Error: GOOGLE_PUBSUB_TOPIC must be set');
  console.error('Example: projects/YOUR_PROJECT_ID/topics/gmail-notifications');
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

async function getAccessToken() {
  if (REFRESH_TOKEN) {
    oauth2Client.setCredentials({
      refresh_token: REFRESH_TOKEN
    });
    
    try {
      const { credentials } = await oauth2Client.refreshAccessToken();
      return credentials.access_token;
    } catch (error) {
      console.error('Error refreshing access token:', error.message);
      console.error('You may need to get a new refresh token');
      return null;
    }
  }
  
  // If no refresh token, get authorization code
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.modify'
    ],
    prompt: 'consent'
  });
  
  console.log('\n🔐 Authorization required!');
  console.log('Visit this URL to authorize the application:');
  console.log('\n' + authUrl + '\n');
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise((resolve) => {
    rl.question('Enter the authorization code: ', async (code) => {
      rl.close();
      
      try {
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);
        
        console.log('\n✅ Access token obtained!');
        if (tokens.refresh_token) {
          console.log('\n📝 Save this refresh token for future use:');
          console.log('GOOGLE_REFRESH_TOKEN=' + tokens.refresh_token);
        }
        
        resolve(tokens.access_token);
      } catch (error) {
        console.error('Error getting access token:', error.message);
        resolve(null);
      }
    });
  });
}

async function setupWatch() {
  console.log('\n📧 Setting up Gmail Push notifications...\n');
  
  const accessToken = await getAccessToken();
  if (!accessToken) {
    console.error('Failed to obtain access token');
    process.exit(1);
  }
  
  oauth2Client.setCredentials({
    access_token: accessToken
  });
  
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  
  try {
    console.log('Configuration:');
    console.log('  Topic:', TOPIC_NAME);
    console.log('  Labels:', LABEL_IDS.join(', '));
    console.log('');
    
    const response = await gmail.users.watch({
      userId: 'me',
      requestBody: {
        topicName: TOPIC_NAME,
        labelIds: LABEL_IDS
      }
    });
    
    console.log('✅ Gmail watch set up successfully!\n');
    console.log('Watch details:');
    console.log('  History ID:', response.data.historyId);
    console.log('  Expiration:', new Date(parseInt(response.data.expiration)));
    console.log('');
    console.log('⚠️  Important: This watch expires in 7 days');
    console.log('   You need to renew it periodically or set up automation');
    console.log('');
    console.log('To renew, run this script again or use the Gmail API:');
    console.log('  POST https://gmail.googleapis.com/gmail/v1/users/me/watch');
    
  } catch (error) {
    console.error('\n❌ Error setting up watch:', error.message);
    
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Details:', JSON.stringify(error.response.data, null, 2));
    }
    
    if (error.message.includes('topicName')) {
      console.error('\n💡 Tip: Make sure the Pub/Sub topic exists and is in the same project');
    }
    
    if (error.message.includes('permission')) {
      console.error('\n💡 Tip: Make sure Gmail API is enabled and you have the correct scopes');
    }
    
    process.exit(1);
  }
}

// Run the setup
setupWatch().catch(console.error);

