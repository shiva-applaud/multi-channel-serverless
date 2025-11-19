# Serverless Messaging & Email API

AWS Lambda functions for handling Twilio webhooks (SMS/WhatsApp) and Google Workspace email integration. Built with Serverless Framework, TypeScript, and Node.js.

## Features

- 📱 **SMS Messaging** - Send and receive SMS via Twilio
- 💬 **WhatsApp Messaging** - Send and receive WhatsApp messages via Twilio
- 📧 **Email Integration** - Send emails via Google Workspace Gmail API
- 🔔 **Email Webhooks** - Receive real-time email notifications via Gmail Push notifications
- 📬 **Gmail OAuth2 Poller** - Poll personal Gmail inbox every minute with OAuth2 authentication
- 🚀 **Serverless** - Deploy to AWS Lambda with API Gateway
- 🔧 **TypeScript** - Fully typed codebase
- 🏠 **Local Development** - Test locally with serverless-offline

## Prerequisites

- Node.js 20.x or higher
- AWS Account with configured credentials
- Twilio Account (for SMS/WhatsApp)
- Google Cloud Project with Gmail API enabled (for email)
- Google Workspace Account (for email)

## Installation

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd serverless
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment variables:**
   ```bash
   cp env.template .env
   ```
   
   Edit `.env` and add your credentials (see Configuration section below).

4. **Build the project:**
   ```bash
   npm run build
   ```

## Configuration

### Twilio Configuration

Create a `.env` file with your Twilio credentials:

```env
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_SMS_AUTH_TOKEN=your_sms_auth_token
TWILIO_WHATSAPP_AUTH_TOKEN=your_whatsapp_auth_token
TWILIO_PHONE_NUMBER=+1234567890
TWILIO_WHATSAPP_PHONE_NUMBER=+14155238886
```

### Google Workspace Configuration

For email functionality, configure Google Workspace:

```env
GOOGLE_SERVICE_ACCOUNT_KEY=./path/to/service-account-key.json
GOOGLE_WORKSPACE_EMAIL=your-email@yourdomain.com
```

**Setup Steps:**
1. Create a service account in Google Cloud Console
2. Enable Gmail API for your project
3. Grant domain-wide delegation to the service account
4. Add the service account email to Google Workspace admin console with Gmail API scopes
5. Download the JSON key file and set the path in `.env`

**Note:** For local development, you can use a file path. For AWS Lambda, provide the JSON content as a string.

## API Endpoints

### SMS Endpoints

#### Send SMS
**POST** `/sms/send`

```json
{
  "to": "+1234567890",
  "message": "Hello, this is a test SMS",
  "from": "+1234567890" // Optional
}
```

#### Receive SMS Webhook
**POST** `/webhook/sms`

Configure this URL in Twilio Console → Phone Numbers → Messaging → A MESSAGE COMES IN

### WhatsApp Endpoints

#### Send WhatsApp Message
**POST** `/whatsapp/send`

```json
{
  "to": "+1234567890",
  "message": "Hello, this is a test WhatsApp message",
  "from": "whatsapp:+14155238886" // Optional
}
```

#### Receive WhatsApp Webhook
**POST** `/webhook/whatsapp`

Configure this URL in Twilio Console → Messaging → Try it out → Send a WhatsApp message → Webhook URL

### Email Endpoints

#### Send Email
**POST** `/email/send`

```json
{
  "to": "recipient@example.com",
  "subject": "Test Email",
  "body": "This is a test email",
  "from": "sender@yourdomain.com", // Optional
  "cc": ["cc@example.com"], // Optional
  "bcc": ["bcc@example.com"], // Optional
  "html": false, // Optional, set to true for HTML emails
  "attachments": [ // Optional
    {
      "filename": "document.pdf",
      "content": "base64EncodedContent",
      "contentType": "application/pdf"
    }
  ]
}
```

#### Receive Email Webhook
**POST** `/webhook/email`

Receives Gmail Push notifications via Google Cloud Pub/Sub when new emails arrive.

**Setup Required:**
1. Create a Google Cloud Pub/Sub topic
2. Create a push subscription pointing to this webhook URL
3. Set up Gmail watch to publish notifications to the topic

See `WEBHOOK_URL.md` for webhook URL details and setup instructions.

### Combined Webhook

#### Receive Messages (SMS/WhatsApp)
**POST** `/webhook`

Combined endpoint that handles both SMS and WhatsApp messages.

## Local Development

### Start Local Server

```bash
npm run start
```

The server will start on `http://localhost:3000`

### Test Endpoints Locally

**Send SMS:**
```bash
curl -X POST http://localhost:3000/sms/send \
  -H "Content-Type: application/json" \
  -d '{"to": "+1234567890", "message": "Test SMS"}'
```

**Send Email:**
```bash
curl -X POST http://localhost:3000/email/send \
  -H "Content-Type: application/json" \
  -d '{"to": "recipient@example.com", "subject": "Test", "body": "Test email"}'
```

