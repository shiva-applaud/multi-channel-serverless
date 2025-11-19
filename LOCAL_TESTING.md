# Local Testing Guide - Email Functionality

This guide explains how to test the email functionality locally using serverless-offline.

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

## Environment Setup

### Option 1: Using JSON File Path (Recommended for Local Testing)

In your `.env` file, set the path to your service account JSON file:

```env
GOOGLE_SERVICE_ACCOUNT_KEY=./path/to/your-service-account-key.json
GOOGLE_WORKSPACE_EMAIL=your-email@yourdomain.com
```

**Example:**
```env
GOOGLE_SERVICE_ACCOUNT_KEY=./credentials/google-service-account.json
GOOGLE_WORKSPACE_EMAIL=test@yourdomain.com
```

### Option 2: Using JSON String

You can also provide the JSON content as a string (escape quotes properly):

```env
GOOGLE_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"...","private_key":"..."}
GOOGLE_WORKSPACE_EMAIL=your-email@yourdomain.com
```

**Note:** For local testing, using a file path is easier and more secure.

## Starting the Local Server

1. **Build the project:**
   ```bash
   npm run build
   ```

2. **Start serverless offline:**
   ```bash
   npm run start
   ```
   
   Or use the direct command:
   ```bash
   npm run local:direct
   ```

3. **Server will start on:**
   ```
   http://localhost:3000
   ```

## Testing Send Email Endpoint

### Using cURL

**Send a simple text email:**
```bash
curl -X POST http://localhost:3000/email/send \
  -H "Content-Type: application/json" \
  -d '{
    "to": "recipient@example.com",
    "subject": "Test Email from Local Server",
    "body": "This is a test email sent from the local serverless offline environment."
  }'
```

**Send an HTML email:**
```bash
curl -X POST http://localhost:3000/email/send \
  -H "Content-Type: application/json" \
  -d '{
    "to": "recipient@example.com",
    "subject": "HTML Test Email",
    "body": "<h1>Hello!</h1><p>This is an <strong>HTML</strong> email.</p>",
    "html": true
  }'
```

**Send email with CC and BCC:**
```bash
curl -X POST http://localhost:3000/email/send \
  -H "Content-Type: application/json" \
  -d '{
    "to": "recipient@example.com",
    "cc": ["cc@example.com"],
    "bcc": ["bcc@example.com"],
    "subject": "Email with CC and BCC",
    "body": "This email has CC and BCC recipients."
  }'
```

**Send email to multiple recipients:**
```bash
curl -X POST http://localhost:3000/email/send \
  -H "Content-Type: application/json" \
  -d '{
    "to": ["recipient1@example.com", "recipient2@example.com"],
    "subject": "Email to Multiple Recipients",
    "body": "This email is sent to multiple recipients."
  }'
```

**Send email with attachment:**
```bash
# First, encode your file to base64
# On Windows PowerShell:
$content = [Convert]::ToBase64String([IO.File]::ReadAllBytes("path/to/file.pdf"))

# Then send the email:
curl -X POST http://localhost:3000/email/send \
  -H "Content-Type: application/json" \
  -d "{
    \"to\": \"recipient@example.com\",
    \"subject\": \"Email with Attachment\",
    \"body\": \"Please find the attached file.\",
    \"attachments\": [{
      \"filename\": \"document.pdf\",
      \"content\": \"$content\",
      \"contentType\": \"application/pdf\"
    }]
  }"
```

### Using PowerShell (Windows)

**Send a simple email:**
```powershell
$body = @{
    to = "recipient@example.com"
    subject = "Test Email from Local Server"
    body = "This is a test email sent from the local serverless offline environment."
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/email/send" `
    -Method POST `
    -ContentType "application/json" `
    -Body $body
```

**Send an HTML email:**
```powershell
$body = @{
    to = "recipient@example.com"
    subject = "HTML Test Email"
    body = "<h1>Hello!</h1><p>This is an <strong>HTML</strong> email.</p>"
    html = $true
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/email/send" `
    -Method POST `
    -ContentType "application/json" `
    -Body $body
```

### Expected Response

**Success:**
```json
{
  "success": true,
  "messageId": "1234567890abcdef"
}
```

**Error:**
```json
{
  "success": false,
  "error": "Error message here"
}
```

## Testing Email Webhook Endpoint

The email webhook receives Gmail Push notifications via Google Cloud Pub/Sub. For local testing, you can simulate the Pub/Sub message format.

### Simulating Gmail Push Notification

**Using cURL:**
```bash
curl -X POST http://localhost:3000/webhook/email \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "data": "eyJlbWFpbEFkZHJlc3MiOiJ0ZXN0QGV4YW1wbGUuY29tIiwiaGlzdG9yeUlkIjoiMTIzNDU2Nzg5MCJ9",
      "messageId": "test-message-id",
      "publishTime": "2024-01-01T00:00:00Z"
    },
    "subscription": "projects/test-project/subscriptions/test-subscription"
  }'
```

**Note:** The `data` field should be base64-encoded JSON. To create it:

```bash
# Create the payload
echo '{"emailAddress":"test@example.com","historyId":"1234567890"}' | base64
```

### Direct Webhook Call (Alternative)

The webhook handler also supports direct calls for testing:

```bash
curl -X POST http://localhost:3000/webhook/email \
  -H "Content-Type: application/json" \
  -d '{
    "test": "direct webhook call"
  }'
```

This will fetch and log recent emails instead of processing a push notification.

## Troubleshooting

### Common Issues

1. **"GOOGLE_SERVICE_ACCOUNT_KEY must be set"**
   - Make sure your `.env` file exists and contains `GOOGLE_SERVICE_ACCOUNT_KEY`
   - Check that the file path is correct (relative to project root)
   - Ensure the JSON file is valid

2. **"Failed to initialize Gmail client"**
   - Verify your service account JSON file is valid
   - Check that domain-wide delegation is enabled
   - Ensure the service account has the correct scopes in Google Workspace admin

3. **"Failed to send email"**
   - Verify `GOOGLE_WORKSPACE_EMAIL` is set correctly
   - Check that the service account has permission to impersonate the email address
   - Ensure Gmail API is enabled in Google Cloud Console

4. **Port already in use**
   - The default port is 3000. Change it in `serverless.yml` if needed:
     ```yaml
     custom:
       serverless-offline:
         httpPort: 3001
     ```

### Debugging Tips

1. **Check server logs:**
   - The serverless-offline console will show request/response logs
   - Look for error messages in the console output

2. **Verify environment variables:**
   ```bash
   # Check if variables are loaded (Windows PowerShell)
   Get-Content .env
   ```

3. **Test Gmail API connection:**
   - You can add a test endpoint or use the webhook endpoint to verify connectivity
   - Check Google Cloud Console logs for API errors

## Example Test Script

Create a file `test-email.ps1`:

```powershell
# Test Email Sending
Write-Host "Testing email send endpoint..." -ForegroundColor Green

$emailBody = @{
    to = "your-email@example.com"
    subject = "Local Test Email"
    body = "This is a test email from local serverless offline."
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "http://localhost:3000/email/send" `
        -Method POST `
        -ContentType "application/json" `
        -Body $emailBody
    
    Write-Host "Success!" -ForegroundColor Green
    Write-Host ($response | ConvertTo-Json -Depth 10)
} catch {
    Write-Host "Error:" -ForegroundColor Red
    Write-Host $_.Exception.Message
}
```

Run it:
```powershell
.\test-email.ps1
```

## Next Steps

- Test with real email addresses
- Verify emails are received correctly
- Test different email formats (HTML, attachments, etc.)
- Set up Gmail Push notifications for production webhook testing

