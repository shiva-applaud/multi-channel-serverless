import { APIGatewayProxyEvent, APIGatewayProxyResult, EventBridgeEvent } from 'aws-lambda';
import { WebhookEmailResponse } from '../types/email';
import { getEmailMessage, listEmails, getDefaultSenderEmail } from '../utils/gmail';
import { callQueryApi } from '../utils/queryApi';
import { getOrCreateEmailSession } from '../utils/sessionStore';

/**
 * Handler for polling Gmail inbox using Google APIs
 * This Lambda function polls for emails and reads them using Gmail API
 * Polls emails for the email address specified in GOOGLE_WORKSPACE_EMAIL environment variable
 * Runs automatically every 1 minute via EventBridge schedule
 */
export const handler = async (
  event: APIGatewayProxyEvent | EventBridgeEvent<string, any>
): Promise<APIGatewayProxyResult | void> => {
  const startTime = Date.now();
  
  // Detect event type (must be outside try block to be accessible in catch)
  const isScheduledEvent = 'source' in event && event.source === 'aws.events';
  const isApiGatewayEvent = 'httpMethod' in event;
  
  console.log('=== Gmail Polling Lambda Started ===');
  console.log('Event received:', {
    eventType: isScheduledEvent ? 'EventBridge Scheduled Event' : isApiGatewayEvent ? 'API Gateway' : 'Unknown',
    source: isScheduledEvent ? (event as EventBridgeEvent<string, any>).source : undefined,
    time: isScheduledEvent ? (event as EventBridgeEvent<string, any>).time : undefined,
    httpMethod: isApiGatewayEvent ? (event as APIGatewayProxyEvent).httpMethod : undefined,
    path: isApiGatewayEvent ? (event as APIGatewayProxyEvent).path : undefined,
    hasQueryParams: isApiGatewayEvent ? !!(event as APIGatewayProxyEvent).queryStringParameters : false,
    hasBody: isApiGatewayEvent ? !!(event as APIGatewayProxyEvent).body : false,
    requestId: isApiGatewayEvent ? (event as APIGatewayProxyEvent).requestContext?.requestId : undefined,
  });

  try {
    // Get the email address from environment variable
    console.log('Retrieving workspace email from environment variable...');
    const workspaceEmail = getDefaultSenderEmail();
    console.log('Workspace email retrieved:', workspaceEmail);
    
    // Parse query parameters from event (queryStringParameters, body, or EventBridge detail)
    let maxResults = 10;
    let query: string | undefined;
    let includeFullBody = false;

    // For scheduled events, check detail object; for API Gateway, check query/body
    if (isScheduledEvent) {
      const scheduledEvent = event as EventBridgeEvent<string, any>;
      console.log('Processing EventBridge scheduled event');
      if (scheduledEvent.detail) {
        console.log('EventBridge detail:', scheduledEvent.detail);
        if (scheduledEvent.detail.maxResults) {
          maxResults = parseInt(scheduledEvent.detail.maxResults, 10);
          console.log(`Parsed maxResults from EventBridge detail: ${maxResults}`);
        }
        if (scheduledEvent.detail.query) {
          query = scheduledEvent.detail.query;
          console.log(`Parsed query from EventBridge detail: ${query}`);
        }
        if (scheduledEvent.detail.includeFullBody === true) {
          includeFullBody = true;
          console.log('includeFullBody set to true from EventBridge detail');
        }
      } else {
        console.log('No detail in EventBridge event, using defaults');
      }
    } else if (isApiGatewayEvent) {
      const apiEvent = event as APIGatewayProxyEvent;
      // Check query string parameters first
      if (apiEvent.queryStringParameters) {
        console.log('Parsing query string parameters:', apiEvent.queryStringParameters);
        if (apiEvent.queryStringParameters.maxResults) {
          maxResults = parseInt(apiEvent.queryStringParameters.maxResults, 10);
          console.log(`Parsed maxResults from query params: ${maxResults}`);
        }
        if (apiEvent.queryStringParameters.query) {
          query = apiEvent.queryStringParameters.query;
          console.log(`Parsed query from query params: ${query}`);
        }
        if (apiEvent.queryStringParameters.includeFullBody === 'true') {
          includeFullBody = true;
          console.log('includeFullBody set to true from query params');
        }
      } else {
        console.log('No query string parameters found');
      }

      // Check body parameters (for POST requests)
      if (apiEvent.body) {
        console.log('Attempting to parse event body...');
        try {
          const body = JSON.parse(apiEvent.body);
          console.log('Event body parsed successfully:', Object.keys(body));
          if (body.maxResults) {
            maxResults = parseInt(body.maxResults, 10);
            console.log(`Parsed maxResults from body: ${maxResults}`);
          }
          if (body.query) {
            query = body.query;
            console.log(`Parsed query from body: ${query}`);
          }
          if (body.includeFullBody === true) {
            includeFullBody = true;
            console.log('includeFullBody set to true from body');
          }
        } catch (parseError) {
          console.warn('Could not parse event body as JSON, using query parameters only', {
            error: parseError instanceof Error ? parseError.message : 'Unknown error',
          });
        }
      } else {
        console.log('No event body found');
      }
    }

    // Validate maxResults
    const originalMaxResults = maxResults;
    if (maxResults < 1 || maxResults > 500) {
      console.warn(`Invalid maxResults value: ${maxResults}, defaulting to 10`);
      maxResults = 10; // Default to 10 if invalid
    } else if (originalMaxResults !== maxResults) {
      console.log(`maxResults validated and adjusted: ${originalMaxResults} -> ${maxResults}`);
    }

    console.log('=== Polling Configuration ===', {
      email: workspaceEmail,
      maxResults,
      query: query || 'none',
      includeFullBody,
    });

    // List emails using Gmail API
    console.log('Calling Gmail API to list emails...');
    const listStartTime = Date.now();
    const emailList = await listEmails(maxResults, query);
    const listDuration = Date.now() - listStartTime;
    console.log(`Gmail API listEmails completed in ${listDuration}ms`, {
      emailsFound: emailList.length,
      requestedMaxResults: maxResults,
    });

    if (emailList.length === 0) {
      console.log('No emails found matching the criteria');
    } else {
      console.log(`Starting to fetch full details for ${emailList.length} email(s)...`);
    }

    // Fetch full email details for each message
    const emails: any[] = [];
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < emailList.length; i++) {
      const emailItem = emailList[i];
      if (emailItem.id) {
        console.log(`Processing email ${i + 1}/${emailList.length}`, {
          messageId: emailItem.id,
          threadId: emailItem.threadId,
        });
        
        try {
          const fetchStartTime = Date.now();
          const fullEmail = await getEmailMessage(emailItem.id);
          const fetchDuration = Date.now() - fetchStartTime;
          console.log(`Fetched email ${emailItem.id} in ${fetchDuration}ms`);
          
          // Extract useful information
          const headers = fullEmail.payload?.headers || [];
          console.log(`Extracting headers from email ${emailItem.id}`, {
            headerCount: headers.length,
          });
          
          const from = headers.find((h: any) => h.name === 'From')?.value || 'Unknown';
          const to = headers.find((h: any) => h.name === 'To')?.value || 'Unknown';
          const subject = headers.find((h: any) => h.name === 'Subject')?.value || '(No Subject)';
          const date = headers.find((h: any) => h.name === 'Date')?.value || '';
          const cc = headers.find((h: any) => h.name === 'Cc')?.value;
          const replyTo = headers.find((h: any) => h.name === 'Reply-To')?.value;

          console.log(`Extracted email headers for ${emailItem.id}:`, {
            from,
            to,
            subject,
            date,
            hasCc: !!cc,
            hasReplyTo: !!replyTo,
          });

          // Extract email body if requested
          let bodyText = '';
          let bodyHtml = '';
          if (includeFullBody && fullEmail.payload) {
            console.log(`Extracting email body for ${emailItem.id}...`);
            const bodyExtractStartTime = Date.now();
            
            const extractBody = (part: any): void => {
              if (part.body?.data) {
                const decoded = Buffer.from(part.body.data, 'base64').toString('utf-8');
                if (part.mimeType === 'text/html') {
                  bodyHtml = decoded;
                  console.log(`Found HTML body part for ${emailItem.id}`, {
                    size: decoded.length,
                    mimeType: part.mimeType,
                  });
                } else if (part.mimeType === 'text/plain') {
                  bodyText = decoded;
                  console.log(`Found text body part for ${emailItem.id}`, {
                    size: decoded.length,
                    mimeType: part.mimeType,
                  });
                }
              }
              if (part.parts) {
                console.log(`Processing ${part.parts.length} sub-parts for ${emailItem.id}`);
                part.parts.forEach(extractBody);
              }
            };
            extractBody(fullEmail.payload);
            
            const bodyExtractDuration = Date.now() - bodyExtractStartTime;
            console.log(`Body extraction completed for ${emailItem.id} in ${bodyExtractDuration}ms`, {
              hasTextBody: !!bodyText,
              hasHtmlBody: !!bodyHtml,
              textBodyLength: bodyText.length,
              htmlBodyLength: bodyHtml.length,
            });
          } else {
            console.log(`Skipping body extraction for ${emailItem.id} (includeFullBody: ${includeFullBody})`);
          }

          const emailData: any = {
            id: fullEmail.id,
            threadId: fullEmail.threadId,
            snippet: fullEmail.snippet,
            from,
            to,
            subject,
            date,
            internalDate: fullEmail.internalDate,
            sizeEstimate: fullEmail.sizeEstimate,
            labelIds: fullEmail.labelIds,
          };

          if (cc) {
            emailData.cc = cc;
            console.log(`Added CC header for ${emailItem.id}: ${cc}`);
          }
          if (replyTo) {
            emailData.replyTo = replyTo;
            console.log(`Added Reply-To header for ${emailItem.id}: ${replyTo}`);
          }
          if (includeFullBody) {
            if (bodyText) {
              emailData.bodyText = bodyText;
              console.log(`Added text body to email data for ${emailItem.id}`);
            }
            if (bodyHtml) {
              emailData.bodyHtml = bodyHtml;
              console.log(`Added HTML body to email data for ${emailItem.id}`);
            }
          }

          emails.push(emailData);
          successCount++;

          console.log('Email processed successfully:', {
            messageId: fullEmail.id,
            from,
            subject,
            date,
            threadId: fullEmail.threadId,
            labelIds: fullEmail.labelIds,
            sizeEstimate: fullEmail.sizeEstimate,
            snippetLength: fullEmail.snippet?.length || 0,
          });

          // Get or create session ID for email conversation
          const threadId = fullEmail.threadId || emailItem.threadId || undefined;
          const threadIdentifier = {
            threadId,
            subject: subject,
            senderEmail: from,
          };
          const sessionId = await getOrCreateEmailSession(threadIdentifier);
          console.log('Email Session ID:', {
            messageId: fullEmail.id,
            threadId: threadId || 'not available',
            sessionId,
          });

          // Call Query API with email text (prefer bodyText, then snippet, then subject)
          const emailText = bodyText || fullEmail.snippet || subject;
          if (emailText && emailText.trim()) {
            try {
              console.log('Calling Query API with email text:', {
                messageId: fullEmail.id,
                textSource: bodyText ? 'bodyText' : fullEmail.snippet ? 'snippet' : 'subject',
                query: emailText.substring(0, 100) + (emailText.length > 100 ? '...' : ''),
                sessionId,
              });
              const queryApiResponse = await callQueryApi(emailText, sessionId, 'email');
              console.log('Query API response for email:', {
                messageId: fullEmail.id,
                sessionId,
                response: queryApiResponse,
              });
            } catch (queryError) {
              console.error('Error calling Query API for email:', {
                messageId: fullEmail.id,
                error: queryError instanceof Error ? queryError.message : 'Unknown error',
              });
              // Continue processing other emails even if query API fails
            }
          }
        } catch (error) {
          errorCount++;
          console.error(`Error fetching email ${emailItem.id}:`, {
            messageId: emailItem.id,
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
            errorType: error instanceof Error ? error.constructor.name : typeof error,
          });
          // Continue processing other emails even if one fails
        }
      } else {
        console.warn(`Email item at index ${i} has no ID, skipping`, {
          emailItem,
        });
      }
    }

    console.log('=== Email Processing Summary ===', {
      totalEmailsFound: emailList.length,
      successfullyProcessed: successCount,
      errors: errorCount,
      emailsReturned: emails.length,
    });

    const totalDuration = Date.now() - startTime;
    console.log('=== Preparing Success Response ===', {
      emailCount: emails.length,
      totalDurationMs: totalDuration,
    });

    // For scheduled events, we don't need to return an API Gateway response
    if (isScheduledEvent) {
      console.log('=== Gmail Polling Lambda Completed Successfully (Scheduled) ===', {
        durationMs: totalDuration,
        emailsReturned: emails.length,
        workspaceEmail,
      });
      // Scheduled events don't require a return value, but we can return void
      return;
    }

    // For API Gateway events, return proper response
    const response: APIGatewayProxyResult = {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        success: true,
        message: `Retrieved ${emails.length} email(s)`,
        email: workspaceEmail,
        count: emails.length,
        emails,
      } as WebhookEmailResponse & { email: string; count: number; emails: any[] }),
    };

    console.log('=== Gmail Polling Lambda Completed Successfully (API Gateway) ===', {
      durationMs: totalDuration,
      emailsReturned: emails.length,
      workspaceEmail,
    });

    return response;
  } catch (error) {
    const totalDuration = Date.now() - startTime;
    console.error('=== Error Polling Gmail Inbox ===', {
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      stack: error instanceof Error ? error.stack : undefined,
      durationMs: totalDuration,
    });

    // For scheduled events, we can't return an error response
    if (isScheduledEvent) {
      console.log('=== Gmail Polling Lambda Failed (Scheduled) ===', {
        durationMs: totalDuration,
      });
      // Throw error so Lambda marks the execution as failed
      throw error;
    }

    // For API Gateway events, return proper error response
    const errorResponse: APIGatewayProxyResult = {
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

    console.log('=== Gmail Polling Lambda Failed (API Gateway) ===', {
      statusCode: 500,
      durationMs: totalDuration,
    });

    return errorResponse;
  }
};

