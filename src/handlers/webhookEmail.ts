import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { EmailWebhookPayload, WebhookEmailResponse } from '../types/email';
import { getGmailClient, getEmailMessage, listEmails } from '../utils/gmail';

/**
 * Handler for Gmail Push notifications via Google Cloud Pub/Sub
 * This webhook receives notifications when new emails arrive
 */
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
        } as WebhookEmailResponse),
      };
    }

    // Parse Pub/Sub message from Google Cloud
    const body = JSON.parse(event.body);
    
    // Handle Pub/Sub message format
    if (body.message && body.message.data) {
      // Decode base64 message data
      const messageData = Buffer.from(body.message.data, 'base64').toString('utf-8');
      const pushNotification: EmailWebhookPayload = JSON.parse(messageData);

      console.log('Received Gmail Push notification:', {
        emailAddress: pushNotification.emailAddress,
        historyId: pushNotification.historyId,
        expiration: pushNotification.expiration,
      });

      // Get Gmail client
      const gmail = getGmailClient();

      // Get history to find new messages
      const historyResponse = await gmail.users.history.list({
        userId: 'me',
        startHistoryId: pushNotification.historyId,
        historyTypes: ['messageAdded'],
      });

      const history = historyResponse.data.history || [];
      const messages: any[] = [];

      // Process each history entry
      for (const historyEntry of history) {
        if (historyEntry.messagesAdded) {
          for (const messageAdded of historyEntry.messagesAdded) {
            if (messageAdded.message?.id) {
              try {
                const message = await getEmailMessage(messageAdded.message.id);
                messages.push(message);
              } catch (error) {
                console.error(`Error fetching message ${messageAdded.message.id}:`, error);
              }
            }
          }
        }
      }

      // Log received emails
      console.log(`Processed ${messages.length} new email(s)`);
      for (const message of messages) {
        const headers = message.payload?.headers || [];
        const from = headers.find((h: any) => h.name === 'From')?.value || 'Unknown';
        const subject = headers.find((h: any) => h.name === 'Subject')?.value || '(No Subject)';
        
        console.log('New email received:', {
          messageId: message.id,
          from,
          subject,
          snippet: message.snippet,
        });
      }

      // TODO: Process emails as needed (store in database, trigger actions, etc.)
      // Example: await processNewEmails(messages);

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          success: true,
          message: `Processed ${messages.length} new email(s)`,
        } as WebhookEmailResponse),
      };
    } else {
      // Handle direct webhook calls (for testing or alternative implementations)
      console.log('Received direct webhook call:', body);

      // Optionally, fetch recent emails
      const recentEmails = await listEmails(10);
      console.log(`Found ${recentEmails.length} recent emails`);

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          success: true,
          message: 'Webhook received successfully',
        } as WebhookEmailResponse),
      };
    }
  } catch (error) {
    console.error('Error processing email webhook:', error);

    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      } as WebhookEmailResponse),
    };
  }
};

