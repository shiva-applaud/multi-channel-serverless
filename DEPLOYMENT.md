# Deployment Guide

Complete guide for deploying the Serverless Messaging & Email API to AWS Lambda.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Pre-Deployment Checklist](#pre-deployment-checklist)
- [AWS Setup](#aws-setup)
- [Environment Variables](#environment-variables)
- [Deployment Steps](#deployment-steps)
- [Post-Deployment Verification](#post-deployment-verification)
- [Updating Deployment](#updating-deployment)
- [Rollback](#rollback)
- [Troubleshooting](#troubleshooting)
- [CI/CD Integration](#cicd-integration)

## Prerequisites

Before deploying, ensure you have:

- ✅ **Node.js 20.x** or higher installed
- ✅ **AWS Account** with appropriate permissions
- ✅ **AWS CLI** configured with credentials
- ✅ **Serverless Framework** installed globally (`npm install -g serverless`)
- ✅ **Twilio Account** (for SMS/WhatsApp functionality)
- ✅ **Google Cloud Project** with Gmail API enabled (for email functionality)
- ✅ **Environment variables** configured in `.env` file

## Pre-Deployment Checklist

### 1. Verify AWS Credentials

```bash
aws configure list
```

Ensure you have:
- AWS Access Key ID
- AWS Secret Access Key
- Default region (should match `serverless.yml` region: `eu-central-1`)
- Output format (json)

### 2. Verify Environment Variables

Check that your `.env` file contains all required variables:

**Twilio (Required for SMS/WhatsApp):**
- `TWILIO_ACCOUNT_SID`
- `TWILIO_SMS_AUTH_TOKEN`
- `TWILIO_WHATSAPP_AUTH_TOKEN`
- `TWILIO_PHONE_NUMBER`
- `TWILIO_WHATSAPP_PHONE_NUMBER`

**Google Workspace (Required for Email):**
- `GOOGLE_SERVICE_ACCOUNT_KEY` (JSON string for Lambda)
- `GOOGLE_WORKSPACE_EMAIL`

**Important:** For AWS Lambda, `GOOGLE_SERVICE_ACCOUNT_KEY` must be a JSON string, not a file path.

### 3. Build the Project

```bash
npm install
npm run build
```

Verify that the `dist/` directory was created with compiled JavaScript files.

### 4. Test Locally

Before deploying, test locally:

```bash
npm run start
```

Test endpoints to ensure everything works:
- `POST http://localhost:3000/sms/send`
- `POST http://localhost:3000/email/send`

## AWS Setup

### Required AWS Permissions

Your AWS credentials need permissions for:

- **Lambda**: Create, update, delete functions
- **API Gateway**: Create, update, delete APIs and resources
- **IAM**: Create and manage roles
- **CloudFormation**: Create and manage stacks
- **CloudWatch Logs**: Create log groups
- **S3**: (Optional) For deployment packages

### IAM Policy Example

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "lambda:*",
        "apigateway:*",
        "iam:CreateRole",
        "iam:DeleteRole",
        "iam:GetRole",
        "iam:PassRole",
        "iam:AttachRolePolicy",
        "iam:DetachRolePolicy",
        "cloudformation:*",
        "logs:*",
        "s3:*"
      ],
      "Resource": "*"
    }
  ]
}
```

## Environment Variables

### For AWS Lambda Deployment

Environment variables are automatically loaded from your `.env` file by the `serverless-dotenv-plugin`.

**Important Notes:**

1. **GOOGLE_SERVICE_ACCOUNT_KEY** must be a JSON string in Lambda:
   ```env
   GOOGLE_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"...","private_key":"..."}
   ```
   
   To convert JSON file to string (Windows PowerShell):
   ```powershell
   $json = Get-Content -Path "./credentials/service-account.json" -Raw
   $json.Replace('"', '\"').Replace("`n", "").Replace("`r", "")
   ```

2. **Never commit `.env` file** to version control
3. **Use AWS Secrets Manager** or **Parameter Store** for production secrets

### Using AWS Secrets Manager (Recommended for Production)

1. **Store secrets in AWS Secrets Manager:**
   ```bash
   aws secretsmanager create-secret \
     --name serverless-messaging/secrets \
     --secret-string file://secrets.json
   ```

2. **Update `serverless.yml`** to reference secrets:
   ```yaml
   environment:
     TWILIO_ACCOUNT_SID: ${ssm:/aws/reference/secretsmanager/serverless-messaging/secrets~true:TWILIO_ACCOUNT_SID}
   ```

## Deployment Steps

### Step 1: Install Dependencies

```bash
npm install
```

### Step 2: Build the Project

```bash
npm run build
```

This compiles TypeScript to JavaScript in the `dist/` directory.

### Step 3: Deploy to AWS

**Deploy to default stage (dev):**
```bash
npm run deploy
```

**Deploy to specific stage:**
```bash
npx serverless deploy --stage prod
```

**Deploy specific function only:**
```bash
npx serverless deploy function -f sendEmail
```

**Deploy with verbose output:**
```bash
npx serverless deploy --verbose
```

### Step 4: Verify Deployment

After deployment, you'll see output like:

```
Service Information
service: twilio-lambda-webhook
stage: dev
region: eu-central-1
stack: twilio-lambda-webhook-dev
resources: 42
api keys:
  None
endpoints:
  POST - https://xxxxx.execute-api.eu-central-1.amazonaws.com/dev/webhook
  POST - https://xxxxx.execute-api.eu-central-1.amazonaws.com/dev/sms/send
  POST - https://xxxxx.execute-api.eu-central-1.amazonaws.com/dev/email/send
  ...
functions:
  webhook: twilio-lambda-webhook-dev-webhook
  sendSms: twilio-lambda-webhook-dev-sendSms
  sendEmail: twilio-lambda-webhook-dev-sendEmail
  ...
```

**Save these endpoints** - you'll need them for:
- Configuring Twilio webhooks
- Configuring Google Cloud Pub/Sub subscriptions
- Testing your API

## Post-Deployment Verification

### 1. Get Deployment Information

```bash
npx serverless info
```

This shows all endpoints, function names, and resource information.

### 2. Test Endpoints

**Test SMS endpoint:**
```bash
curl -X POST https://YOUR_API_GATEWAY_URL/dev/sms/send \
  -H "Content-Type: application/json" \
  -d '{"to": "+1234567890", "message": "Test SMS"}'
```

**Test Email endpoint:**
```bash
curl -X POST https://YOUR_API_GATEWAY_URL/dev/email/send \
  -H "Content-Type: application/json" \
  -d '{"to": "test@example.com", "subject": "Test", "body": "Test email"}'
```

### 3. Check Lambda Logs

```bash
# View logs for a specific function
npx serverless logs -f sendEmail -t

# View logs for webhook
npx serverless logs -f webhookEmail -t

# View logs with filter
npx serverless logs -f sendEmail --filter "error" -t
```

### 4. Verify in AWS Console

1. **Lambda Functions:**
   - Go to AWS Console → Lambda
   - Verify all functions are deployed
   - Check environment variables are set correctly

2. **API Gateway:**
   - Go to AWS Console → API Gateway
   - Verify API is created
   - Check endpoints are configured
   - Test endpoints using the API Gateway console

3. **CloudWatch Logs:**
   - Go to AWS Console → CloudWatch → Log Groups
   - Verify log groups are created
   - Check for any errors

### 5. Configure Webhooks

**Twilio Webhooks:**
1. Go to Twilio Console → Phone Numbers
2. Configure webhook URLs:
   - SMS: `https://YOUR_API_GATEWAY_URL/dev/webhook/sms`
   - WhatsApp: `https://YOUR_API_GATEWAY_URL/dev/webhook/whatsapp`

**Google Cloud Pub/Sub:**
1. Update Pub/Sub subscription push endpoint:
   ```
   https://YOUR_API_GATEWAY_URL/dev/webhook/email
   ```

## Updating Deployment

### Update All Functions

```bash
npm run build
npm run deploy
```

### Update Specific Function

```bash
npx serverless deploy function -f sendEmail
```

### Update Environment Variables

1. **Update `.env` file**
2. **Redeploy:**
   ```bash
   npm run deploy
   ```

Or update via AWS Console:
1. Go to Lambda → Function → Configuration → Environment variables
2. Edit variables
3. Save (no redeployment needed)

### Update Code Only (Faster)

If you only changed code (not configuration):

```bash
npm run build
npx serverless deploy function -f FUNCTION_NAME
```

## Rollback

### Rollback to Previous Version

```bash
# List previous deployments
npx serverless deploy list

# Rollback to specific version
npx serverless rollback --timestamp TIMESTAMP
```

### Manual Rollback

1. **Revert code changes:**
   ```bash
   git checkout PREVIOUS_COMMIT
   ```

2. **Redeploy:**
   ```bash
   npm run build
   npm run deploy
   ```

### Remove Deployment

**Remove entire stack:**
```bash
npx serverless remove
```

**Remove specific function:**
```bash
npx serverless remove function -f FUNCTION_NAME
```

**Warning:** This will delete all resources including API Gateway, Lambda functions, and CloudWatch logs.

## Troubleshooting

### Common Deployment Issues

#### 1. "Access Denied" Errors

**Problem:** AWS credentials don't have sufficient permissions.

**Solution:**
- Verify AWS credentials: `aws configure list`
- Check IAM permissions
- Ensure you have Lambda, API Gateway, and IAM permissions

#### 2. "Module not found" Errors

**Problem:** Dependencies not installed or build failed.

**Solution:**
```bash
rm -rf node_modules dist
npm install
npm run build
npm run deploy
```

#### 3. Environment Variables Not Set

**Problem:** Environment variables missing in Lambda.

**Solution:**
- Verify `.env` file exists and contains all variables
- Check `serverless-dotenv-plugin` is installed
- Verify variables in AWS Console → Lambda → Configuration → Environment variables

#### 4. "Timeout" Errors

**Problem:** Function timeout (default: 30 seconds).

**Solution:**
Update timeout in `serverless.yml`:
```yaml
provider:
  timeout: 60  # Increase timeout
```

#### 5. "Memory" Errors

**Problem:** Function running out of memory.

**Solution:**
Increase memory in `serverless.yml`:
```yaml
provider:
  memorySize: 512  # Increase from 256
```

#### 6. API Gateway CORS Issues

**Problem:** CORS errors when calling API.

**Solution:**
- Verify `cors: true` is set in `serverless.yml`
- Check API Gateway CORS configuration in AWS Console
- Ensure preflight OPTIONS requests are handled

### Debugging Tips

1. **Enable verbose logging:**
   ```bash
   npx serverless deploy --verbose
   ```

2. **Check CloudWatch Logs:**
   ```bash
   npx serverless logs -f FUNCTION_NAME -t
   ```

3. **Test locally first:**
   ```bash
   npm run start
   # Test endpoints locally before deploying
   ```

4. **Check AWS CloudFormation:**
   - Go to AWS Console → CloudFormation
   - Check stack events for errors
   - Review stack resources

## CI/CD Integration

### GitHub Actions Example

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to AWS

on:
  push:
    branches:
      - main

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: npm install
      
      - name: Build
        run: npm run build
      
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: eu-central-1
      
      - name: Install Serverless Framework
        run: npm install -g serverless
      
      - name: Deploy
        run: npm run deploy
        env:
          TWILIO_ACCOUNT_SID: ${{ secrets.TWILIO_ACCOUNT_SID }}
          TWILIO_SMS_AUTH_TOKEN: ${{ secrets.TWILIO_SMS_AUTH_TOKEN }}
          GOOGLE_SERVICE_ACCOUNT_KEY: ${{ secrets.GOOGLE_SERVICE_ACCOUNT_KEY }}
          GOOGLE_WORKSPACE_EMAIL: ${{ secrets.GOOGLE_WORKSPACE_EMAIL }}
```

### Environment-Specific Deployments

**Development:**
```bash
npx serverless deploy --stage dev
```

**Staging:**
```bash
npx serverless deploy --stage staging
```

**Production:**
```bash
npx serverless deploy --stage prod
```

Use different `.env` files or environment variables for each stage.

## Best Practices

1. **Use AWS Secrets Manager** for production secrets
2. **Enable CloudWatch Logs** retention policies
3. **Set up CloudWatch Alarms** for errors
4. **Use separate AWS accounts** for dev/staging/prod
5. **Tag resources** for cost tracking
6. **Monitor costs** using AWS Cost Explorer
7. **Set up API Gateway throttling** to prevent abuse
8. **Enable API Gateway request validation**
9. **Use VPC** for Lambda if accessing private resources
10. **Regularly update dependencies** for security patches

## Cost Optimization

- **Lambda:** Pay per request and compute time
- **API Gateway:** Pay per API call
- **CloudWatch Logs:** Pay for log storage and ingestion

**Tips:**
- Use appropriate memory sizes (not too high)
- Set reasonable timeouts
- Enable log retention policies
- Use API Gateway caching where possible
- Monitor and optimize cold starts

## Security Considerations

1. **Never commit `.env` files**
2. **Use AWS Secrets Manager** for sensitive data
3. **Enable API Gateway authentication** if needed
4. **Use VPC** for Lambda if accessing private resources
5. **Enable CloudTrail** for audit logging
6. **Regularly rotate credentials**
7. **Use least privilege IAM policies**
8. **Enable AWS WAF** for API Gateway protection

## Additional Resources

- [Serverless Framework Documentation](https://www.serverless.com/framework/docs)
- [AWS Lambda Documentation](https://docs.aws.amazon.com/lambda/)
- [API Gateway Documentation](https://docs.aws.amazon.com/apigateway/)
- [AWS CloudFormation Documentation](https://docs.aws.amazon.com/cloudformation/)

## Support

If you encounter issues:
1. Check CloudWatch Logs for errors
2. Review AWS CloudFormation stack events
3. Verify environment variables are set correctly
4. Test endpoints locally before deploying
5. Check AWS service health status

