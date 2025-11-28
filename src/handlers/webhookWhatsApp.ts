import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { TwilioWebhookPayload, WebhookResponse } from '../types/twilio';
import { getWhatsAppClient, getDefaultWhatsAppNumber } from '../utils/twilio';
import { callQueryApi, getResponseText } from '../utils/queryApi';
import { getOrCreateSmsWhatsAppSession } from '../utils/sessionStore';

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
    const isWhatsApp = (payload.From && payload.From.startsWith('whatsapp:')) || 
                       (payload.To && payload.To.startsWith('whatsapp:')) ||
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

    // Get or create session ID for WhatsApp conversation
    // Use WaId if available, otherwise use From phone number
    const phoneNumber = payload.WaId || payload.From;
    if (!phoneNumber || !phoneNumber.trim()) {
      console.error('Missing phone number (WaId and From are both empty)');
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          success: false,
          error: 'Missing phone number',
        } as WebhookResponse),
      };
    }
    const sessionId = await getOrCreateSmsWhatsAppSession('whatsapp', phoneNumber, payload.Body);
    console.log('WhatsApp Session ID:', sessionId);

    // Call Query API with WhatsApp message text and send response back
    let replyMessage = 'Thank you for your message. We have received it and will get back to you soon.';
    
    if (payload.Body && payload.Body.trim()) {
      try {
        console.log('Calling Query API with WhatsApp text:', {
          query: payload.Body.substring(0, 100) + (payload.Body.length > 100 ? '...' : ''),
          sessionId,
        });
        const queryApiResponse = await callQueryApi(payload.Body, sessionId, 'whatsapp');
        console.log('Query API response for WhatsApp:', {
          messageSid: payload.MessageSid,
          sessionId,
          success: queryApiResponse.success,
          hasAgentResponse: !!queryApiResponse.agent_response,
        });
        
        // Check if agent_response is an array of strings or a string
        const agentResponse = queryApiResponse.agent_response;
        
        if (Array.isArray(agentResponse)) {
          // If it's an array, send each string as a separate message
          if (agentResponse.length === 0) {
            console.warn('Query API returned empty array, using fallback message');
            replyMessage = 'Thank you for your message. We have received it and will get back to you soon.';
            // Fall through to send fallback message below
          } else {
            console.log('Query API returned array of responses, sending multiple messages:', {
              count: agentResponse.length,
            });
            
            const fromNumber = getDefaultWhatsAppNumber();
            if (!fromNumber) {
              console.error('Cannot send WhatsApp messages: Default WhatsApp number is not configured');
              replyMessage = 'Thank you for your message. We have received it and will get back to you soon.';
            } else {
              // Extract phone number from WhatsApp format (whatsapp:+1234567890 -> +1234567890)
              const senderNumber = payload.From && payload.From.startsWith('whatsapp:') 
                ? payload.From.replace('whatsapp:', '') 
                : payload.From;
              
              if (!senderNumber) {
                console.error('Cannot send WhatsApp messages: Cannot determine sender phone number');
                replyMessage = 'Thank you for your message. We have received it and will get back to you soon.';
              } else {
                const formattedTo = `whatsapp:${senderNumber}`;
                
                const whatsappClient = getWhatsAppClient();
                if (!whatsappClient) {
                  console.error('Cannot send WhatsApp messages: WhatsApp client is not initialized');
                  replyMessage = 'Thank you for your message. We have received it and will get back to you soon.';
                } else {
                  let messagesSent = 0;
                  // Send each message in the array
                  for (let i = 0; i < agentResponse.length; i++) {
                    const messageItem = agentResponse[i];
                    
                    // Validate that array item is a string
                    if (typeof messageItem !== 'string') {
                      console.warn(`Skipping non-string message at index ${i}:`, typeof messageItem);
                      continue;
                    }
                    
                    const messageText = messageItem.trim();
                    if (!messageText) {
                      console.warn(`Skipping empty message at index ${i}`);
                      continue;
                    }
                    
                    try {
                      const sentMessage = await whatsappClient.messages.create({
                        body: messageText,
                        from: fromNumber,
                        to: formattedTo,
                      });

                      messagesSent++;
                      console.log(`WhatsApp message ${i + 1}/${agentResponse.length} sent successfully:`, {
                        messageSid: sentMessage.sid,
                        to: formattedTo,
                        from: fromNumber,
                        status: sentMessage.status,
                        replyLength: messageText.length,
                      });
                    } catch (sendError) {
                      console.error(`Error sending WhatsApp message ${i + 1}/${agentResponse.length}:`, {
                        error: sendError instanceof Error ? sendError.message : 'Unknown error',
                        stack: sendError instanceof Error ? sendError.stack : undefined,
                      });
                      // Continue sending remaining messages even if one fails
                    }
                  }
                  
                  if (messagesSent === 0) {
                    console.warn('No messages were sent from array, using fallback message');
                    replyMessage = 'Thank you for your message. We have received it and will get back to you soon.';
                    // Fall through to send fallback message below
                  } else {
                    // All messages sent successfully, skip single message sending below
                    return {
                      statusCode: 200,
                      headers: {
                        'Content-Type': 'text/xml',
                        'Access-Control-Allow-Origin': '*',
                      },
                      body: `<?xml version="1.0" encoding="UTF-8"?>
<Response>
</Response>`,
                    };
                  }
                }
              }
            }
          }
          
          // If we reach here, array was empty or all items were invalid - send fallback message
          if (replyMessage) {
            try {
              const fromNumber = getDefaultWhatsAppNumber();
              if (!fromNumber) {
                console.error('Cannot send WhatsApp fallback message: Default WhatsApp number is not configured');
              } else {
                const senderNumber = payload.From && payload.From.startsWith('whatsapp:') 
                  ? payload.From.replace('whatsapp:', '') 
                  : payload.From;
                
                if (!senderNumber) {
                  console.error('Cannot send WhatsApp fallback message: Cannot determine sender phone number');
                } else {
                  const formattedTo = `whatsapp:${senderNumber}`;
                  
                  const whatsappClient = getWhatsAppClient();
                  if (!whatsappClient) {
                    console.error('Cannot send WhatsApp fallback message: WhatsApp client is not initialized');
                  } else {
                    const sentMessage = await whatsappClient.messages.create({
                      body: replyMessage,
                      from: fromNumber,
                      to: formattedTo,
                    });

                    console.log('WhatsApp fallback message sent successfully:', {
                      messageSid: sentMessage.sid,
                      to: formattedTo,
                      from: fromNumber,
                      status: sentMessage.status,
                      replyLength: replyMessage.length,
                    });
                  }
                }
              }
            } catch (sendError) {
              console.error('Error sending WhatsApp fallback message:', {
                error: sendError instanceof Error ? sendError.message : 'Unknown error',
                stack: sendError instanceof Error ? sendError.stack : undefined,
              });
            }
          }
        } else {
          // If it's a string, use current implementation
          replyMessage = getResponseText(
            queryApiResponse,
            'Thank you for your message. We have received it and will get back to you soon.'
          );
          
          // Send WhatsApp reply with API response
          try {
            const fromNumber = getDefaultWhatsAppNumber();
            if (!fromNumber) {
              console.error('Cannot send WhatsApp reply: Default WhatsApp number is not configured');
            } else {
              // Extract phone number from WhatsApp format (whatsapp:+1234567890 -> +1234567890)
              const senderNumber = payload.From && payload.From.startsWith('whatsapp:') 
                ? payload.From.replace('whatsapp:', '') 
                : payload.From;
              
              if (!senderNumber) {
                console.error('Cannot send WhatsApp reply: Cannot determine sender phone number');
              } else {
                const formattedTo = `whatsapp:${senderNumber}`;
                
                const whatsappClient = getWhatsAppClient();
                if (!whatsappClient) {
                  console.error('Cannot send WhatsApp reply: WhatsApp client is not initialized');
                } else {
                  const sentMessage = await whatsappClient.messages.create({
                    body: replyMessage,
                    from: fromNumber,
                    to: formattedTo,
                  });

                  console.log('WhatsApp reply sent successfully:', {
                    messageSid: sentMessage.sid,
                    to: formattedTo,
                    from: fromNumber,
                    status: sentMessage.status,
                    replyLength: replyMessage.length,
                  });
                }
              }
            }
          } catch (sendError) {
            console.error('Error sending WhatsApp reply:', {
              error: sendError instanceof Error ? sendError.message : 'Unknown error',
              stack: sendError instanceof Error ? sendError.stack : undefined,
            });
            // Continue execution even if sending fails
          }
        }
      } catch (queryError) {
        console.error('Error calling Query API for WhatsApp:', {
          messageSid: payload.MessageSid,
          error: queryError instanceof Error ? queryError.message : 'Unknown error',
        });
        // Use fallback message if API call fails
        replyMessage = 'Thank you for your message. We encountered an issue processing your request, but we have received your message.';
        
        // Send fallback message
        try {
          const fromNumber = getDefaultWhatsAppNumber();
          if (!fromNumber) {
            console.error('Cannot send fallback message: Default WhatsApp number is not configured');
          } else {
            const senderNumber = payload.From && payload.From.startsWith('whatsapp:') 
              ? payload.From.replace('whatsapp:', '') 
              : payload.From;
            
            if (!senderNumber) {
              console.error('Cannot send fallback message: Cannot determine sender phone number');
            } else {
              const formattedTo = `whatsapp:${senderNumber}`;
              
              const whatsappClient = getWhatsAppClient();
              if (!whatsappClient) {
                console.error('Cannot send fallback message: WhatsApp client is not initialized');
              } else {
                await whatsappClient.messages.create({
                  body: replyMessage,
                  from: fromNumber,
                  to: formattedTo,
                });
                console.log('Fallback WhatsApp message sent successfully');
              }
            }
          }
        } catch (sendError) {
          console.error('Error sending fallback WhatsApp message:', {
            error: sendError instanceof Error ? sendError.message : 'Unknown error',
            stack: sendError instanceof Error ? sendError.stack : undefined,
          });
        }
      }
    } else {
      // No message body, send default reply
      try {
        const fromNumber = getDefaultWhatsAppNumber();
        if (!fromNumber) {
          console.error('Cannot send default message: Default WhatsApp number is not configured');
        } else {
          const senderNumber = payload.From && payload.From.startsWith('whatsapp:') 
            ? payload.From.replace('whatsapp:', '') 
            : payload.From;
          
          if (!senderNumber) {
            console.error('Cannot send default message: Cannot determine sender phone number');
          } else {
            const formattedTo = `whatsapp:${senderNumber}`;
            
            const whatsappClient = getWhatsAppClient();
            if (!whatsappClient) {
              console.error('Cannot send default message: WhatsApp client is not initialized');
            } else {
              await whatsappClient.messages.create({
                body: replyMessage,
                from: fromNumber,
                to: formattedTo,
              });
              console.log('Default WhatsApp message sent successfully');
            }
          }
        }
      } catch (sendError) {
        console.error('Error sending default WhatsApp message:', {
          error: sendError instanceof Error ? sendError.message : 'Unknown error',
          stack: sendError instanceof Error ? sendError.stack : undefined,
        });
      }
    }

    // TODO: Store WhatsApp message in DynamoDB or process as needed
    // Example: await storeWhatsAppMessage(payload);

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
