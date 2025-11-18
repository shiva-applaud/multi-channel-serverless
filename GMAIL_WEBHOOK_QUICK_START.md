# Gmail Webhook - Quick Start

## TL;DR: How It Works

**Yes, you need to configure several things!** Here's the simplified flow:

```
New Email → Gmail → Pub/Sub Topic → Pub/Sub Subscription → Your Webhook → Process Email
```

## What You Need to Configure

### 1. **Google Cloud Pub/Sub** ✅
- Create a **topic** (e.g., `gmail-notifications`)
- Create a **subscription** (push type)
- Point subscription to your webhook URL

### 2. **Gmail Watch** ⚠️ (Most Important!)
- Tell Gmail to send notifications to your Pub/Sub topic
- Requires **OAuth2** (not service account)
- Expires after **7 days** (needs renewal)

### 3. **Your Webhook Endpoint**
- Deploy Lambda function
- Get the API Gateway URL
- Configure it in Pub/Sub subscription

## Quick Setup Steps

### Step 1: Create Pub/Sub Topic & Subscription

```bash
# Using gcloud CLI
gcloud pubsub topics create gmail-notifications
gcloud pubsub subscriptions create gmail-webhook-sub \
  --topic=gmail-notifications \
  --push-endpoint=https://YOUR_API_GATEWAY_URL/webhook/email
```

### Step 2: Set Up Gmail Watch

**Option A: Use the helper script**
```bash
export GOOGLE_CLIENT_ID="your-client-id"
export GOOGLE_CLIENT_SECRET="your-client-secret"
export GOOGLE_PUBSUB_TOPIC="projects/YOUR_PROJECT_ID/topics/gmail-notifications"
node scripts/setup-gmail-watch.js
```

**Option B: Use Gmail API directly**
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

### Step 3: Deploy & Test

```bash
npm run deploy
# Send an email to your Gmail account
# Check Lambda logs: serverless logs -f webhookEmail -t
```

## Important Notes

⚠️ **Gmail Watch expires after 7 days** - You need to renew it!

⚠️ **Gmail Watch requires OAuth2** - Not service account (unlike sending emails)

✅ **Reading emails uses service account** - Same as sending emails

## What Happens When Email Arrives?

1. **Gmail** detects new email
2. **Gmail** publishes notification to Pub/Sub topic
3. **Pub/Sub** pushes message to your webhook
4. **Webhook** receives notification with `historyId`
5. **Webhook** uses Gmail API to fetch email details
6. **Webhook** processes and logs the email

## Testing Without Full Setup

You can test the webhook directly (without Pub/Sub):

```bash
curl -X POST http://localhost:3000/webhook/email \
  -H "Content-Type: application/json" \
  -d '{"test": "direct call"}'
```

This will fetch recent emails using Gmail API (useful for testing).

## Full Documentation

For detailed setup instructions, see **[GMAIL_WEBHOOK_SETUP.md](./GMAIL_WEBHOOK_SETUP.md)**

