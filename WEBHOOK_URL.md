# Gmail Webhook URL Configuration

## Your Webhook Endpoint

Based on your `serverless.yml` configuration:

### Local Development
```
http://localhost:3000/webhook/email
```

### AWS Lambda (Production)

Your production webhook URL follows this format:
```
https://{api-id}.execute-api.eu-central-1.amazonaws.com/dev/webhook/email
```

## How to Get Your Production URL

### Option 1: Using Serverless CLI
```bash
npx serverless info
```

Look for the `webhookEmail` function endpoint in the output.

### Option 2: Check AWS Console
1. Go to AWS Console → API Gateway
2. Find your API (service name: `twilio-lambda-webhook`)
3. Navigate to Stages → `dev`
4. Find the `/webhook/email` endpoint
5. Copy the Invoke URL

### Option 3: After Deployment
After running `npm run deploy`, the output will show all endpoints including:
```
POST - https://xxxxx.execute-api.eu-central-1.amazonaws.com/dev/webhook/email
```

## For Pub/Sub Configuration

When setting up your Google Cloud Pub/Sub subscription, use:

**Local Testing (with ngrok):**
```
https://your-ngrok-url.ngrok.io/webhook/email
```

**Production:**
```
https://{your-api-gateway-id}.execute-api.eu-central-1.amazonaws.com/dev/webhook/email
```

## Quick Test

Test your webhook locally:
```bash
curl -X POST http://localhost:3000/webhook/email \
  -H "Content-Type: application/json" \
  -d '{"test": "direct call"}'
```

Or using PowerShell:
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/webhook/email" `
    -Method POST `
    -ContentType "application/json" `
    -Body '{"test": "direct call"}'
```

## Configuration Summary

From `serverless.yml`:
- **Function**: `webhookEmail`
- **Path**: `/webhook/email`
- **Method**: `POST`
- **Region**: `eu-central-1`
- **Stage**: `dev` (default)

