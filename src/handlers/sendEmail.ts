import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { SendEmailRequest, SendEmailResponse } from '../types/email';
import { sendEmail } from '../utils/gmail.ts';

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
        } as SendEmailResponse),
      };
    }

    const requestBody: SendEmailRequest = JSON.parse(event.body);
    const { to, subject, body } = requestBody;

    // Validate required fields
    if (!to || !subject || !body) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          success: false,
          error: 'Missing required fields: to, subject, and body are required',
        } as SendEmailResponse),
      };
    }

    // Send email via Gmail API
    const messageId = await sendEmail(requestBody);

    console.log('Email sent successfully:', {
      messageId,
      to: Array.isArray(to) ? to.join(', ') : to,
      subject,
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        success: true,
        messageId,
      } as SendEmailResponse),
    };
  } catch (error) {
    console.error('Error sending email:', error);

    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      } as SendEmailResponse),
    };
  }
};
