# Gmail Webhook Setup Guide

This guide explains how the Gmail webhook works and how to configure it to receive email notifications.

## How It Works

The Gmail webhook uses **Gmail Push Notifications** via **Google Cloud Pub/Sub**. Here's the flow:

```
┌─────────┐         ┌──────────────┐         ┌─────────────┐         ┌──────────┐
│  Gmail  │ ──────> │ Pub/Sub Topic│ ──────> │ Pub/Sub Sub │ ──────> │ Webhook  │
│  Inbox  │  New    │              │         │             │  Push   │ Endpoint │
└─────────┘  Email  └──────────────┘         └─────────────┘         └──────────┘
                                                      │
                                                      │ HTTP POST
                                                      ▼
                                              ┌──────────────┐
                                              │ Lambda       │
                                              │ Function     │
                                              └──────────────┘
```

### Step-by-Step Process:

1. **New Email Arrives**: When a new email arrives in the Gmail inbox
2. **Gmail Publishes**: Gmail publishes a notification to your Pub/Sub topic
3. **Pub/Sub Pushes**: The Pub/Sub subscription pushes the message to your webhook endpoint
4. **Webhook Receives**: Your Lambda function receives the Pub/Sub message
5. **Webhook Processes**: 
   - Decodes the base64 message data
   - Extracts the `historyId` (Gmail's way of tracking changes)
   - Uses Gmail API to fetch new emails since that `historyId`
   - Processes and logs the new emails

## Prerequisites

Before setting up the webhook, you need:

1. ✅ Google Cloud Project with Gmail API enabled
2. ✅ Service account with domain-wide delegation
3. ✅ Google Workspace account
4. ✅ Deployed Lambda function (or local server for testing)

## Step-by-Step Configuration

### Step 1: Create a Pub/Sub Topic

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to **Pub/Sub** → **Topics**
3. Click **Create Topic**
4. Name it (e.g., `gmail-notifications`)
5. Click **Create**

**Note the topic name** - you'll need it later (format: `projects/YOUR_PROJECT_ID/topics/gmail-notifications`)

### Step 2: Create a Pub/Sub Subscription

1. In Pub/Sub, go to **Subscriptions**
2. Click **Create Subscription**
3. Configure:
   - **Name**: `gmail-webhook-subscription`
   - **Topic**: Select the topic you created (`gmail-notifications`)
   - **Delivery Type**: **Push**
   - **Endpoint URL**: Your webhook endpoint URL
     - For AWS Lambda: `https://YOUR_API_GATEWAY_URL/webhook/email`
     - For local testing: `http://your-ngrok-url.ngrok.io/webhook/email` (see below)
   - **Authentication**: 
     - **Add Google-generated OIDC token** (recommended)
     - Or configure authentication headers if needed
4. Click **Create**

### Step 3: Enable Gmail API

1. Go to **APIs & Services** → **Library**
2. Search for "Gmail API"
3. Click **Enable**

### Step 4: Set Up Gmail Watch (Subscribe to Notifications)

You need to tell Gmail to send notifications to your Pub/Sub topic. This requires:

1. **OAuth2 Access Token** (not service account) - Gmail watch requires user OAuth
2. **Make an API call** to subscribe:

```bash
# Using curl
curl -X POST \
  'https://gmail.googleapis.com/gmail/v1/users/me/watch' \
  -H 'Authorization: Bearer YOUR_OAUTH2_ACCESS_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "topicName": "projects/YOUR_PROJECT_ID/topics/gmail-notifications",
    "labelIds": ["INBOX"]
  }'
```

**Important Notes:**
- Gmail watch requires **OAuth2 user credentials**, not service account
- The watch expires after 7 days and needs to be renewed
- You can watch specific labels (e.g., `INBOX`, `UNREAD`)
- The topic must be in the same Google Cloud project

### Step 5: Get Your Webhook URL

#### For AWS Lambda (Production):

After deploying, get your API Gateway URL:

```bash
serverless info
```

Look for the endpoint:
```
POST - https://xxxxx.execute-api.eu-central-1.amazonaws.com/dev/webhook/email
```

#### For Local Testing:

Use **ngrok** or similar tool to expose your local server:

1. **Install ngrok**: https://ngrok.com/
2. **Start your local server**:
   ```bash
   npm run start
   ```
3. **In another terminal, start ngrok**:
   ```bash
   ngrok http 3000
   ```
4. **Copy the HTTPS URL** (e.g., `https://abc123.ngrok.io`)
5. **Use it in Pub/Sub subscription**: `https://abc123.ngrok.io/webhook/email`

### Step 6: Configure Pub/Sub Subscription Authentication

For security, configure authentication:

**Option A: OIDC Token (Recommended)**
- In Pub/Sub subscription settings, enable "Add Google-generated OIDC token"
- The token will be in the `Authorization` header
- Your webhook can verify it (optional but recommended)

**Option B: Custom Authentication**
- Add custom headers in Pub/Sub subscription
- Verify headers in your webhook handler

## Testing the Webhook

### Test 1: Manual Pub/Sub Message

Send a test message to your Pub/Sub topic:

```bash
# Using gcloud CLI
gcloud pubsub topics publish gmail-notifications \
  --message '{"emailAddress":"test@example.com","historyId":"123456"}'
```

### Test 2: Send a Real Email

1. Send an email to your Google Workspace email
2. Wait a few seconds
3. Check your Lambda logs:
   ```bash
   serverless logs -f webhookEmail -t
   ```

You should see:
```
Received Gmail Push notification: { emailAddress: '...', historyId: '...' }
Processed 1 new email(s)
New email received: { messageId: '...', from: '...', subject: '...' }
```

### Test 3: Direct Webhook Call (Alternative)

The webhook also supports direct calls for testing:

```bash
curl -X POST http://localhost:3000/webhook/email \
  -H "Content-Type: application/json" \
  -d '{"test": "direct call"}'
```

This will fetch and log recent emails (useful for testing without Pub/Sub).

## Understanding the Webhook Code

Looking at `src/handlers/webhookEmail.ts`:

```typescript
// 1. Receives Pub/Sub message
const body = JSON.parse(event.body);

// 2. Decodes base64 message data
const messageData = Buffer.from(body.message.data, 'base64').toString('utf-8');
const pushNotification = JSON.parse(messageData);
// Contains: { emailAddress, historyId, expiration }

// 3. Uses historyId to fetch new emails
const historyResponse = await gmail.users.history.list({
  userId: 'me',
  startHistoryId: pushNotification.historyId,
  historyTypes: ['messageAdded'],
});

// 4. Fetches full email details
const message = await getEmailMessage(messageId);
```

## Important Considerations

### Watch Expiration

Gmail watches expire after **7 days**. You need to:

1. **Set up a cron job** or scheduled Lambda to renew the watch
2. **Or** manually renew it periodically

**Renewal API call:**
```bash
curl -X POST \
  'https://gmail.googleapis.com/gmail/v1/users/me/watch' \
  -H 'Authorization: Bearer YOUR_OAUTH2_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "topicName": "projects/YOUR_PROJECT_ID/topics/gmail-notifications",
    "labelIds": ["INBOX"]
  }'
```

### OAuth2 vs Service Account

- **Gmail Watch**: Requires **OAuth2 user credentials** (user must grant permission)
- **Reading Emails**: Can use **service account** with domain-wide delegation
- **Sending Emails**: Can use **service account** with domain-wide delegation

**Solution**: Use OAuth2 for watch setup, service account for reading/sending.

### Alternative: Polling Instead of Push

If setting up Pub/Sub is complex, you can modify the webhook to poll Gmail periodically:

```typescript
// Instead of waiting for push notifications
// Poll Gmail API every X minutes
const recentEmails = await listEmails(10, 'is:unread');
```

But push notifications are more efficient and real-time.

## Troubleshooting

### Issue: No notifications received

1. **Check Pub/Sub subscription**: Is it configured correctly?
2. **Check Gmail watch**: Is it still active? (expires after 7 days)
3. **Check logs**: Look for errors in Lambda logs
4. **Verify endpoint**: Is your webhook URL accessible?

### Issue: "Invalid historyId"

- History IDs can expire if too old
- Make sure you're processing notifications promptly
- Store the latest historyId to handle missed notifications

### Issue: Authentication errors

- Verify service account has correct scopes
- Check domain-wide delegation is enabled
- Ensure OAuth2 token is valid (for watch setup)

## Quick Setup Script

A helper script is included in `scripts/setup-gmail-watch.js`:

**Usage:**
```bash
# Set required environment variables
export GOOGLE_CLIENT_ID="your-client-id"
export GOOGLE_CLIENT_SECRET="your-client-secret"
export GOOGLE_PUBSUB_TOPIC="projects/YOUR_PROJECT_ID/topics/gmail-notifications"
export GMAIL_LABEL_IDS="INBOX"  # Optional, defaults to INBOX

# Run the script
node scripts/setup-gmail-watch.js
```

The script will:
1. Guide you through OAuth2 authorization (if needed)
2. Set up the Gmail watch
3. Show you the expiration date
4. Provide instructions for renewal

**Alternative: Manual API Call**

Here's a Node.js script to set up Gmail watch manually:

```javascript
const { google } = require('googleapis');
const { OAuth2Client } = require('google-auth-library');

// Set up OAuth2 client
const oauth2Client = new OAuth2Client(
  'YOUR_CLIENT_ID',
  'YOUR_CLIENT_SECRET',
  'YOUR_REDIRECT_URI'
);

oauth2Client.setCredentials({
  refresh_token: 'YOUR_REFRESH_TOKEN'
});

const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

// Set up watch
async function setupWatch() {
  try {
    const response = await gmail.users.watch({
      userId: 'me',
      requestBody: {
        topicName: 'projects/YOUR_PROJECT_ID/topics/gmail-notifications',
        labelIds: ['INBOX']
      }
    });
    
    console.log('Watch set up successfully:', response.data);
    console.log('Expiration:', new Date(parseInt(response.data.expiration)));
  } catch (error) {
    console.error('Error setting up watch:', error);
  }
}

setupWatch();
```

## Summary

**To receive email notifications, you need to:**

1. ✅ Create Pub/Sub topic
2. ✅ Create Pub/Sub subscription (push to your webhook)
3. ✅ Set up Gmail watch (subscribe Gmail to Pub/Sub topic)
4. ✅ Deploy your Lambda function
5. ✅ Configure webhook endpoint in Pub/Sub subscription
6. ✅ Renew Gmail watch every 7 days (automated)

The webhook will automatically process new emails when they arrive!

