import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { TwilioWebhookPayload, WebhookResponse } from '../types/twilio';
import { getWhatsAppClient, getDefaultWhatsAppNumber } from '../utils/twilio';

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

    // Validate that this is a WhatsApp message
    const isWhatsApp = payload.From.startsWith('whatsapp:') || 
                       payload.To.startsWith('whatsapp:') ||
                       payload.WaId !== undefined;
    
    if (!isWhatsApp) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          success: false,
          error: 'This endpoint is for WhatsApp messages only. Use /webhook/sms for SMS messages.',
        } as WebhookResponse),
      };
    }

    // Log the received WhatsApp message
    console.log('Received WhatsApp message:', {
      messageSid: payload.MessageSid,
      waId: payload.WaId,
      from: payload.From,
      to: payload.To,
      body: payload.Body,
      status: payload.MessageStatus,
      numMedia: payload.NumMedia,
    });

    // TODO: Store WhatsApp message in DynamoDB or process as needed
    // Example: await storeWhatsAppMessage(payload);

    // Send a dummy WhatsApp message back to the sender
    try {
      const fromNumber = getDefaultWhatsAppNumber();
      // Extract phone number from WhatsApp format (whatsapp:+1234567890 -> +1234567890)
      const senderNumber = payload.From.startsWith('whatsapp:') 
        ? payload.From.replace('whatsapp:', '') 
        : payload.From;
      const formattedTo = `whatsapp:${senderNumber}`;
      
      const dummyMessage = `Thank you for your WhatsApp message! We received: "${payload.Body}". This is an automated response.`;
      
      const whatsappClient = getWhatsAppClient();
      const sentMessage = await whatsappClient.messages.create({
        body: dummyMessage,
        from: fromNumber,
        to: formattedTo,
      });

      console.log('Dummy WhatsApp message sent successfully:', {
        messageSid: sentMessage.sid,
        to: formattedTo,
        from: fromNumber,
        status: sentMessage.status,
      });
    } catch (sendError) {
      console.error('Error sending dummy WhatsApp message:', sendError);
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
    console.error('Error processing WhatsApp webhook:', error);
    
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

