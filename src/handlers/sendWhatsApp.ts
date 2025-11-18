import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { SendMessageRequest, SendMessageResponse } from '../types/twilio';
import { getWhatsAppClient, getDefaultWhatsAppNumber } from '../utils/twilio';

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    if (!event.body) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          success: false,
          error: 'Request body is missing',
        } as SendMessageResponse),
      };
    }

    const requestBody: SendMessageRequest = JSON.parse(event.body);
    const { to, message, from } = requestBody;

    // Validate required fields
    if (!to || !message) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          success: false,
          error: 'Missing required fields: to and message are required',
        } as SendMessageResponse),
      };
    }

    // Format WhatsApp numbers (ensure they start with whatsapp:)
    const formattedTo = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
    
    // Use provided from number or default from environment
    const fromNumber = from 
      ? (from.startsWith('whatsapp:') ? from : `whatsapp:${from}`)
      : getDefaultWhatsAppNumber();

    // Send WhatsApp message via Twilio using WhatsApp client
    const whatsappClient = getWhatsAppClient();
    const twilioMessage = await whatsappClient.messages.create({
      body: message,
      from: fromNumber,
      to: formattedTo,
    });

    console.log('WhatsApp message sent successfully:', {
      messageSid: twilioMessage.sid,
      to: formattedTo,
      from: fromNumber,
      status: twilioMessage.status,
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        success: true,
        messageSid: twilioMessage.sid,
      } as SendMessageResponse),
    };
  } catch (error) {
    console.error('Error sending WhatsApp message:', error);

    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      } as SendMessageResponse),
    };
  }
};

