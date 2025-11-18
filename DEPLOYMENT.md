# AWS Lambda Deployment Guide

This guide will help you deploy your Twilio Lambda functions to AWS.

## Prerequisites

1. **AWS Account**: You need an AWS account with appropriate permissions
2. **AWS CLI**: Install and configure AWS CLI
   ```bash
   aws configure
   ```
   You'll need:
   - AWS Access Key ID
   - AWS Secret Access Key
   - Default region (e.g., `us-east-1`)
   - Default output format (e.g., `json`)

3. **Serverless Framework**: Already installed via npm dependencies

## Step 1: Create .env File

Create a `.env` file in the root directory with your Twilio credentials:

```env
TWILIO_ACCOUNT_SID=your_twilio_account_sid_here
TWILIO_USER_SID=your_twilio_user_sid_here
TWILIO_SMS_AUTH_TOKEN=your_twilio_sms_auth_token_here
TWILIO_WHATSAPP_AUTH_TOKEN=your_twilio_whatsapp_auth_token_here
TWILIO_PHONE_NUMBER=+1234567890
TWILIO_WHATSAPP_PHONE_NUMBER=+14155238886
```

**Important**: 
- Replace all placeholder values with your actual Twilio credentials
- The `.env` file is already in `.gitignore` and will not be committed to version control
- These values will be automatically loaded by `serverless-dotenv-plugin` during deployment

## Step 2: Build the Project

```bash
npm run build
```

This compiles TypeScript to JavaScript in the `dist/` directory.

## Step 3: Deploy to AWS

```bash
npm run deploy
```

Or directly:
```bash
serverless deploy
```

This will:
1. Package your Lambda functions
2. Create/update AWS Lambda functions
3. Create/update API Gateway endpoints
4. Set environment variables from your `.env` file

## Step 4: Verify Deployment

After deployment, Serverless Framework will output the API Gateway endpoints. They will look like:
```
https://xxxxx.execute-api.us-east-1.amazonaws.com/dev/webhook
https://xxxxx.execute-api.us-east-1.amazonaws.com/dev/sms/send
https://xxxxx.execute-api.us-east-1.amazonaws.com/dev/whatsapp/send
```

## Step 5: Configure Twilio Webhooks

Update your Twilio webhook URLs to point to your deployed Lambda endpoints:

1. **SMS Webhook**: `https://your-api-gateway-url/dev/webhook/sms`
2. **WhatsApp Webhook**: `https://your-api-gateway-url/dev/webhook/whatsapp`

## Environment Variables in AWS

The environment variables from your `.env` file are automatically set in Lambda functions via the `serverless.yml` configuration. They are:
- `TWILIO_ACCOUNT_SID`
- `TWILIO_USER_SID`
- `TWILIO_SMS_AUTH_TOKEN`
- `TWILIO_WHATSAPP_AUTH_TOKEN`
- `TWILIO_PHONE_NUMBER`
- `TWILIO_WHATSAPP_PHONE_NUMBER`

## Troubleshooting

### Deployment Fails
- Check AWS credentials: `aws sts get-caller-identity`
- Verify AWS region matches `serverless.yml` (default: `us-east-1`)
- Ensure you have permissions to create Lambda functions and API Gateway

### Environment Variables Not Set
- Verify `.env` file exists in root directory
- Check that `serverless-dotenv-plugin` is in `plugins` section of `serverless.yml`
- Ensure `.env` file has no syntax errors

### Lambda Function Errors
- Check CloudWatch Logs for detailed error messages
- Verify all environment variables are set correctly
- Ensure Twilio credentials are valid

## Additional Commands

- **Deploy specific function**: `serverless deploy function -f functionName`
- **View logs**: `serverless logs -f functionName -t`
- **Remove deployment**: `serverless remove`

