# Quick Start - AWS Deployment

## ✅ Pre-Deployment Checklist

- [x] `.env` file exists with Twilio credentials
- [x] `serverless.yml` configured for AWS
- [x] Dependencies installed (`npm install`)
- [ ] AWS CLI configured (`aws configure`)
- [ ] Project built (`npm run build`)

## 🚀 Deploy to AWS

1. **Build the project:**
   ```bash
   npm run build
   ```

2. **Deploy to AWS:**
   ```bash
   npm run deploy
   ```
   
   Or deploy to a specific stage:
   ```bash
   serverless deploy --stage prod
   ```

3. **After deployment**, you'll see API Gateway endpoints like:
   ```
   POST https://xxxxx.execute-api.us-east-1.amazonaws.com/dev/webhook
   POST https://xxxxx.execute-api.us-east-1.amazonaws.com/dev/sms/send
   POST https://xxxxx.execute-api.us-east-1.amazonaws.com/dev/whatsapp/send
   ```

## 📝 Environment Variables

Your `.env` file should contain:
- `TWILIO_ACCOUNT_SID`
- `TWILIO_USER_SID` (optional)
- `TWILIO_SMS_AUTH_TOKEN`
- `TWILIO_WHATSAPP_AUTH_TOKEN`
- `TWILIO_PHONE_NUMBER`
- `TWILIO_WHATSAPP_PHONE_NUMBER`

These are automatically loaded and set in Lambda functions during deployment.

## 🔍 Verify Deployment

Check Lambda functions in AWS Console:
- AWS Lambda → Functions → `twilio-lambda-webhook-dev-*`

View logs:
```bash
serverless logs -f webhook -t
```

## 📚 Full Documentation

See `DEPLOYMENT.md` for detailed deployment instructions.

