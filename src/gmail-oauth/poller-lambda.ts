/**
 * Gmail Poller Lambda Handler
 * 
 * AWS Lambda function that runs continuously, polling Gmail inbox in a loop.
 * 
 * Features:
 * - Runs continuously, polling Gmail every POLL_INTERVAL seconds (default: 5 seconds)
 * - Automatically stops before Lambda timeout (leaves 30-second buffer)
 * - Restarts automatically via EventBridge schedule every 15 minutes
 * - Polls for all unread emails (no sender filter)
 * - Processes each email
 * - Marks emails as read after processing
 * - AUTOMATED token refresh: Access tokens refresh automatically when expired
 * - Error handling and retry logic
 * 
 * Token Management:
 * - Initial setup: ONE-TIME OAuth authorization required (visit /gmail/oauth/authorize)
 * - After setup: Access tokens refresh AUTOMATICALLY (no manual intervention needed)
 * - Refresh tokens are long-lived and stored in AWS Secrets Manager
 * - Daily token refresh Lambda ensures tokens stay valid
 * 
 * Configuration:
 * - POLL_INTERVAL: Milliseconds between polls (default: 5000 = 5 seconds)
 * - MAX_RESULTS: Maximum emails to process per poll (default: 5)
 * - SENDER_EMAIL: Optional - Comma-separated list of email addresses to filter by sender
 *   Example: "email1@example.com,email2@example.com" (if not set, processes all unread emails)
 * - GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET: OAuth2 credentials (required)
 * - GMAIL_REFRESH_TOKEN: OAuth2 refresh token (required, obtained via /gmail/oauth/authorize)
 * 
 * Deployment:
 * - Set environment variables in Lambda
 * - Schedule via EventBridge: rate(15 minutes) - restarts function before timeout
 */

import { APIGatewayProxyEvent, Context } from 'aws-lambda';
import { GmailClient } from './gmail-client';
import { callQueryApi, getResponseText, formatAgentResponse } from '../utils/queryApi';
import { getOrCreateSessionId } from '../utils/sessionStore';

/**
 * Parse SENDER_EMAIL environment variable as an array of email addresses
 * Supports comma-separated list: "email1@example.com,email2@example.com"
 * Returns empty array if not set or empty
 */
function parseSenderEmails(senderEmailEnv?: string): string[] {
  if (!senderEmailEnv || senderEmailEnv.trim() === '') {
    return [];
  }
  
  return senderEmailEnv
    .split(',')
    .map(email => email.trim())
    .filter(email => email.length > 0);
}

/**
 * Build Gmail query string for multiple sender emails
 * Uses Gmail's OR syntax: from:(email1 OR email2 OR email3)
 */
function buildSenderQuery(senderEmails: string[]): string {
  if (senderEmails.length === 0) {
    return '';
  }
  
  if (senderEmails.length === 1) {
    return `from:${senderEmails[0]}`;
  }
  
  // For multiple emails, use OR syntax
  const emailList = senderEmails.join(' OR ');
  return `from:(${emailList})`;
}

// Load environment variables from .env file if it exists (for local development)
try {
  const fs = require('fs');
  const path = require('path');
  const dotenv = require('dotenv');
  
  const envPath = path.join(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    dotenv.config();
    console.log('✓ Loaded environment variables from .env file');
  }
} catch (e) {
  // dotenv might not be installed, that's okay
}

interface PollerResult {
  success: boolean;
  emailsProcessed: number;
  emailsFound: number;
  errors: string[];
  lastChecked: string;
  query: string;
}

/**
 * Lambda handler for Gmail polling
 * 
 * This function runs continuously, polling Gmail inbox in a loop.
 * It runs until the Lambda timeout approaches (leaving a 30-second buffer).
 * 
 * Configuration:
 * - POLL_INTERVAL: Milliseconds between polls (default: 10000 = 10 seconds)
 * - MAX_RESULTS: Maximum emails to process per poll (default: 5)
 * - SENDER_EMAIL: Optional - Filter emails by sender
 */
