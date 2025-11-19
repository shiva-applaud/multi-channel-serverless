# Running Gmail Poller Locally

Guide for testing the Gmail poller on your local machine before deploying to AWS Lambda.

## Prerequisites

1. **Generate OAuth tokens** (if not done already):
   ```bash
   npm run gmail:token
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

## Method 1: Using npm Script (Recommended)

### Step 1: Set Environment Variables

Create a `.env` file in the project root (or export them in your terminal):

```env
SENDER_EMAIL=shiva.prabhakar@applaudhr.com  # Optional (defaults to shiva.prabhakar@applaudhr.com)
MAX_RESULTS=5                                 # Optional (defaults to 5)
```

**Note:** OAuth credentials are automatically loaded from `client_secret.json` and `gmail_tokens.json` files. No need to set them manually!

**Or export in terminal (Optional - only to override defaults):**

**Windows PowerShell:**
```powershell
$env:SENDER_EMAIL="shiva.prabhakar@applaudhr.com"  # Optional
$env:MAX_RESULTS="5"                                # Optional
```

**Windows CMD:**
```cmd
set SENDER_EMAIL=shiva.prabhakar@applaudhr.com  # Optional
set MAX_RESULTS=5                                 # Optional
```

**Linux/Mac:**
```bash
export SENDER_EMAIL="shiva.prabhakar@applaudhr.com"  # Optional
export MAX_RESULTS="5"                                # Optional
```

### Step 2: Run the Poller

```bash
npm run gmail:poll
```

This will:
- Run the poller once
- Query Gmail for unread emails from the specified sender
- Process and mark emails as read
- Display results in the console

## Method 2: Direct TypeScript Execution

```bash
npx ts-node src/gmail-oauth/poller-lambda.ts
```

## Method 3: Using dotenv (if you have .env file)

If you have `dotenv` installed and a `.env` file:

```bash
npx dotenv -e .env -- npx ts-node src/gmail-oauth/poller-lambda.ts
```

## Expected Output

```
Running Gmail Poller locally...

=== Gmail Poller Lambda Started ===
Event: {}
Context: { requestId: 'local-test', functionName: 'gmail-poller-local', ... }
✓ Gmail client initialized
📧 Polling Configuration:
   Sender Email: shiva.prabhakar@applaudhr.com
   Query: "from:shiva.prabhakar@applaudhr.com is:unread"
   Max Results: 5
✓ Found 2 unread email(s)

📖 Processing email 1/2 (ID: 18a1b2c3d4e5f6g7)
   From: shiva.prabhakar@applaudhr.com
   Subject: Test Email
   Date: Wed, 19 Nov 2025 10:00:00 +0000
   Body preview: This is a test email...
   ✓ Marked as read
   ✓ Email processed successfully

=== Gmail Poller Summary ===
   Sender Email: shiva.prabhakar@applaudhr.com
   Query: from:shiva.prabhakar@applaudhr.com is:unread
   Emails found: 2
   Emails processed: 2
   Errors: 0
   Duration: 1234ms
   Last checked: 2025-11-19T10:30:00.000Z

✅ Poller completed: { success: true, ... }
```

## Troubleshooting

### "Missing Gmail OAuth2 credentials"

Make sure environment variables are set:
```bash
# Check if variables are set
echo $GMAIL_CLIENT_ID  # Linux/Mac
echo %GMAIL_CLIENT_ID%  # Windows CMD
$env:GMAIL_CLIENT_ID    # Windows PowerShell
```

### "Refresh token expired or invalid"

Run token generator again:
```bash
npm run gmail:token
```

Then update your `GMAIL_REFRESH_TOKEN` environment variable.

### "No unread emails found"

This is normal if:
- There are no unread emails from the specified sender
- All emails have already been processed
- The sender email doesn't match exactly

### Getting Client ID and Secret

From `client_secret.json`:
```json
{
  "installed": {
    "client_id": "your_client_id_here",
    "client_secret": "your_client_secret_here"
  }
}
```

Or from `gmail_tokens.json` (after running token generator):
- The token generator prints these values at the end

## Continuous Polling (Optional)

To poll continuously like the Lambda would, create a simple loop script:

**`scripts/poll-continuous.js`:**
```javascript
const { exec } = require('child_process');

function poll() {
  console.log(`\n[${new Date().toISOString()}] Running poller...\n`);
  exec('npm run gmail:poll', (error, stdout, stderr) => {
    if (error) {
      console.error(`Error: ${error.message}`);
      return;
    }
    console.log(stdout);
    if (stderr) console.error(stderr);
  });
}

// Poll every 10 seconds (adjust as needed)
setInterval(poll, 10000);
poll(); // Run immediately
```

Run with:
```bash
node scripts/poll-continuous.js
```

## Testing Different Configurations

### Test with different sender:
```bash
SENDER_EMAIL=another@email.com npm run gmail:poll
```

### Test with more results:
```bash
MAX_RESULTS=10 npm run gmail:poll
```

### Test with different query (modify code):
Edit `poller-lambda.ts` line 80 to change the query:
```typescript
const query = `from:${senderEmail} is:unread newer_than:1d`;
```

## Next Steps

After local testing works:
1. Deploy to AWS Lambda: `npm run gmail:deploy`
2. Monitor CloudWatch logs
3. Verify EventBridge schedule is running

