/**
 * Gmail Poller Lambda Handler
 * 
 * AWS Lambda function that polls Gmail inbox every 1 minute via EventBridge schedule.
 * 
 * Features:
 * - Polls for all unread emails (no sender filter)
 * - Processes each email
 * - Marks emails as read after processing
 * - Automatic token refresh
 * - Error handling and retry logic
 * 
 * Configuration:
 * - MAX_RESULTS: Maximum emails to process per run (default: 5)
 * - SENDER_EMAIL: Optional - Filter emails by sender (if not set, processes all unread emails)
 * - GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN: OAuth2 credentials
 * 
 * Deployment:
 * - Set environment variables in Lambda
 * - Schedule via EventBridge: rate(1 minute)
 */

import { APIGatewayProxyEvent, Context } from 'aws-lambda';
import { GmailClient } from './gmail-client';

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
 * This function is triggered every 1 minute by EventBridge schedule.
 * It can also be invoked manually via API Gateway for testing.
 */
export const handler = async (
  event: APIGatewayProxyEvent | any,
  context: Context
): Promise<PollerResult> => {
  const startTime = Date.now();
  console.log('=== Gmail Poller Lambda Started ===');
  console.log('Event:', JSON.stringify(event, null, 2));
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

  try {
    // Initialize Gmail client
    // It will automatically refresh tokens if needed
    const gmailClient = new GmailClient();
    console.log('✓ Gmail client initialized');

    // Configuration from environment variables
    // Maximum emails to process per run (default: 5)
    const maxResults = parseInt(process.env.MAX_RESULTS || '5', 10);
    
    // Optional: Filter by sender email (if SENDER_EMAIL is set)
    const senderEmail = process.env.SENDER_EMAIL;

    // Build query - add sender filter only if SENDER_EMAIL is configured
    let query = 'is:unread';
    if (senderEmail) {
      query = `from:${senderEmail} is:unread`;
    }

    console.log(`📧 Polling Configuration:`);
    if (senderEmail) {
      console.log(`   Sender Filter: ${senderEmail}`);
      console.log(`   Query: "${query}"`);
    } else {
      console.log(`   Sender Filter: None (all senders)`);
      console.log(`   Query: "${query}"`);
    }
    console.log(`   Max Results: ${maxResults}`);

    // List unread emails (filtered or all)
    if (senderEmail) {
      console.log(`\n📬 Searching for unread emails from: ${senderEmail}...`);
    } else {
      console.log(`\n📬 Searching for all unread emails...`);
    }
    const emailList = await gmailClient.listEmails(query, maxResults);
    result.emailsFound = emailList.length;

    if (senderEmail) {
      console.log(`✓ Found ${emailList.length} unread email(s) from ${senderEmail}`);
    } else {
      console.log(`✓ Found ${emailList.length} unread email(s)`);
    }

    if (emailList.length === 0) {
      result.success = true;
      console.log('✓ No unread emails to process');
      return result;
    }

    // Process each email
    for (let i = 0; i < emailList.length; i++) {
      const emailItem = emailList[i];
      if (!emailItem.id) {
        console.warn(`⚠ Email at index ${i} has no ID, skipping`);
        continue;
      }

      try {
        console.log(`\n📖 Processing email ${i + 1}/${emailList.length} (ID: ${emailItem.id})`);

        // Read full email details
        const email = await gmailClient.readEmail(emailItem.id);

        // Extract headers
        const headers = gmailClient.getEmailHeaders(email);
        const from = headers.from || 'Unknown';
        const subject = headers.subject || '(No Subject)';
        const date = headers.date || 'Unknown';

        console.log(`   From: ${from}`);
        console.log(`   Subject: ${subject}`);
        console.log(`   Date: ${date}`);

        // Extract sender email address from "From" header
        // Format can be: "Name <email@example.com>" or "email@example.com"
        let senderEmail = '';
        const fromMatch = from.match(/<([^>]+)>/) || from.match(/([\w.-]+@[\w.-]+\.\w+)/);
        if (fromMatch) {
          senderEmail = fromMatch[1] || fromMatch[0];
        } else {
          // If no email found, try to use the full "from" string
          senderEmail = from.trim();
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

        // Send acknowledgment email to sender
        if (senderEmail && senderEmail.includes('@')) {
          try {
            const ackSubject = `Re: ${subject}`;
            const ackBody = `Thank you for your email.\n\nThis is an automated acknowledgment that your email has been received and processed.\n\nOriginal Subject: ${subject}\nReceived: ${date}\n\n---\nThis is an automated response. Please do not reply to this email.`;
            
            console.log(`\n📧 Sending acknowledgment email to: ${senderEmail}`);
            const sentMessageId = await gmailClient.sendEmail(senderEmail, ackSubject, ackBody);
            console.log(`   ✓ Acknowledgment sent successfully (Message ID: ${sentMessageId})`);
          } catch (ackError: any) {
            const errorMsg = `Failed to send acknowledgment: ${ackError.message}`;
            console.error(`   ⚠ ${errorMsg}`);
            result.errors.push(errorMsg);
            // Continue processing even if acknowledgment fails
          }
        } else {
          console.warn(`   ⚠ Could not extract valid sender email from: "${from}"`);
        }

        // Process email here
        // TODO: Add your email processing logic here
        // Example: await processEmail(email, headers, body);
        
        // Mark email as read after processing
        // This uses the gmail.modify scope to remove the UNREAD label
        await gmailClient.markAsRead(emailItem.id);
        console.log(`   ✓ Marked as read`);

        result.emailsProcessed++;

        // Log email details for monitoring
        console.log(`   ✓ Email processed successfully`);

      } catch (emailError: any) {
        const errorMsg = `Failed to process email ${emailItem.id}: ${emailError.message}`;
        console.error(`   ❌ ${errorMsg}`);
        result.errors.push(errorMsg);
        // Continue processing other emails even if one fails
      }
    }

    result.success = true;
    result.query = query;
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