export const handler = async (
  event: APIGatewayProxyEvent | any,
  context: Context
): Promise<PollerResult> => {
  const startTime = Date.now();
  const pollInterval = parseInt(process.env.POLL_INTERVAL || '3000', 10); // Default 10 seconds
  const timeoutBuffer = 30000; // 30 seconds buffer before timeout
  
  console.log('=== Gmail Poller Lambda Started (Continuous Mode) ===');
  console.log('Poll Interval:', pollInterval, 'ms');
  console.log('Context:', {
    requestId: context.awsRequestId,
    functionName: context.functionName,
    remainingTimeMs: context.getRemainingTimeInMillis(),
  });

  const result: PollerResult = {
    success: false,
    emailsProcessed: 0,
    emailsFound: 0,
    errors: [],
    lastChecked: new Date().toISOString(),
    query: '',
  };

  // Initialize Gmail client once (reused across polls)
  let gmailClient: GmailClient | null = null;
  let gmailClientInitialized = false;

  // Single poll function that can be called repeatedly
  const performPoll = async (): Promise<{ success: boolean; emailsProcessed: number; emailsFound: number; errors: string[] }> => {
    const pollResult = {
      success: false,
      emailsProcessed: 0,
      emailsFound: 0,
      errors: [] as string[],
    };

    try {
      // Initialize Gmail client if not already done
      if (!gmailClient || !gmailClientInitialized) {
        console.log('🔍 Initializing Gmail client...');
        
        // First, check if we have tokens available
        const { getGmailOAuthCredentials, getGmailTokens } = await import('../utils/secretsManager');
        
        let oauthCreds: any = null;
        let tokens: any = null;
        
        try {
          oauthCreds = await getGmailOAuthCredentials();
          console.log('OAuth credentials from Secrets Manager:', oauthCreds ? 'Found' : 'Not found');
        } catch (error: any) {
          console.warn('Error loading OAuth credentials from Secrets Manager:', error.message);
        }
        
        try {
          tokens = await getGmailTokens();
          console.log('Tokens from Secrets Manager:', tokens ? 'Found' : 'Not found');
          if (tokens) {
            console.log('Token details:', {
              hasRefreshToken: !!tokens.refresh_token,
              hasAccessToken: !!tokens.access_token,
              expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : 'Not set',
            });
          }
        } catch (error: any) {
          console.warn('Error loading tokens from Secrets Manager:', error.message);
        }
        
        // Check if we have minimum required credentials
        const hasClientId = oauthCreds?.client_id || process.env.GMAIL_CLIENT_ID;
        const hasClientSecret = oauthCreds?.client_secret || process.env.GMAIL_CLIENT_SECRET;
        const hasRefreshToken = tokens?.refresh_token || process.env.GMAIL_REFRESH_TOKEN;
        
        console.log('Credential check:', {
          hasClientId: !!hasClientId,
          hasClientSecret: !!hasClientSecret,
          hasRefreshToken: !!hasRefreshToken,
          source: {
            clientId: oauthCreds?.client_id ? 'Secrets Manager' : process.env.GMAIL_CLIENT_ID ? 'Env Var' : 'None',
            clientSecret: oauthCreds?.client_secret ? 'Secrets Manager' : process.env.GMAIL_CLIENT_SECRET ? 'Env Var' : 'None',
            refreshToken: tokens?.refresh_token ? 'Secrets Manager' : process.env.GMAIL_REFRESH_TOKEN ? 'Env Var' : 'None',
          },
        });
        
        if (!hasClientId || !hasClientSecret) {
          const errorMsg = 'Missing Gmail OAuth credentials. Please set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET environment variables or store them in Secrets Manager (gmail-oauth-credentials).';
          console.error(`❌ ${errorMsg}`);
          pollResult.errors.push(errorMsg);
          pollResult.success = false;
          return pollResult;
        }
        
        if (!hasRefreshToken) {
          // Try to get OAuth authorize URL for user
          const redirectUri = process.env.GMAIL_REDIRECT_URI || 'http://localhost';
          const oAuth2Client = new (await import('googleapis')).google.auth.OAuth2(
            hasClientId,
            hasClientSecret,
            redirectUri
          );
          
          const authUrl = oAuth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: [
              'https://www.googleapis.com/auth/gmail.readonly',
              'https://www.googleapis.com/auth/gmail.modify',
              'https://www.googleapis.com/auth/gmail.send',
            ],
            prompt: 'consent',
          });
          
          const errorMsg = `Missing Gmail refresh token. Initial OAuth authorization required (one-time setup).\n\n` +
            `To fix:\n` +
            `1. Visit: /gmail/oauth/authorize endpoint\n` +
            `2. Authorize the application (one-time)\n` +
            `3. Tokens will be stored automatically in Secrets Manager\n` +
            `4. Access tokens refresh automatically - no manual intervention needed\n\n` +
            `After initial setup, token refresh is fully automated.`;
          console.error(`❌ ${errorMsg}`);
          pollResult.errors.push('Missing refresh token - OAuth authorization required (one-time setup)');
          pollResult.success = false;
          return pollResult;
        }
        
        // We have credentials, initialize client
        try {
          // Try to create client with credentials from Secrets Manager first
          // If that fails, fall back to environment variables or files
          let clientInitialized = false;
          
          // First, try to initialize with Secrets Manager credentials
          if (oauthCreds?.client_id && oauthCreds?.client_secret && tokens?.refresh_token) {
            try {
              console.log('Attempting to initialize with Secrets Manager credentials...');
              gmailClient = new GmailClient({
                clientId: oauthCreds.client_id,
                clientSecret: oauthCreds.client_secret,
                refreshToken: tokens.refresh_token,
              });
              console.log('✓ Loaded credentials from Secrets Manager');
              clientInitialized = true;
            } catch (secretsInitError: any) {
              console.warn('Failed to initialize with Secrets Manager credentials, trying fallback:', secretsInitError.message);
              console.warn('Error details:', secretsInitError);
            }
          } else {
            console.log('Secrets Manager credentials incomplete, trying other sources...');
            console.log('OAuth creds available:', {
              hasClientId: !!oauthCreds?.client_id,
              hasClientSecret: !!oauthCreds?.client_secret,
            });
            console.log('Tokens available:', {
              hasRefreshToken: !!tokens?.refresh_token,
            });
          }
          
          // Fallback: try with environment variables or let constructor use its fallback logic
          if (!clientInitialized) {
            try {
              console.log('Attempting to initialize with environment variables or files...');
              gmailClient = new GmailClient();
              // If constructor didn't throw, it found credentials from env vars or files
              console.log('✓ Loaded credentials from environment variables or files');
              clientInitialized = true;
            } catch (envInitError: any) {
              console.error('Failed to initialize with environment variables/files:', envInitError.message);
              // If constructor throws, try one more time with Secrets Manager credentials if we have them
              if (oauthCreds?.client_id && oauthCreds?.client_secret && tokens?.refresh_token) {
                try {
                  console.log('Retrying with Secrets Manager credentials...');
                  gmailClient = new GmailClient({
                    clientId: oauthCreds.client_id,
                    clientSecret: oauthCreds.client_secret,
                    refreshToken: tokens.refresh_token,
                  });
                  console.log('✓ Loaded credentials from Secrets Manager (fallback retry)');
                  clientInitialized = true;
                } catch (finalError: any) {
                  console.error('Final initialization attempt failed:', finalError);
                  throw new Error(`Failed to initialize Gmail client with any credential source: ${finalError.message}`);
                }
              } else {
                throw envInitError;
              }
            }
          }
          
          if (!clientInitialized || !gmailClient) {
            throw new Error('Gmail client initialization completed but client is null');
          }
          
          gmailClientInitialized = true;
          console.log('✓ Gmail client initialized successfully');
        } catch (clientError: any) {
          const errorMsg = `Failed to initialize Gmail client: ${clientError.message}`;
          console.error(`❌ ${errorMsg}`);
          console.error('Stack trace:', clientError.stack);
          pollResult.errors.push(errorMsg);
          pollResult.success = false;
          return pollResult;
        }
      }

      // Configuration from environment variables
      const maxResults = parseInt(process.env.MAX_RESULTS || '5', 10);
      const senderEmails = parseSenderEmails(process.env.SENDER_EMAIL);

      // Build query
      let query = 'is:unread';
      const senderQuery = buildSenderQuery(senderEmails);
      if (senderQuery) {
        query = `${senderQuery} is:unread`;
      }

      // Ensure gmailClient is initialized
      if (!gmailClient) {
        const errorMsg = 'Gmail client not initialized';
        console.error(`❌ ${errorMsg}`);
        pollResult.errors.push(errorMsg);
        pollResult.success = false;
        return pollResult;
      }

      // List unread emails
      if (senderEmails.length > 0) {
        console.log(`\n📬 Searching for unread emails from: ${senderEmails.join(', ')}...`);
      } else {
        console.log(`\n📬 Searching for all unread emails...`);
      }
      const emailList = await gmailClient.listEmails(query, maxResults);
      pollResult.emailsFound = emailList.length;

      if (emailList.length === 0) {
        pollResult.success = true;
        console.log('✓ No unread emails to process');
        return pollResult;
      }

      if (senderEmails.length > 0) {
        console.log(`✓ Found ${emailList.length} unread email(s) from: ${senderEmails.join(', ')}`);
      } else {
        console.log(`✓ Found ${emailList.length} unread email(s)`);
      }

    // Process each email
    for (let i = 0; i < emailList.length; i++) {
      const emailItem = emailList[i];
      if (!emailItem.id) {
        console.warn(`⚠ Email at index ${i} has no ID, skipping`);
        continue;
      }

      let emailRead = false;
      try {
        console.log(`\n📖 Processing email ${i + 1}/${emailList.length} (ID: ${emailItem.id})`);

        // Read full email details
        const email = await gmailClient.readEmail(emailItem.id);
        emailRead = true;

        // Extract headers
        const headers = gmailClient.getEmailHeaders(email);
        const from = headers.from || 'Unknown';
        const subject = headers.subject || '(No Subject)';
        const date = headers.date || 'Unknown';
        const messageId = headers['message-id'] || '';
        const references = headers.references || '';
        
        // Determine thread identifier/session base (threadId preferred, fallback to headers)
        const threadId = emailItem.threadId || email.threadId || undefined;
        console.log(`   headers: ${headers}`);
        console.log(`   threadId: ${threadId}`);
        console.log(`   emailItem.threadId: ${emailItem.threadId}`);
        console.log(`   email.threadId: ${email.threadId}`);
        console.log(`   emailItem.id: ${emailItem.id}`);
        console.log(`   email.id: ${email.id}`);
        console.log(`   email.snippet: ${email.snippet}`);
        console.log(`   email.labelIds: ${email.labelIds}`);

        console.log(`   From: ${from}`);
        console.log(`   Subject: ${subject}`);
        console.log(`   Date: ${date}`);
        console.log(`   Message-ID: ${messageId || 'Not available'}`);
        console.log(`   Thread-ID: ${threadId || 'Not available'}`);
        console.log(`   References: ${references || 'Not available'}`);

        // Extract sender name and email address from "From" header
        // Format can be: "Name <email@example.com>" or "email@example.com"
        let senderEmail = '';
        let senderName = '';
        
        // Try to extract name from format: "Name <email@example.com>"
        const nameEmailMatch = from.match(/^(.+?)\s*<([^>]+)>$/);
        if (nameEmailMatch) {
          senderName = nameEmailMatch[1].trim().replace(/['"]/g, ''); // Remove quotes if present
          senderEmail = nameEmailMatch[2].trim();
        } else {
          // Try to extract email from format: "email@example.com"
          const emailMatch = from.match(/([\w.-]+@[\w.-]+\.\w+)/);
          if (emailMatch) {
            senderEmail = emailMatch[0];
            // Extract name from email (part before @) as fallback
            senderName = senderEmail.split('@')[0].split('.')[0]; // First part before @, first word before dot
          } else {
            senderEmail = from.trim();
            senderName = ''; // No name available
          }
        }
        
        // Capitalize first letter of name for greeting
        if (senderName) {
          senderName = senderName.charAt(0).toUpperCase() + senderName.slice(1).toLowerCase();
        }

        // Decode email body
        // This handles base64url decoding automatically
        const body = gmailClient.decodeBase64Email(email);
        
        // Get the body text (prefer plain text, fallback to HTML)
        let bodyText = body.text || body.html || '';
        
        // Sanitize body: remove HTML tags and signatures
        const sanitizedBody = gmailClient.sanitizeEmailBody(bodyText);
        
        // Print full sanitized body
        console.log(`   Body (sanitized):`);
        console.log(`   ${'─'.repeat(60)}`);
        if (sanitizedBody) {
          // Print body with indentation for readability
          const lines = sanitizedBody.split('\n');
          lines.forEach(line => {
            console.log(`   ${line}`);
          });
        } else {
          console.log(`   (Empty body)`);
        }
        console.log(`   ${'─'.repeat(60)}`);
        
        if (body.html && !body.text) {
          console.log(`   Note: Converted from HTML`);
        }
        if (body.attachments > 0) {
          console.log(`   Attachments: ${body.attachments}`);
        }
        
        // Log body length comparison
        if (bodyText.length > sanitizedBody.length) {
          const removedChars = bodyText.length - sanitizedBody.length;
          console.log(`   Sanitized: Removed ${removedChars} characters (HTML/signature)`);
        }

        // Get or create session ID from DynamoDB based on thread identifiers
        // Use normalized subject + sender email only
        // Do NOT use references, in-reply-to, or threadId as they change
        const normalizedSubject = subject
          .trim()
          .replace(/^(re|fwd?):\s*/i, '')
          .replace(/\s+/g, ' ')
          .toLowerCase();
        
        const threadIdentifier = {
          subject: subject, // Pass original subject, normalization happens in generateThreadKey
          senderEmail: senderEmail,
        };
        
        console.log(`   Thread identifier:`, {
          originalSubject: subject.substring(0, 50),
          normalizedSubject: normalizedSubject.substring(0, 50),
          senderEmail: senderEmail,
        });
        
        const sessionId = await getOrCreateSessionId(threadIdentifier);
        console.log(`   Session ID: ${sessionId}`);

        // Call Query API with email text (prefer sanitizedBody, then subject)
        const emailText = sanitizedBody || subject;
        if (emailText && emailText.trim()) {
          try {
            console.log(`\n🔍 Calling Query API with email text:`);
            console.log(`   Text source: ${sanitizedBody ? 'sanitizedBody' : 'subject'}`);
            console.log(`   Query preview: ${emailText.substring(0, 100)}${emailText.length > 100 ? '...' : ''}`);
            console.log(`   Session ID: ${sessionId}`);
            const queryApiResponse = await callQueryApi(emailText, sessionId, 'email');
            console.log(`   ✓ Query API response:`, {
              success: queryApiResponse.success,
              sessionId,
              hasAgentResponse: !!queryApiResponse.agent_response,
            });
            
        // Send reply email to sender
        if (senderEmail && senderEmail.includes('@')) {
          try {
            // Only add "Re: " prefix if subject doesn't already start with it (case-insensitive)
            const ackSubject = subject.trim().toLowerCase().startsWith('re:') 
              ? subject.trim() 
              : `Re: ${subject.trim()}`;
            
            // Get API response text
            const fallbackMessage = `Thank you for your email.\n\nThis is an automated acknowledgment that your email has been received and processed.`;
            let apiResponseText = getResponseText(queryApiResponse, fallbackMessage);
            
            // Formatting disabled - sending text without formatting
            // Apply formatting to ensure clean text (remove unwanted line breaks, fix spacing)
            // apiResponseText = formatAgentResponse(apiResponseText);
            
            // Format email body with greeting and signature
            // const greeting = senderName ? `Hi ${senderName},` : 'Hi,';
            // const signature = `\n\n---\nBest regards,\nAutomated Support Team\n\nThis is an automated response.`;
            
            // const ackBody = `${greeting}\n\n${apiResponseText}${signature}`;
            const ackBody = `${apiResponseText}`;
            
            // Use REPLY_FROM_EMAIL if configured, otherwise use default (authenticated user's email)
            const replyFromEmail = process.env.REPLY_FROM_EMAIL || undefined;
            
            console.log(`\n📧 Sending reply email to: ${senderEmail}`);
            console.log(`   From: ${replyFromEmail || 'default (authenticated user)'}`);
            console.log(`   Sender Name: ${senderName || 'Not available'}`);
            console.log(`   Subject: ${ackSubject}`);
            console.log(`   Body length: ${ackBody.length} characters`);
            console.log(`   Threading: In-Reply-To=${messageId ? 'Yes' : 'No'}, References=${references ? 'Yes' : 'No'}`);
            
            // Log the full email body before sending (for debugging formatting issues)
            console.log(`\n📝 Full email body before sending:`);
            console.log(`${'═'.repeat(80)}`);
            console.log(ackBody);
            console.log(`${'═'.repeat(80)}`);
            
            // Also log with visible line break markers for debugging
            // const bodyWithMarkers = ackBody.replace(/\n/g, '\\n').replace(/\r/g, '\\r');
            // console.log(`\n📝 Email body with line break markers (first 500 chars):`);
            // console.log(bodyWithMarkers.substring(0, 500) + (bodyWithMarkers.length > 500 ? '...' : ''));
            // console.log(`   Total line breaks (\\n): ${(ackBody.match(/\n/g) || []).length}`);
            // console.log(`   Total carriage returns (\\r): ${(ackBody.match(/\r/g) || []).length}`);
            
            // Build References header: existing references + current message ID
            let threadingReferences = references;
            if (messageId) {
              if (threadingReferences) {
                threadingReferences = `${threadingReferences} ${messageId}`;
              } else {
                threadingReferences = messageId;
              }
            }
            
            const sentMessageId = await gmailClient.sendEmail(
              senderEmail, 
              ackSubject, 
              ackBody,
              replyFromEmail, // from (use REPLY_FROM_EMAIL if configured)
              messageId || undefined, // inReplyTo
              threadingReferences || undefined // references
            );
            console.log(`   ✓ Reply email sent successfully (Message ID: ${sentMessageId})`);
          } catch (ackError: any) {
            const errorMsg = `Failed to send reply email: ${ackError.message}`;
            console.error(`   ⚠ ${errorMsg}`);
            pollResult.errors.push(errorMsg);
            // Continue processing even if reply fails
          }
        } else {
          console.warn(`   ⚠ Could not extract valid sender email from: "${from}"`);
        }

        // Process email here
        // TODO: Add your email processing logic here
        // Example: await processEmail(email, headers, body);
        
            pollResult.emailsProcessed++;

            // Log email details for monitoring
            console.log(`   ✓ Email processed successfully`);
          } catch (queryError: any) {
            const errorMsg = `Failed to call Query API: ${queryError.message}`;
            console.error(`   ⚠ ${errorMsg}`);
            pollResult.errors.push(errorMsg);
            // Continue processing even if query API fails
          }
        } else {
          console.log(`   ⚠ No email text available to send to Query API`);
        }

      } catch (emailError: any) {
        const errorMsg = `Failed to process email ${emailItem.id}: ${emailError.message}`;
        console.error(`   ❌ ${errorMsg}`);
        pollResult.errors.push(errorMsg);
        // Continue processing other emails even if one fails
      } finally {
        if (emailRead) {
          try {
            await gmailClient.markAsRead(emailItem.id);
            console.log(`   ✓ Marked as read`);
          } catch (markError: any) {
            const errorMsg = `Failed to mark email ${emailItem.id} as read: ${markError.message}`;
            console.error(`   ⚠ ${errorMsg}`);
            pollResult.errors.push(errorMsg);
          }
        }
      }
    }

    pollResult.success = true;
    return pollResult;
    } catch (pollError: any) {
      const errorMsg = pollError.message || 'Unknown error';
      console.error('❌ Poll error:', errorMsg);
      pollResult.errors.push(errorMsg);
      pollResult.success = false;
      return pollResult;
    }
  };

  try {
    // Pre-check: Verify we have OAuth credentials before starting polling
    console.log('🔍 Checking OAuth credentials...');
    const { getGmailOAuthCredentials, getGmailTokens } = await import('../utils/secretsManager');
    const preCheckOAuthCreds = await getGmailOAuthCredentials();
    const preCheckTokens = await getGmailTokens();
    
    const hasClientId = preCheckOAuthCreds?.client_id || process.env.GMAIL_CLIENT_ID;
    const hasClientSecret = preCheckOAuthCreds?.client_secret || process.env.GMAIL_CLIENT_SECRET;
    const hasRefreshToken = preCheckTokens?.refresh_token || process.env.GMAIL_REFRESH_TOKEN;
    
    if (!hasClientId || !hasClientSecret) {
      const errorMsg = 'Missing Gmail OAuth credentials (GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET). Please set environment variables or store in Secrets Manager.';
      console.error(`❌ ${errorMsg}`);
      result.errors.push(errorMsg);
      result.success = false;
      return result;
    }
    
    if (!hasRefreshToken) {
      const errorMsg = 'Missing Gmail refresh token. Initial OAuth authorization required (one-time setup).\n' +
        'Visit /gmail/oauth/authorize to authorize. After setup, token refresh is fully automated.';
      console.error(`❌ ${errorMsg}`);
      console.log('⏸️  Polling paused until OAuth tokens are available');
      result.errors.push('Missing refresh token - OAuth authorization required');
      result.success = false;
      return result;
    }
    
    console.log('✓ OAuth credentials verified');
    console.log('✓ Token refresh: AUTOMATED (access tokens refresh automatically when expired)');

    // Configuration
    const maxResults = parseInt(process.env.MAX_RESULTS || '5', 10);
    const senderEmails = parseSenderEmails(process.env.SENDER_EMAIL);
    let query = 'is:unread';
    const senderQuery = buildSenderQuery(senderEmails);
    if (senderQuery) {
      query = `${senderQuery} is:unread`;
    }
    result.query = query;

    console.log(`📧 Polling Configuration:`);
    if (senderEmails.length > 0) {
      console.log(`   Sender Filter: ${senderEmails.join(', ')}`);
    } else {
      console.log(`   Sender Filter: None (all senders)`);
    }
    console.log(`   Query: "${query}"`);
    console.log(`   Max Results: ${maxResults}`);

    // Continuous polling loop
    console.log('\n🔄 Starting continuous polling...');
    let pollCount = 0;

    while (true) {
      const remainingTime = context.getRemainingTimeInMillis();
      
      // Exit if we're approaching timeout
      if (remainingTime < timeoutBuffer) {
        console.log(`\n⏰ Approaching timeout (${remainingTime}ms remaining), stopping continuous polling`);
        break;
      }

      pollCount++;
      console.log(`\n${'='.repeat(60)}`);
      console.log(`Poll #${pollCount} - ${new Date().toISOString()}`);
      console.log(`Remaining time: ${remainingTime}ms`);
      console.log(`${'='.repeat(60)}`);

      const pollResult = await performPoll();
      result.emailsProcessed += pollResult.emailsProcessed;
      result.emailsFound += pollResult.emailsFound;
      result.errors.push(...pollResult.errors);
      result.lastChecked = new Date().toISOString();

      if (pollResult.success) {
        result.success = true;
      }

      // Wait before next poll (unless we're about to timeout)
      const nextRemainingTime = context.getRemainingTimeInMillis();
      if (nextRemainingTime > timeoutBuffer + pollInterval) {
        console.log(`\n⏳ Waiting ${pollInterval}ms before next poll...`);
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      } else {
        console.log(`\n⏰ Not enough time for another poll, stopping`);
        break;
      }
    }

    console.log(`\n✅ Continuous polling completed after ${pollCount} poll(s)`);

    const duration = Date.now() - startTime;
    console.log('\n=== Gmail Poller Summary ===');
    console.log(`   Query: ${result.query}`);
    console.log(`   Emails found: ${result.emailsFound}`);
    console.log(`   Emails processed: ${result.emailsProcessed}`);
    console.log(`   Errors: ${result.errors.length}`);
    console.log(`   Duration: ${duration}ms`);
    console.log(`   Last checked: ${result.lastChecked}`);

    return result;

  } catch (error: any) {
    const errorMsg = error.message || 'Unknown error';
    console.error('❌ Fatal error:', errorMsg);
    console.error('Stack:', error.stack);

    result.errors.push(errorMsg);
    result.success = false;

    // Re-throw for Lambda to mark as failed
    throw error;
  }
};

/**
 * Local testing function
 * Run with: npx ts-node src/gmail-oauth/poller-lambda.ts
 */
if (require.main === module) {
  console.log('Running Gmail Poller locally...\n');
  
  // Create a minimal mock Context for local testing
  const mockContext: Context = {
    awsRequestId: 'local-test-request-id',
    callbackWaitsForEmptyEventLoop: false,
    functionName: 'gmail-poller-local',
    functionVersion: '$LATEST',
    invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:gmail-poller-local',
    memoryLimitInMB: '256',
    getRemainingTimeInMillis: () => 30000,
    logGroupName: '/aws/lambda/gmail-poller-local',
    logStreamName: '2025/11/19/[$LATEST]test',
    done: () => {},
    fail: () => {},
    succeed: () => {},
  };
  
  handler({}, mockContext)
    .then((result) => {
      console.log('\n✅ Poller completed:', result);
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Poller failed:', error);
      process.exit(1);
    });
}