### Testing Email Webhook Locally

For local webhook testing, use **ngrok** to expose your local server:

1. **Start your local server:**
   ```bash
   npm run start
   ```

2. **In another terminal, start ngrok:**
   ```bash
   ngrok http 3000
   ```

3. **Use the ngrok HTTPS URL** in your Pub/Sub subscription configuration:
   ```
   https://your-ngrok-url.ngrok.io/webhook/email
   ```

## Deployment

### Deploy to AWS

```bash
npm run deploy
```

Or deploy to a specific stage:

```bash
npx serverless deploy --stage prod
```

### Get Deployment Information

```bash
npx serverless info
```

This will show all your API Gateway endpoints.

### View Logs

```bash
# View logs for a specific function
npx serverless logs -f sendEmail -t

# View logs for webhook
npx serverless logs -f webhookEmail -t
```

## Project Structure

```
.
├── src/
│   ├── handlers/
│   │   ├── webhook.ts          # Combined webhook handler
│   │   ├── webhookSms.ts       # SMS webhook handler
│   │   ├── webhookWhatsApp.ts  # WhatsApp webhook handler
│   │   ├── webhookEmail.ts     # Email webhook handler
│   │   ├── sendSms.ts          # Send SMS handler
│   │   ├── sendWhatsApp.ts     # Send WhatsApp handler
│   │   └── sendEmail.ts        # Send email handler
│   ├── gmail-oauth/            # Gmail OAuth2 polling solution
│   │   ├── gmail-client.ts     # Gmail OAuth2 client
│   │   ├── poller-lambda.ts    # Lambda handler for polling
│   │   ├── token-generator.ts  # OAuth2 token generator
│   │   ├── serverless.yml      # Serverless config for poller
│   │   └── README.md           # Gmail OAuth2 setup guide
│   ├── types/
│   │   ├── twilio.ts           # Twilio type definitions
│   │   └── email.ts            # Email type definitions
│   └── utils/
│       ├── twilio.ts           # Twilio client utilities
│       └── gmail.ts            # Gmail API utilities
├── scripts/
│   ├── setup-gmail-watch.js    # Helper script for Gmail watch setup
│   └── clean-build.ps1         # Build cleanup script
├── serverless.yml              # Serverless Framework configuration
├── tsconfig.json               # TypeScript configuration
├── package.json               # Dependencies and scripts
└── env.template               # Environment variables template
```

## Scripts

### General Scripts

- `npm run build` - Build TypeScript to JavaScript
- `npm run watch` - Watch mode for TypeScript compilation
- `npm run start` - Start local serverless offline server
- `npm run deploy` - Deploy to AWS
- `npm run test` - Run tests (if configured)

### Gmail OAuth2 Poller Scripts

- `npm run gmail:token` - Generate OAuth2 tokens (run once)
- `npm run gmail:poll` - Test poller locally
- `npm run gmail:deploy` - Deploy Gmail poller Lambda to AWS
- `npm run gmail:build` - Build Gmail OAuth2 code

## Gmail Push Notifications Setup

To receive email notifications via webhook:

1. **Create Pub/Sub Topic:**
   ```bash
   gcloud pubsub topics create gmail-notifications
   ```

2. **Create Pub/Sub Subscription:**
   ```bash
   gcloud pubsub subscriptions create gmail-webhook-sub \
     --topic=gmail-notifications \
     --push-endpoint=https://YOUR_API_GATEWAY_URL/webhook/email
   ```

3. **Set up Gmail Watch:**
   ```bash
   node scripts/setup-gmail-watch.js
   ```
   
   Or set environment variables:
   ```bash
   export GOOGLE_CLIENT_ID="your-client-id"
   export GOOGLE_CLIENT_SECRET="your-client-secret"
   export GOOGLE_PUBSUB_TOPIC="projects/YOUR_PROJECT_ID/topics/gmail-notifications"
   ```

**Note:** Gmail watch expires after 7 days and needs to be renewed.

## Gmail OAuth2 Poller

A separate solution for polling personal Gmail inboxes using OAuth2 authentication (not service accounts). This is ideal for personal Gmail accounts or when you don't have Google Workspace.

### Features

- ✅ **OAuth2 Authentication** - Uses Desktop App credentials (no service accounts)
- ✅ **Automatic Polling** - Runs every 1 minute via EventBridge schedule
- ✅ **Email Sanitization** - Removes HTML tags and email signatures
- ✅ **Auto Acknowledgment** - Sends acknowledgment emails to senders
- ✅ **Configurable Filtering** - Optional sender email filtering
- ✅ **Token Management** - Automatic token refresh handling

### Quick Start

1. **Generate OAuth2 Tokens:**
   ```bash
   cd src/gmail-oauth
   npm run token
   ```
   Follow the prompts to authorize and get your refresh token.

