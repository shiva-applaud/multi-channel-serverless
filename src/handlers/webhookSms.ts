import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { TwilioWebhookPayload, WebhookResponse } from '../types/twilio';
import { getSmsClient, getDefaultPhoneNumber, getMessagingServiceSid } from '../utils/twilio';
import { callQueryApi, getResponseText } from '../utils/queryApi';
import { generateSmsSessionId } from '../utils/sessionId';

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

    // Generate session ID for SMS conversation
    const sessionId = generateSmsSessionId(payload.From);
    console.log('SMS Session ID:', sessionId);

    // Call Query API with SMS message text and send response back
    let replyMessage = 'Thank you for your message. We have received it and will get back to you soon.';
    
    if (payload.Body && payload.Body.trim()) {
      try {
        console.log('Calling Query API with SMS text:', {
          query: payload.Body.substring(0, 100) + (payload.Body.length > 100 ? '...' : ''),
          sessionId,
        });
        const queryApiResponse = await callQueryApi(payload.Body, sessionId, 'sms');
        console.log('Query API response for SMS:', {
          messageSid: payload.MessageSid,
          sessionId,
          success: queryApiResponse.success,
          hasAgentResponse: !!queryApiResponse.agent_response,
        });
        
        // Extract response text from API response
        replyMessage = getResponseText(
          queryApiResponse,
          'Thank you for your message. We have received it and will get back to you soon.'
        );
      } catch (queryError) {
        console.error('Error calling Query API for SMS:', {
          messageSid: payload.MessageSid,
          error: queryError instanceof Error ? queryError.message : 'Unknown error',
        });
        // Use fallback message if API call fails
        replyMessage = 'Thank you for your message. We encountered an issue processing your request, but we have received your message.';
      }
    }

    // TODO: Store SMS message in DynamoDB or process as needed
    // Example: await storeSmsMessage(payload);

    // Send SMS reply with API response
    try {
      const smsClient = getSmsClient();
      
      // Prefer Messaging Service over direct phone number to avoid geographic restrictions
      // Use Messaging Service from webhook payload, environment variable, or fallback to phone number
      const messagingServiceSid = payload.MessagingServiceSid || getMessagingServiceSid();
      const fromNumber = getDefaultPhoneNumber();
      
      let sentMessage;
      let usedMessagingService = false;
      
      // Try Messaging Service first if available
      if (messagingServiceSid) {
        try {
          console.log('Attempting to send SMS reply using Messaging Service:', {
            messagingServiceSid,
            to: payload.From,
          });
          
          sentMessage = await smsClient.messages.create({
            body: replyMessage,
            to: payload.From,
            messagingServiceSid: messagingServiceSid,
          });
          
          usedMessagingService = true;
          console.log('SMS reply sent successfully using Messaging Service:', {
            messageSid: sentMessage.sid,
            to: payload.From,
            messagingServiceSid: messagingServiceSid,
            status: sentMessage.status,
            replyLength: replyMessage.length,
          });
        } catch (messagingServiceError: any) {
          // If Messaging Service fails with authentication error (401), fallback to phone number
          if (messagingServiceError?.status === 401 || messagingServiceError?.code === 20003) {
            console.warn('Messaging Service authentication failed, falling back to phone number:', {
              error: messagingServiceError?.message,
              code: messagingServiceError?.code,
              messagingServiceSid,
            });
            
            // Fallback to phone number
            console.log('Sending SMS reply using phone number (fallback):', {
              from: fromNumber,
              to: payload.From,
            });
            
            sentMessage = await smsClient.messages.create({
              body: replyMessage,
              to: payload.From,
              from: fromNumber,
            });
            
            console.log('SMS reply sent successfully using phone number:', {
              messageSid: sentMessage.sid,
              to: payload.From,
              from: fromNumber,
              status: sentMessage.status,
              replyLength: replyMessage.length,
            });
          } else {
            // Re-throw if it's not an authentication error
            throw messagingServiceError;
          }
        }
      } else {
        // No Messaging Service available, use phone number directly
        console.log('Sending SMS reply using phone number:', {
          from: fromNumber,
          to: payload.From,
        });
        
        sentMessage = await smsClient.messages.create({
          body: replyMessage,
          to: payload.From,
          from: fromNumber,
        });
        
        console.log('SMS reply sent successfully:', {
          messageSid: sentMessage.sid,
          to: payload.From,
          from: fromNumber,
          status: sentMessage.status,
          replyLength: replyMessage.length,
        });
      }
    } catch (sendError: any) {
      // Enhanced error logging with full Twilio error details
      const errorDetails = {
        message: sendError?.message || 'Unknown error',
        status: sendError?.status,
        code: sendError?.code,
        moreInfo: sendError?.moreInfo,
        to: payload.From,
        from: getDefaultPhoneNumber(),
        messagingServiceSid: payload.MessagingServiceSid || getMessagingServiceSid(),
      };
      
      console.error('Error sending SMS reply (all methods failed):', {
        ...errorDetails,
        fullError: sendError,
        stack: sendError?.stack,
      });
      
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

