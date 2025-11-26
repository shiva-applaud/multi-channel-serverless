# Gmail OAuth2 Lambda Poller

AWS Lambda function that polls personal Gmail inbox every minute using OAuth2.

## Quick Start

### 1. Generate Refresh Token

```bash
npm run gmail:token
```

This creates `gmail_tokens.json` with your refresh token.

### 2. Set Environment Variables

Add to `.env` or AWS Lambda:

**Required:**
```
GMAIL_CLIENT_ID=<from client_secret.json>
GMAIL_CLIENT_SECRET=<from client_secret.json>
GMAIL_REFRESH_TOKEN=<from gmail_tokens.json>
```

**Optional (with defaults):**
```
SENDER_EMAIL=hr-help-demo@applaudhr.com  # Email to monitor (optional, defaults to hr-help-demo@applaudhr.com)
MAX_RESULTS=5                                # Max emails per run (optional, defaults to 5)
```

### 3. Test Locally

**No environment variables needed!** The poller will automatically load from `client_secret.json` and `gmail_tokens.json`.

**Optional: Override defaults via environment variables:**

**Windows PowerShell:**
```powershell
$env:SENDER_EMAIL="hr-help-demo@applaudhr.com"  # Optional
$env:MAX_RESULTS="5"                                # Optional
```

**Linux/Mac:**
```bash
export SENDER_EMAIL="hr-help-demo@applaudhr.com"  # Optional
export MAX_RESULTS="5"                                # Optional
```

**Then run:**
```bash
npm run gmail:poll
```

See `LOCAL_TESTING_GMAIL_POLLER.md` for detailed instructions.

### 4. Deploy to AWS

```bash
npm run gmail:deploy
```

## Files

- `token-generator.ts` - Generate OAuth2 refresh token
- `gmail-client.ts` - Gmail API client with auto token refresh
- `poller-lambda.ts` - Lambda handler that polls every minute
- `serverless.yml` - Serverless Framework configuration

## How It Works

1. **EventBridge** triggers Lambda every 1 minute
2. Lambda queries Gmail for unread emails (`is:unread`)
3. For each email:
   - Reads full details
   - Decodes base64 body
   - Marks as read
   - Logs information
4. **Automatic token refresh** - googleapis handles expired tokens

## See Also

- `GMAIL_LAMBDA_SETUP.md` - Complete setup guide
- `GMAIL_OAUTH2_SETUP.md` - OAuth2 setup details

