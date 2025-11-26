# Automated Gmail Token Management

This document explains the automated token generation, refresh, and storage system.

## Overview

The system now automatically:
1. ✅ **Generates tokens** via OAuth flow (one-time setup)
2. ✅ **Stores tokens** in AWS Secrets Manager automatically
3. ✅ **Refreshes tokens** daily before they expire
4. ✅ **Updates Secrets Manager** with refreshed tokens

## Components

### 1. OAuth Handler (`src/handlers/gmailOAuth.ts`)

**Endpoints:**
- `GET /gmail/oauth/authorize` - Auto-redirects to Google OAuth
- `GET /gmail/oauth/callback` - Automatically exchanges code and stores tokens
- `GET /gmail/oauth/status` - Check token status

**What it does:**
- When user authorizes, automatically exchanges code for tokens
- Stores tokens in Secrets Manager (`gmail-oauth-tokens`)
- Stores OAuth credentials in Secrets Manager (`gmail-oauth-credentials`)
- Shows success page with confirmation

### 2. Token Refresh Handler (`src/handlers/gmailTokenRefresh.ts`)

**Schedule:** Runs daily at 2 AM UTC (`cron(0 2 * * ? *)`)

**What it does:**
- Checks if tokens are expired or expiring within 24 hours
- Refreshes access token using refresh token
- Updates Secrets Manager with new tokens
- Logs results for monitoring

**Benefits:**
- Prevents token expiration issues
- Keeps tokens fresh automatically
- No manual intervention needed

## Setup Flow

### Initial Setup (One-Time)

1. **Deploy the functions:**
   ```bash
   serverless deploy
   ```

2. **Get authorization URL:**
   ```bash
   # Visit: https://your-api.com/gmail/oauth/authorize
   ```

3. **Authorize:**
   - Page auto-redirects to Google
   - Grant permissions
   - Automatically redirected back
   - Tokens stored in Secrets Manager

4. **Done!** Tokens are now managed automatically.

### Daily Automation

The `gmailTokenRefresh` function runs automatically every day:
- Checks token expiry
- Refreshes if needed
- Updates Secrets Manager
- No action required from you!

## How It Works

```
┌─────────────────────────────────────┐
│  Daily Schedule (2 AM UTC)          │
│  gmailTokenRefresh Lambda           │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Load tokens from Secrets Manager    │
│  (gmail-oauth-tokens)               │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Check expiry date                  │
│  Is token expiring in < 24 hours?   │
└──────────────┬──────────────────────┘
               │
        ┌──────┴──────┐
        │             │
       Yes           No
        │             │
        ▼             ▼
┌─────────────┐  ┌─────────────┐
│ Refresh     │  │ Skip        │
│ token       │  │ (still valid)│
└──────┬──────┘  └─────────────┘
       │
       ▼
┌─────────────────────────────────────┐
│  Store refreshed tokens in          │
│  Secrets Manager                    │
└─────────────────────────────────────┘
```

## Configuration

### Schedule

The refresh runs daily at 2 AM UTC. To change the schedule, edit `serverless.yml`:

```yaml
gmailTokenRefresh:
  events:
    - schedule:
        rate: cron(0 2 * * ? *)  # Change this cron expression
```

**Common cron patterns:**
- `cron(0 2 * * ? *)` - Daily at 2 AM UTC
- `cron(0 */6 * * ? *)` - Every 6 hours
- `cron(0 0 * * ? *)` - Daily at midnight UTC

### Token Refresh Threshold

Default: 24 hours before expiry. To change, edit `src/handlers/gmailTokenRefresh.ts`:

```typescript
const TOKEN_REFRESH_THRESHOLD = 24 * 60 * 60 * 1000; // Change this value
```

## Gmail Poller Token Handling

### Automatic Token Checking

The Gmail poller (`src/gmail-oauth/poller-lambda.ts`) automatically checks for tokens before starting:

1. **Pre-check**: Verifies OAuth credentials and refresh token exist
2. **If missing**: Provides clear error messages with setup instructions
3. **If present**: Proceeds with polling automatically

### Token Refresh During Polling

**Question: Do we need to generate tokens when polling?**

**Answer**: 
- **Initial setup**: YES, one-time OAuth authorization required (visit `/gmail/oauth/authorize`)
- **After setup**: NO, tokens refresh automatically

**How it works:**
- The `googleapis` library automatically refreshes access tokens when they expire
- The poller uses the refresh token stored in Secrets Manager
- No manual intervention needed after initial setup

### Error Handling

If tokens are missing, the poller will:
- Log clear error messages
- Provide instructions to complete OAuth setup
- Return gracefully without crashing
- Resume automatically once tokens are available

**Example error message:**
```
❌ Missing Gmail refresh token. Initial OAuth authorization required (one-time setup).
Visit /gmail/oauth/authorize to authorize. After setup, token refresh is fully automated.
⏸️  Polling paused until OAuth tokens are available
```

## Monitoring

### CloudWatch Logs

Check logs for:
- Token refresh status
- Expiry information
- Errors (if any)

**Log Groups:**
- `/aws/lambda/twilio-lambda-webhook-dev-gmailTokenRefresh` - Token refresh
- `/aws/lambda/twilio-lambda-webhook-dev-gmailPoller` - Gmail polling

### Manual Check

Check token status via API:
```bash
curl https://your-api.com/gmail/oauth/status
```

## Troubleshooting

### "No refresh token found"

**Solution:** Run OAuth authorization flow:
1. Visit `/gmail/oauth/authorize`
2. Authorize with Google
3. Tokens will be stored automatically

### "Failed to refresh token"

**Possible causes:**
- Refresh token expired (rare, but possible)
- OAuth credentials changed
- Network issues

**Solution:**
1. Re-run OAuth flow to get new refresh token
2. Check CloudWatch logs for details
3. Verify `GMAIL_CLIENT_ID` and `GMAIL_CLIENT_SECRET` are correct

### Function not running

**Check:**
1. EventBridge rule is enabled
2. Lambda function is deployed
3. CloudWatch logs for errors

## Benefits

✅ **Fully Automated** - No manual token management  
✅ **Prevents Expiry** - Tokens refreshed before expiration  
✅ **Secure Storage** - Tokens in AWS Secrets Manager  
✅ **Self-Healing** - Automatically recovers from token issues  
✅ **Monitoring** - CloudWatch logs for visibility  

## Cost

- **Lambda:** ~1 invocation/day = ~30 invocations/month (well within free tier)
- **Secrets Manager:** $0.40/secret/month (first 10,000 API calls free)
- **Total:** ~$0.40/month for automated token management

## Next Steps

1. Deploy: `serverless deploy`
2. Authorize once: Visit `/gmail/oauth/authorize`
3. Monitor: Check CloudWatch logs after first daily run
4. Enjoy: Tokens managed automatically!