2. **Test Locally:**
   ```bash
   npm run gmail:poll
   ```

3. **Deploy to AWS Lambda:**
   ```bash
   npm run gmail:deploy
   ```

### Configuration

Set environment variables in AWS Lambda or `.env` file:

```env
GMAIL_CLIENT_ID=your_client_id
GMAIL_CLIENT_SECRET=your_client_secret
GMAIL_REFRESH_TOKEN=your_refresh_token
SENDER_EMAIL=optional@example.com  # Optional: filter by sender
MAX_RESULTS=5                      # Max emails per poll
```

### How It Works

1. **Token Generation** (`token-generator.ts`):
   - Reads `client_secret.json` from Google Cloud Console
   - Opens OAuth authorization URL
   - Saves `access_token`, `refresh_token`, `expiry_date` to `gmail_tokens.json`

2. **Gmail Client** (`gmail-client.ts`):
   - Loads OAuth2 credentials (from env vars or files)
   - Automatically refreshes access tokens
   - Provides methods: `listEmails()`, `readEmail()`, `sendEmail()`, `sanitizeEmailBody()`

3. **Poller Lambda** (`poller-lambda.ts`):
   - Triggered every 1 minute by EventBridge
   - Searches for unread emails (optionally filtered by sender)
   - Processes each email:
     - Reads and sanitizes body (removes HTML/signatures)
     - Sends acknowledgment email to sender
     - Marks email as read

### Setup Instructions

See `src/gmail-oauth/README.md` for detailed setup instructions including:
- Creating OAuth2 Desktop App credentials
- Generating refresh tokens
- Deploying to AWS Lambda
- Local testing

### Key Differences from Google Workspace Solution

| Feature | Google Workspace | Gmail OAuth2 Poller |
|---------|----------------|---------------------|
| Authentication | Service Account | OAuth2 Desktop App |
| Account Type | Workspace only | Personal Gmail |
| Setup Complexity | Domain-wide delegation | OAuth2 flow |
| Email Access | Push (Pub/Sub) | Polling (EventBridge) |
| Use Case | Enterprise/Workspace | Personal accounts |

## Troubleshooting

### Common Issues

**"GOOGLE_SERVICE_ACCOUNT_KEY must be set"**
- Ensure `.env` file exists and contains `GOOGLE_SERVICE_ACCOUNT_KEY`
- Check that the file path is correct (relative to project root)

**"Failed to send email"**
- Verify `GOOGLE_WORKSPACE_EMAIL` is set correctly
- Check that domain-wide delegation is enabled
- Ensure Gmail API is enabled in Google Cloud Console

**"Failed to initialize Gmail client"**
- Verify your service account JSON file is valid
- Check that domain-wide delegation is configured correctly
- Ensure the service account has correct scopes in Google Workspace admin

**Webhook not receiving notifications**
- Verify Pub/Sub subscription is configured correctly
- Check that Gmail watch is still active (expires after 7 days)
- Verify webhook URL is accessible and returns 200 status

**Port already in use**
- Change the port in `serverless.yml`:
  ```yaml
  custom:
    serverless-offline:
      httpPort: 3001
  ```

## Environment Variables Reference

### Twilio Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `TWILIO_ACCOUNT_SID` | Twilio Account SID | Yes (for SMS/WhatsApp) |
| `TWILIO_SMS_AUTH_TOKEN` | Twilio SMS Auth Token | Yes (for SMS) |
| `TWILIO_WHATSAPP_AUTH_TOKEN` | Twilio WhatsApp Auth Token | Yes (for WhatsApp) |
| `TWILIO_PHONE_NUMBER` | Default Twilio phone number | Yes (for SMS) |
| `TWILIO_WHATSAPP_PHONE_NUMBER` | Default Twilio WhatsApp number | Yes (for WhatsApp) |

### Google Workspace Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `GOOGLE_SERVICE_ACCOUNT_KEY` | Google service account JSON (file path or JSON string) | Yes (for Email) |
| `GOOGLE_WORKSPACE_EMAIL` | Google Workspace email to impersonate | Yes (for Email) |

### Gmail OAuth2 Poller Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `GMAIL_CLIENT_ID` | OAuth2 Client ID from Google Cloud Console | Yes |
| `GMAIL_CLIENT_SECRET` | OAuth2 Client Secret from Google Cloud Console | Yes |
| `GMAIL_REFRESH_TOKEN` | OAuth2 Refresh Token (from token-generator.ts) | Yes |
| `SENDER_EMAIL` | Optional: Filter emails by sender address | No |
| `MAX_RESULTS` | Maximum emails to process per poll (default: 5) | No |

## License

MIT

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Support

For issues and questions:
- Check the troubleshooting section above
- Review the `WEBHOOK_URL.md` for webhook setup details
- Check AWS CloudWatch logs for Lambda function errors
- Verify all environment variables are set correctly

