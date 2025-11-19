# Gmail OAuth2 Integration Setup Guide

Complete guide for setting up Gmail OAuth2 integration for personal Gmail accounts.

## Prerequisites

1. **Node.js** (v18 or higher)
2. **Google Cloud Project** with Gmail API enabled
3. **OAuth 2.0 Client ID** (Desktop App type)

## Step 1: Create Google Cloud Project & OAuth Credentials

### 1.1 Create Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click **Create Project** or select an existing project
3. Note your project name

### 1.2 Enable Gmail API

1. Go to [API Library](https://console.cloud.google.com/apis/library)
2. Search for **Gmail API**
3. Click **Enable**

### 1.3 Create OAuth 2.0 Credentials

1. Go to [Credentials](https://console.cloud.google.com/apis/credentials)
2. Click **Create Credentials** → **OAuth client ID**
3. If prompted, configure OAuth consent screen:
   - User Type: **External** (for personal use) or **Internal** (for Google Workspace)
   - App name: Your app name
   - User support email: Your email
   - Developer contact: Your email
   - Click **Save and Continue**
   - Scopes: Click **Add or Remove Scopes**, search and add:
     - `https://www.googleapis.com/auth/gmail.send`
     - `https://www.googleapis.com/auth/gmail.readonly`
   - Click **Save and Continue**
   - Test users: Add your Gmail address
   - Click **Save and Continue**
4. Application type: **Desktop app**
5. Name: `Gmail OAuth2 Client`
6. Click **Create**
7. Click **Download JSON**
8. Save the file as `client_secret.json` in your project root

## Step 2: Install Dependencies

```bash
npm install googleapis
npm install --save-dev @types/node typescript ts-node
```

## Step 3: Generate Tokens

Run the token generator script:

```bash
npx ts-node src/gmail-oauth/token-generator.ts
```

This will:
1. Load your `client_secret.json`
2. Open a browser/URL for authorization
3. Ask you to paste the authorization code
4. Generate and save `gmail_tokens.json` with:
   - `access_token`
   - `refresh_token`
   - `expiry_date`

**Important**: The `refresh_token` is long-lived and can be used to get new access tokens. Keep it secure!

## Step 4: File Structure

Your project should have:

```
project-root/
├── client_secret.json          # OAuth credentials (from Google Cloud Console)
├── gmail_tokens.json           # Generated tokens (created by token-generator.ts)
├── src/
│   └── gmail-oauth/
│       ├── token-generator.ts  # Token generation script
│       ├── gmail-client.ts     # Gmail client module
│       ├── test-send.ts        # Send email demo
│       └── test-read.ts        # Read email demo
└── package.json
```

## Step 5: Test the Integration

### Test Sending Emails

```bash
npx ts-node src/gmail-oauth/test-send.ts
```

**Note**: Update the recipient email addresses in `test-send.ts` before running.

### Test Reading Emails

```bash
npx ts-node src/gmail-oauth/test-read.ts
```

## Usage in Your Code

### Basic Usage

```typescript
import { GmailClient } from './src/gmail-oauth/gmail-client';

const client = new GmailClient();

// Send email
const messageId = await client.sendEmail(
  'recipient@example.com',
  'Subject',
  'Email body'
);

// List emails
const emails = await client.listEmails('is:unread', 10);

// Read email
const email = await client.readEmail(messageId);
const headers = client.getEmailHeaders(email);
const body = client.getEmailBody(email);
```

### Advanced Usage

```typescript
// Send HTML email
await client.sendEmail(
  'recipient@example.com',
  'HTML Email',
  '<h1>Hello</h1><p>This is HTML</p>',
  { html: true }
);

// Send with CC and BCC
await client.sendEmail(
  'recipient@example.com',
  'Subject',
  'Body',
  {
    cc: 'cc@example.com',
    bcc: 'bcc@example.com',
  }
);

// Send to multiple recipients
await client.sendEmail(
  ['user1@example.com', 'user2@example.com'],
  'Subject',
  'Body'
);

// Search emails
const unreadEmails = await client.listEmails('is:unread', 20);
const fromSender = await client.listEmails('from:sender@example.com', 10);
const withAttachments = await client.listEmails('has:attachment', 5);
```

## Gmail Search Query Examples

- `is:unread` - Unread emails
- `is:read` - Read emails
- `from:example@gmail.com` - Emails from specific sender
- `to:example@gmail.com` - Emails to specific recipient
- `subject:test` - Emails with "test" in subject
- `has:attachment` - Emails with attachments
- `after:2024/1/1` - Emails after date
- `before:2024/12/31` - Emails before date
- `label:important` - Emails with important label
- Combine: `is:unread from:example@gmail.com has:attachment`

## Token Refresh

The `GmailClient` automatically handles token refresh:
- Checks if token is expired before each API call
- Refreshes token using `refresh_token` if needed
- Updates `gmail_tokens.json` with new tokens

**No manual intervention needed!**

## Production Considerations

### Security

1. **Never commit** `client_secret.json` or `gmail_tokens.json` to version control
2. Add to `.gitignore`:
   ```
   client_secret.json
   gmail_tokens.json
   ```
3. Use environment variables or secure storage for production
4. Rotate credentials if compromised

### Environment Variables (Recommended)

For production, use environment variables:

```typescript
// Load from environment
const credentials = {
  installed: {
    client_id: process.env.GMAIL_CLIENT_ID,
    client_secret: process.env.GMAIL_CLIENT_SECRET,
    redirect_uris: ['http://localhost'],
  },
};
```

### Error Handling

The client throws errors for:
- Missing credentials
- Invalid tokens
- API errors
- Network errors

Always wrap calls in try-catch:

```typescript
try {
  await client.sendEmail(...);
} catch (error) {
  console.error('Failed to send email:', error);
  // Handle error
}
```

## Troubleshooting

### "Token file not found"

Run `token-generator.ts` first to generate tokens.

### "Credentials file not found"

Download `client_secret.json` from Google Cloud Console and place in project root.

### "Invalid grant" error

Your refresh token may have expired or been revoked. Run `token-generator.ts` again to get new tokens.

### "Access denied" error

1. Check OAuth consent screen is configured
2. Verify scopes are added in consent screen
3. Add your email as a test user (if app is in testing mode)
4. Wait for app verification (if app is in production)

### Token expires frequently

- Access tokens expire after 1 hour
- Refresh tokens are long-lived but can be revoked
- The client automatically refreshes tokens - no action needed

## API Limits

- **Quota**: Gmail API has daily quotas
- **Rate Limits**: 250 quota units per user per second
- **Sending**: ~500-2000 emails per day (varies by account)

## Additional Resources

- [Gmail API Documentation](https://developers.google.com/gmail/api)
- [OAuth 2.0 for Desktop Apps](https://developers.google.com/identity/protocols/oauth2/native-app)
- [Gmail API Scopes](https://developers.google.com/gmail/api/auth/scopes)

## Support

For issues:
1. Check error messages - they're descriptive
2. Verify credentials and tokens are correct
3. Check Google Cloud Console for API status
4. Review Gmail API documentation

