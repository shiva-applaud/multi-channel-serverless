# Local Testing Guide - Email Polling Function

This guide explains how to test the `webhookEmail` Lambda function locally. This function polls Gmail inbox every minute when deployed, but you can test it manually locally.

## Prerequisites

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up Google Workspace credentials:**
   - Create a service account in Google Cloud Console
   - Download the JSON key file
   - Enable Gmail API for your project
   - Grant domain-wide delegation to the service account
   - Add the service account email to Google Workspace admin console with Gmail API scopes

3. **Configure `.env` file:**
   ```env
   GOOGLE_SERVICE_ACCOUNT_KEY=./path/to/your-service-account-key.json
   GOOGLE_WORKSPACE_EMAIL=your-email@yourdomain.com
   ```

## Method 1: Using npm Script (Recommended)

### Basic Test (Default: 10 emails)
```bash
npm run test:email-poll
```

### With Custom Parameters
```bash
# Test with 20 emails
npm run test:email-poll -- --maxResults 20

# Test with query filter (e.g., unread emails)
npm run test:email-poll -- --maxResults 20 --query "is:unread"

# Test with full email body included
npm run test:email-poll -- --maxResults 5 --includeFullBody
```

### Using PowerShell Script
```powershell
# Basic test
npm run test:email-poll:ps1

# With parameters
.\scripts\test-webhookEmail-local.ps1 -MaxResults 20 -Query "is:unread"

# With full body
.\scripts\test-webhookEmail-local.ps1 -MaxResults 5 -IncludeFullBody
```

## Method 2: Direct Node.js Script

### Build First
```bash
npm run build
```

### Run the Test Script
```bash
# Basic test
node scripts/test-webhookEmail-local.js

# With custom parameters
node scripts/test-webhookEmail-local.js --maxResults 20 --query "is:unread"

# With full body
node scripts/test-webhookEmail-local.js --maxResults 5 --includeFullBody
```

## Method 3: Manual Invocation via Node.js REPL

You can also test the handler directly:

```javascript
// In Node.js REPL or a script
const { handler } = require('./dist/handlers/webhookEmail');

const mockEvent = {
  version: '0',
  id: 'test-event-id',
  'detail-type': 'Scheduled Event',
  source: 'aws.events',
  account: '123456789012',
  time: new Date().toISOString(),
  region: 'eu-central-1',
  resources: ['arn:aws:events:eu-central-1:123456789012:rule/test-rule'],
  detail: {
    maxResults: 10,
    query: 'is:unread'
  }
};

handler(mockEvent)
  .then(result => console.log('Success:', result))
  .catch(error => console.error('Error:', error));
```

## Available Query Parameters

The Gmail API supports various query filters. Examples:

- `is:unread` - Unread emails only
- `is:read` - Read emails only
- `from:example@gmail.com` - Emails from specific sender
- `subject:test` - Emails with "test" in subject
- `after:2024/1/1` - Emails after a date
- `before:2024/12/31` - Emails before a date
- `has:attachment` - Emails with attachments
- `label:important` - Emails with important label

Combine multiple filters:
```bash
node scripts/test-webhookEmail-local.js --query "is:unread from:example@gmail.com"
```

## Expected Output

When you run the test, you should see:

1. **Event Information**: Shows the mock EventBridge event structure
2. **Lambda Start Logs**: Function initialization logs
3. **Email Polling Logs**: 
   - Workspace email being polled
   - Gmail API calls
   - Emails found and processed
   - Email details (from, subject, date, etc.)
4. **Summary**: Total emails found, successfully processed, errors

Example output:
```
=== Testing webhookEmail Lambda Locally ===
EventBridge Event: { ... }

=== Gmail Polling Lambda Started ===
Event received: { eventType: 'EventBridge Scheduled Event', ... }
Retrieving workspace email from environment variable...
Workspace email retrieved: your-email@yourdomain.com
=== Polling Configuration === { email: '...', maxResults: 10, ... }
Calling Gmail API to list emails...
Gmail API listEmails completed in 234ms { emailsFound: 5, ... }
Starting to fetch full details for 5 email(s)...
Processing email 1/5 { messageId: '...', ... }
...
=== Email Processing Summary === { totalEmailsFound: 5, successfullyProcessed: 5, ... }
=== Gmail Polling Lambda Completed Successfully (Scheduled) ===
```

## Troubleshooting

### "Cannot find module '../dist/handlers/webhookEmail'"
**Solution**: Build the project first:
```bash
npm run build
```

### "GOOGLE_WORKSPACE_EMAIL must be set"
**Solution**: Make sure your `.env` file is configured correctly:
```env
GOOGLE_SERVICE_ACCOUNT_KEY=./path/to/key.json
GOOGLE_WORKSPACE_EMAIL=your-email@yourdomain.com
```

### "Failed to initialize Gmail client"
**Solution**: 
- Verify your service account JSON file path is correct
- Check that domain-wide delegation is enabled
- Ensure the service account has correct scopes in Google Workspace admin

### "Failed to list emails"
**Solution**:
- Verify Gmail API is enabled in Google Cloud Console
- Check that the service account has permission to impersonate the email address
- Ensure the service account has `gmail.readonly` scope

### No emails found
**Solution**:
- Check that emails exist in the inbox
- Try without query filter: `node scripts/test-webhookEmail-local.js`
- Verify you're checking the correct email address (check logs for `Workspace email retrieved`)

## Testing Different Scenarios

### Test with Unread Emails Only
```bash
npm run test:email-poll -- --query "is:unread"
```

### Test with Recent Emails (Last 24 hours)
```bash
npm run test:email-poll -- --query "after:$(date -d '1 day ago' +%Y/%m/%d)"
```

### Test with Full Email Body
```bash
npm run test:email-poll -- --maxResults 3 --includeFullBody
```

### Test with Specific Sender
```bash
npm run test:email-poll -- --query "from:sender@example.com"
```

## Next Steps

After local testing:
1. Deploy to AWS: `npm run deploy`
2. Check CloudWatch logs: `npx serverless logs -f webhookEmail -t`
3. Verify scheduled execution in AWS Lambda console
4. Monitor logs to see automatic polling every minute

## Notes

- The function runs every 1 minute when deployed to AWS
- Local testing simulates the EventBridge scheduled event
- All logs will appear in your terminal/console
- The function doesn't require serverless-offline to test locally
- Environment variables are loaded from `.env` file automatically

