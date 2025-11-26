# Local Testing Guide - Gmail Poller

Quick guide to test the Gmail poller locally before deploying to AWS Lambda.

## Quick Start

### 1. Set Environment Variables

**Option A: Create `.env` file** (recommended)

Create `.env` in project root:
```env
SENDER_EMAIL=hr-help-demo@applaudhr.com  # Optional (defaults to hr-help-demo@applaudhr.com)
MAX_RESULTS=5                                 # Optional (defaults to 5)
```

**Note:** OAuth credentials (`GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`) are automatically loaded from `client_secret.json` and `gmail_tokens.json` files. No need to set them manually!

**Option B: Export in Terminal (Optional - only if you want to override defaults)**

**Windows PowerShell:**
```powershell
$env:SENDER_EMAIL="hr-help-demo@applaudhr.com"  # Optional
$env:MAX_RESULTS="5"                                # Optional
```

**Windows CMD:**
```cmd
set SENDER_EMAIL=hr-help-demo@applaudhr.com  # Optional
set MAX_RESULTS=5                                 # Optional
```

**Linux/Mac:**
```bash
export SENDER_EMAIL="hr-help-demo@applaudhr.com"  # Optional
export MAX_RESULTS="5"                                # Optional
```

### 2. Get Your Credentials

**If you haven't generated tokens yet:**
```bash
npm run gmail:token
```

This will create `gmail_tokens.json` and print the values you need.

**To get Client ID and Secret:**
Open `client_secret.json`:
```json
{
  "installed": {
    "client_id": "YOUR_CLIENT_ID_HERE",
    "client_secret": "YOUR_CLIENT_SECRET_HERE"
  }
}
```

**To get Refresh Token:**
After running `npm run gmail:token`, check `gmail_tokens.json`:
```json
{
  "refresh_token": "YOUR_REFRESH_TOKEN_HERE"
}
```

### 3. Run the Poller

```bash
npm run gmail:poll
```

Or directly:
```bash
npx ts-node src/gmail-oauth/poller-lambda.ts
```

## Expected Output

```
Running Gmail Poller locally...

=== Gmail Poller Lambda Started ===
Event: {}
Context: { requestId: 'local-test', functionName: 'gmail-poller-local', ... }
✓ Gmail client initialized
📧 Polling Configuration:
   Sender Email: hr-help-demo@applaudhr.com
   Query: "from:hr-help-demo@applaudhr.com is:unread"
   Max Results: 5
✓ Found 2 unread email(s)

📖 Processing email 1/2 (ID: 18a1b2c3d4e5f6g7)
   From: hr-help-demo@applaudhr.com
   Subject: Test Email
   Date: Wed, 19 Nov 2025 10:00:00 +0000
   Body preview: This is a test email...
   ✓ Marked as read
   ✓ Email processed successfully

=== Gmail Poller Summary ===
   Sender Email: hr-help-demo@applaudhr.com
   Query: from:hr-help-demo@applaudhr.com is:unread
   Emails found: 2
   Emails processed: 2
   Errors: 0
   Duration: 1234ms
   Last checked: 2025-11-19T10:30:00.000Z

✅ Poller completed: { success: true, ... }
```

## Troubleshooting

### Error: "Missing Gmail OAuth2 credentials"

**Solution:** Set environment variables. Check if they're set:
```bash
# Windows PowerShell
$env:GMAIL_CLIENT_ID

# Windows CMD
echo %GMAIL_CLIENT_ID%

# Linux/Mac
echo $GMAIL_CLIENT_ID
```

### Error: "Refresh token expired or invalid"

**Solution:** Generate new tokens:
```bash
npm run gmail:token
```
Then update `GMAIL_REFRESH_TOKEN` environment variable.

### "No unread emails found"

This is normal if:
- There are no unread emails from `hr-help-demo@applaudhr.com`
- All emails have already been processed
- The sender email doesn't match exactly

**To test:** Send yourself an email from that address, then run the poller again.

### Using .env file with dotenv

If you want to use `.env` file automatically, install dotenv:
```bash
npm install dotenv
```

Then create a wrapper script or use:
```bash
npx dotenv -e .env -- npx ts-node src/gmail-oauth/poller-lambda.ts
```

## Testing Different Configurations

### Change sender email:
```bash
SENDER_EMAIL=another@email.com npm run gmail:poll
```

### Process more emails:
```bash
MAX_RESULTS=10 npm run gmail:poll
```

### Test with all environment variables:
```bash
GMAIL_CLIENT_ID="..." GMAIL_CLIENT_SECRET="..." GMAIL_REFRESH_TOKEN="..." npm run gmail:poll
```

## Continuous Polling (Optional)

To simulate Lambda's 1-minute polling, create `scripts/poll-continuous.js`:

```javascript
const { exec } = require('child_process');

function poll() {
  console.log(`\n[${new Date().toISOString()}] Polling...\n`);
  exec('npm run gmail:poll', (error, stdout, stderr) => {
    console.log(stdout);
    if (stderr) console.error(stderr);
  });
}

// Poll every 60 seconds (1 minute)
setInterval(poll, 60000);
poll(); // Run immediately
```

Run with:
```bash
node scripts/poll-continuous.js
```

## Next Steps

Once local testing works:
1. ✅ Verify all environment variables are correct
2. ✅ Test with actual emails
3. ✅ Deploy to AWS: `npm run gmail:deploy`
4. ✅ Monitor CloudWatch logs

## Quick Reference

| Command | Description |
|---------|-------------|
| `npm run gmail:token` | Generate OAuth2 refresh token |
| `npm run gmail:poll` | Run poller once locally |
| `npm run gmail:deploy` | Deploy to AWS Lambda |

