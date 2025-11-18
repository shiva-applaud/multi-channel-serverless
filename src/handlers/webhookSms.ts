import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { TwilioWebhookPayload, WebhookResponse } from '../types/twilio';
import { getSmsClient, getDefaultPhoneNumber } from '../utils/twilio';

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

    // Validate that this is an SMS message (not WhatsApp)
    const isWhatsApp = payload.From.startsWith('whatsapp:') || 
                       payload.To.startsWith('whatsapp:') ||
                       payload.WaId !== undefined;
    
    if (isWhatsApp) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          success: false,
          error: 'This endpoint is for SMS messages only. Use /webhook/whatsapp for WhatsApp messages.',
        } as WebhookResponse),
      };
    }

    // Log the received SMS message
    console.log('Received SMS message:', {
      messageSid: payload.MessageSid,
      smsSid: payload.SmsSid,
      from: payload.From,
      to: payload.To,
      body: payload.Body,
      status: payload.MessageStatus || payload.SmsStatus,
      numMedia: payload.NumMedia,
    });

    // TODO: Store SMS message in DynamoDB or process as needed
    // Example: await storeSmsMessage(payload);

    // Send a dummy SMS message back to the sender
    try {
      const fromNumber = getDefaultPhoneNumber();
      const dummyMessage = `Thank you for your message! We received: "${payload.Body}". This is an automated response.`;
      
      const smsClient = getSmsClient();
      const sentMessage = await smsClient.messages.create({
        body: dummyMessage,
        from: fromNumber,
        to: payload.From,
      });

      console.log('Dummy SMS sent successfully:', {
        messageSid: sentMessage.sid,
        to: payload.From,
        from: fromNumber,
        status: sentMessage.status,
      });
    } catch (sendError) {
      console.error('Error sending dummy SMS:', sendError);
      // Continue execution even if sending fails
    }

    // Return empty TwiML response (we're sending via API instead)
    const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
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
    console.error('Error processing SMS webhook:', error);
    
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

