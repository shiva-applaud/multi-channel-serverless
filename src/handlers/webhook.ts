import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { TwilioWebhookPayload, WebhookResponse } from '../types/twilio';

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    // Parse the webhook payload from Twilio
    const body = event.body;
    
    if (!body) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          success: false,
          error: 'Request body is missing',
        } as WebhookResponse),
      };
    }

    // Parse form-encoded data from Twilio
    const params = new URLSearchParams(body);
    const payload: TwilioWebhookPayload = {
      MessageSid: params.get('MessageSid') || '',
      AccountSid: params.get('AccountSid') || '',
      MessagingServiceSid: params.get('MessagingServiceSid') || undefined,
      From: params.get('From') || '',
      To: params.get('To') || '',
      Body: params.get('Body') || '',
      NumMedia: params.get('NumMedia') || '0',
      MessageStatus: params.get('MessageStatus') || undefined,
      SmsStatus: params.get('SmsStatus') || undefined,
      SmsSid: params.get('SmsSid') || undefined,
      WaId: params.get('WaId') || undefined,
    };

    // Determine message type (SMS or WhatsApp)
    const isWhatsApp = payload.From.startsWith('whatsapp:') || 
                       payload.To.startsWith('whatsapp:') ||
                       payload.WaId !== undefined;
    
    const messageType = isWhatsApp ? 'WhatsApp' : 'SMS';

    // Log the received message
    console.log(`Received ${messageType} message:`, {
      messageSid: payload.MessageSid,
      from: payload.From,
      to: payload.To,
      body: payload.Body,
      status: payload.MessageStatus || payload.SmsStatus,
      numMedia: payload.NumMedia,
    });

    // TODO: Store message in DynamoDB or process as needed
    // Example: await storeMessage(payload);

    // Return TwiML response (optional - can be empty for status callbacks)
    // For incoming messages, you might want to send an auto-reply
    const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Message received successfully</Message>
</Response>`;

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/xml',
        'Access-Control-Allow-Origin': '*',
      },
      body: twimlResponse,
    };
  } catch (error) {
    console.error('Error processing webhook:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      } as WebhookResponse),
    };
  }
};

