# Gmail Poller Lambda Setup Guide

Complete guide for setting up AWS Lambda function to poll personal Gmail inbox every minute.

## Overview

This solution uses:
- **OAuth 2.0 Desktop App** credentials (not service accounts)
- **AWS Lambda** with **EventBridge** schedule (runs every 1 minute)
- **Automatic token refresh** via googleapis library
- **TypeScript** for type safety

## Prerequisites

1. **AWS Account** with Lambda and EventBridge access
2. **Google Cloud Project** with Gmail API enabled
3. **Node.js** 20.x or higher
4. **Serverless Framework** (for deployment)

## Step 1: Create Google Cloud OAuth Credentials

### 1.1 Create Project & Enable Gmail API

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable **Gmail API**:
   - Go to [API Library](https://console.cloud.google.com/apis/library)
   - Search for "Gmail API"
   - Click **Enable**

### 1.2 Configure OAuth Consent Screen

1. Go to [OAuth Consent Screen](https://console.cloud.google.com/apis/credentials/consent)
2. Choose **External** (for personal use)
3. Fill in:
   - App name: `Gmail Poller`
   - User support email: Your email
   - Developer contact: Your email
4. Click **Save and Continue**
5. **Scopes**: Click **Add or Remove Scopes**
   - Add: `https://www.googleapis.com/auth/gmail.readonly`
   - Add: `https://www.googleapis.com/auth/gmail.modify`
6. Click **Save and Continue**
7. **Test users**: Add your Gmail address
8. Click **Save and Continue**

### 1.3 Create OAuth Client ID

1. Go to [Credentials](https://console.cloud.google.com/apis/credentials)
2. Click **Create Credentials** → **OAuth client ID**
3. Application type: **Desktop app**
4. Name: `Gmail Poller Desktop`
5. Click **Create**
6. Click **Download JSON**
7. Save as `client_secret.json` in project root

## Step 2: Generate Refresh Token

### 2.1 Install Dependencies

```bash
npm install googleapis
npm install --save-dev @types/node typescript ts-node serverless serverless-plugin-typescript
```

### 2.2 Run Token Generator

```bash
npm run token
```

This will:
1. Load `client_secret.json`
2. Open authorization URL in browser
3. Ask you to paste the authorization code
4. Generate `gmail_tokens.json` with refresh token

**Important**: Copy the `GMAIL_REFRESH_TOKEN` value - you'll need it for Lambda!

## Step 3: Configure AWS Lambda Environment Variables

Set these environment variables in AWS Lambda (or via serverless.yml):

### Required Variables:
```
GMAIL_CLIENT_ID=<from client_secret.json>
GMAIL_CLIENT_SECRET=<from client_secret.json>
GMAIL_REFRESH_TOKEN=<from gmail_tokens.json>
```

### Optional Configuration Variables:
```
SENDER_EMAIL=shiva.prabhakar@applaudhr.com  # Email to monitor (default)
MAX_RESULTS=5                                 # Max emails per run (default: 5)
```

### Option A: Via Serverless Framework

Add to `.env` file:
```env
GMAIL_CLIENT_ID=your_client_id_here
GMAIL_CLIENT_SECRET=your_client_secret_here
GMAIL_REFRESH_TOKEN=your_refresh_token_here
```

### Option B: Via AWS Console

1. Go to AWS Lambda Console
2. Select your function
3. Configuration → Environment variables
4. Add the three variables above

## Step 4: Build and Deploy

### 4.1 Build TypeScript

```bash
npm run build
```

### 4.2 Deploy to AWS

```bash
# Install serverless globally (if not already)
npm install -g serverless

# Deploy
cd src/gmail-oauth
serverless deploy

# Or use npm script
npm run deploy
```

## Step 5: Verify Deployment

### 5.1 Check Lambda Function

1. Go to AWS Lambda Console
2. Find function: `gmail-poller-dev-gmailPoller`
3. Check **Configuration** → **Environment variables**
4. Verify all three Gmail variables are set

### 5.2 Check EventBridge Schedule

1. Go to AWS EventBridge Console
2. Find rule: `gmail-poller-dev-gmailPoller-schedule`
3. Verify it's **Enabled**
4. Check **Schedule expression**: `rate(1 minute)`

### 5.3 Test Manually

1. Go to Lambda function
2. Click **Test**
3. Create test event (empty object `{}`)
4. Click **Test**
5. Check **Logs** tab for output

## Step 6: Monitor Logs

### Via AWS Console

1. Go to CloudWatch → Log Groups
2. Find: `/aws/lambda/gmail-poller-dev-gmailPoller`
3. View logs in real-time

### Via Serverless CLI

```bash
serverless logs -f gmailPoller -t
```

## Project Structure

```
project-root/
├── client_secret.json          # OAuth credentials (from Google Cloud)
├── gmail_tokens.json           # Generated tokens (local only)
├── src/
│   └── gmail-oauth/
│       ├── token-generator.ts  # Generate refresh token
│       ├── gmail-client.ts     # Gmail API client
│       ├── poller-lambda.ts    # Lambda handler
│       └── serverless.yml      # Serverless config
├── dist/                       # Compiled JavaScript
├── package.json
├── tsconfig.json
└── .env                        # Environment variables (not committed)
```

## How It Works

### Token Refresh Flow

1. **Access tokens** expire after 1 hour
2. **Refresh tokens** are long-lived (until revoked)
3. When Lambda runs, `googleapis` checks if access token is expired
4. If expired, it automatically uses `refresh_token` to get new `access_token`
5. No manual intervention needed!

### Polling Flow

1. **EventBridge** triggers Lambda every 1 minute
2. Lambda builds query: `from:{SENDER_EMAIL} is:unread`
3. Lambda calls `gmail.listEmails(query, MAX_RESULTS)` (default: 5 emails)
4. For each unread email from the specified sender:
   - Reads full email details
   - Decodes base64 body
   - Processes email (add your logic here)
   - Marks as read
5. Returns summary of processed emails

### Configuration

- **SENDER_EMAIL**: Email address to monitor (default: `shiva.prabhakar@applaudhr.com`)
- **MAX_RESULTS**: Maximum emails to process per run (default: `5`)
- **Query**: `from:{SENDER_EMAIL} is:unread` - Filters for unread emails from specific sender

### Gmail Search Queries

The poller uses `is:unread` query. You can modify it in `poller-lambda.ts`:

- `is:unread` - Unread emails
- `is:unread newer_than:1d` - Unread from last 24 hours
- `is:unread from:example@gmail.com` - Unread from specific sender
- `is:unread has:attachment` - Unread with attachments

See [Gmail Search Operators](https://support.google.com/mail/answer/7190) for more.

### Base64 Email Decoding

Gmail API returns email body as **base64url** encoded:
- Uses `-` instead of `+`
- Uses `_` instead of `/`
- We decode it to UTF-8 to get actual content

The `decodeBase64Email()` function handles this automatically.

## Troubleshooting

### "Missing Gmail OAuth2 credentials"

Set environment variables in Lambda:
- `GMAIL_CLIENT_ID`
- `GMAIL_CLIENT_SECRET`
- `GMAIL_REFRESH_TOKEN`

### "Refresh token expired or invalid"

Run `npm run token` again to get a new refresh token, then update Lambda environment variable.

### "Function timeout"

Increase timeout in `serverless.yml`:
```yaml
provider:
  timeout: 60  # Increase from 30 to 60 seconds
```

### "Too many emails to process"

Reduce `maxResults` in `poller-lambda.ts`:
```typescript
const maxResults = 20; // Reduce from 50
```

### Lambda not triggering

1. Check EventBridge rule is **Enabled**
2. Verify schedule expression: `rate(1 minute)`
3. Check Lambda function is deployed correctly
4. Check CloudWatch logs for errors

## Local Testing

Test the poller locally before deploying:

```bash
# Set environment variables
export GMAIL_CLIENT_ID=your_client_id
export GMAIL_CLIENT_SECRET=your_client_secret
export GMAIL_REFRESH_TOKEN=your_refresh_token

# Run locally
npx ts-node src/gmail-oauth/poller-lambda.ts
```

## Cost Estimation

- **Lambda**: Free tier includes 1M requests/month
- **EventBridge**: Free tier includes 14M custom events/month
- **CloudWatch Logs**: First 5GB free/month

For 1-minute polling:
- ~43,200 invocations/month
- Well within free tier limits!

## Security Best Practices

1. **Never commit** `client_secret.json` or `gmail_tokens.json`
2. Use **AWS Secrets Manager** for production:
   ```typescript
   // Load from Secrets Manager instead of env vars
   const secrets = await getSecret('gmail-oauth-credentials');
   ```
3. **Rotate refresh tokens** periodically
4. **Monitor CloudWatch** for unauthorized access attempts
5. Use **IAM roles** with least privilege

## Next Steps

- Add email filtering logic
- Store processed emails in DynamoDB
- Send notifications via SNS/SES
- Add error alerting via CloudWatch Alarms
- Implement exponential backoff for API errors

## Support

For issues:
1. Check CloudWatch logs
2. Verify environment variables
3. Test locally first
4. Check Gmail API quotas

