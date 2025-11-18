import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { SendMessageRequest, SendMessageResponse } from '../types/twilio';
import { getSmsClient, getDefaultPhoneNumber } from '../utils/twilio';

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

    // Use provided from number or default from environment
    const fromNumber = from || getDefaultPhoneNumber();

    // Send SMS via Twilio using SMS client
    const smsClient = getSmsClient();
    const twilioMessage = await smsClient.messages.create({
      body: message,
      from: fromNumber,
      to: to,
    });

    console.log('SMS sent successfully:', {
      messageSid: twilioMessage.sid,
      to: to,
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
    console.error('Error sending SMS:', error);

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

