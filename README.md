# Twilio Lambda Webhook

AWS Lambda functions for handling Twilio webhooks and sending SMS/WhatsApp messages, plus Google Workspace email integration.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables:
   Create a `.env` file in the root directory with the following variables:
   
   **Twilio Configuration:**
   - `TWILIO_ACCOUNT_SID`: Your Twilio Account SID
   - `TWILIO_USER_SID`: Your Twilio User SID (optional)
   - `TWILIO_SMS_AUTH_TOKEN`: Your Twilio Auth Token for SMS
   - `TWILIO_WHATSAPP_AUTH_TOKEN`: Your Twilio Auth Token for WhatsApp
   - `TWILIO_PHONE_NUMBER`: Your Twilio phone number (e.g., +1234567890)
   - `TWILIO_WHATSAPP_PHONE_NUMBER`: Your Twilio WhatsApp number (e.g., +14155238886)
   
   **Google Workspace Configuration:**
   - `GOOGLE_SERVICE_ACCOUNT_KEY`: JSON string of your Google service account key (or path to JSON file for local dev)
   - `GOOGLE_WORKSPACE_EMAIL`: The email address in your Google Workspace that the service account will impersonate

3. Build the project:
```bash
npm run build
```

4. Run locally:
```bash
npm run start
```

**For detailed local testing instructions, see [LOCAL_TESTING.md](./LOCAL_TESTING.md)**

## API Endpoints

### 1. Webhook - Receive Messages (Combined)
**POST** `/webhook`

Receives incoming SMS and WhatsApp messages from Twilio (combined endpoint).

**Request**: Twilio webhook payload (form-encoded)

**Response**: TwiML XML response

### 2. Webhook - Receive SMS Messages
**POST** `/webhook/sms`

Receives incoming SMS messages from Twilio.

**Request**: Twilio webhook payload (form-encoded)

**Response**: TwiML XML response

**Twilio Configuration**:
- Set this URL as your webhook URL in Twilio Console
- Configure in Phone Numbers → Active Numbers → [Your Number] → Messaging → A MESSAGE COMES IN

### 3. Webhook - Receive WhatsApp Messages
**POST** `/webhook/whatsapp`

Receives incoming WhatsApp messages from Twilio.

**Request**: Twilio webhook payload (form-encoded)

**Response**: TwiML XML response

**Twilio Configuration**:
- Set this URL as your webhook URL in Twilio Console
- Configure in Messaging → Try it out → Send a WhatsApp message → Webhook URL
- Or in WhatsApp Sandbox settings

### 4. Send SMS
**POST** `/sms/send`

Sends an SMS message via Twilio.

**Request Body**:
```json
{
  "to": "+1234567890",
  "message": "Hello, this is a test SMS",
  "from": "+1234567890" // Optional, uses TWILIO_PHONE_NUMBER if not provided
}
```

**Response**:
```json
{
  "success": true,
  "messageSid": "SM1234567890abcdef"
}
```

### 5. Send WhatsApp
**POST** `/whatsapp/send`

Sends a WhatsApp message via Twilio.

**Request Body**:
```json
{
  "to": "+1234567890",
  "message": "Hello, this is a test WhatsApp message",
  "from": "whatsapp:+14155238886" // Optional, uses TWILIO_WHATSAPP_NUMBER if not provided
}
```

**Response**:
```json
{
  "success": true,
  "messageSid": "SM1234567890abcdef"
}
```

**Note**: The `to` field can include or omit the `whatsapp:` prefix. The function will automatically format it correctly.

### 6. Send Email
**POST** `/email/send`

Sends an email via Google Workspace Gmail API.

**Request Body**:
```json
{
  "to": "recipient@example.com",
  "subject": "Test Email",
  "body": "This is a test email",
  "from": "sender@yourdomain.com", // Optional, uses GOOGLE_WORKSPACE_EMAIL if not provided
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

**Response**:
```json
{
  "success": true,
  "messageId": "1234567890abcdef"
}
```

**Google Workspace Setup**:
1. Create a service account in Google Cloud Console
2. Enable Gmail API for your project
3. Grant domain-wide delegation to the service account
4. Add the service account email to your Google Workspace admin console with Gmail API scopes
5. Set `GOOGLE_SERVICE_ACCOUNT_KEY` to the JSON key content (as a string) or file path
6. Set `GOOGLE_WORKSPACE_EMAIL` to the email address you want to send from

### 7. Email Webhook - Receive Email Notifications
**POST** `/webhook/email`

Receives Gmail Push notifications via Google Cloud Pub/Sub when new emails arrive.

**Request**: Pub/Sub message format from Google Cloud

**Response**:
```json
{
  "success": true,
  "message": "Processed N new email(s)"
}
```

**Gmail Push Notification Setup**:
1. Create a Google Cloud Pub/Sub topic
2. Create a subscription for the topic
3. Configure Gmail Push notifications to publish to the topic
4. Set up the subscription to push messages to this webhook endpoint
5. The webhook will automatically process new emails when they arrive

**📖 For detailed setup instructions, see [GMAIL_WEBHOOK_SETUP.md](./GMAIL_WEBHOOK_SETUP.md)**

## Deployment

Deploy to AWS:
```bash
npm run deploy
```

## Project Structure

```
.
├── src/
│   ├── handlers/
│   │   ├── webhook.ts          # Combined webhook handler for receiving messages
│   │   ├── webhookSms.ts       # SMS-specific webhook handler
│   │   ├── webhookWhatsApp.ts  # WhatsApp-specific webhook handler
│   │   ├── webhookEmail.ts     # Email webhook handler for Gmail Push notifications
│   │   ├── sendSms.ts           # Lambda function to send SMS
│   │   ├── sendWhatsApp.ts     # Lambda function to send WhatsApp
│   │   └── sendEmail.ts         # Lambda function to send emails
│   ├── types/
│   │   ├── twilio.ts           # TypeScript type definitions for Twilio
│   │   └── email.ts            # TypeScript type definitions for Email
│   └── utils/
│       ├── twilio.ts           # Twilio client utilities
│       └── gmail.ts            # Gmail API client utilities
├── serverless.yml               # Serverless Framework configuration
├── tsconfig.json               # TypeScript configuration
└── package.json                # Dependencies and scripts
```

