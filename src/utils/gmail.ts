import { google } from 'googleapis';
import { SendEmailRequest } from '../types/email';

// Initialize Gmail client
let gmailClient: any = null;

/**
 * Initialize Gmail client with service account or OAuth2 credentials
 */
export const getGmailClient = () => {
  if (gmailClient) {
    return gmailClient;
  }

  const credentials = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  const userEmail = process.env.GOOGLE_WORKSPACE_EMAIL;

  if (!credentials) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY must be set');
  }

  if (!userEmail) {
    throw new Error('GOOGLE_WORKSPACE_EMAIL must be set');
  }

  let key: any = null;
  
  try {
    // Parse service account key
    // In Lambda, we expect JSON string. For local dev, can be file path
    if (credentials.startsWith('{')) {
      // JSON string
      try {
        key = JSON.parse(credentials);
      } catch (parseError) {
        console.error('Failed to parse JSON string. First 100 chars:', credentials.substring(0, 100));
        throw new Error(`Invalid JSON in GOOGLE_SERVICE_ACCOUNT_KEY: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`);
      }
    } else if (credentials.startsWith('./') || credentials.startsWith('/') || credentials.includes('\\') || credentials.includes(':')) {
      // File path (for local development)
      // Check if it's a Windows path (C:\) or relative path
      try {
        const fs = require('fs');
        const path = require('path');
        
        // Resolve the path (handles relative paths)
        const resolvedPath = path.resolve(credentials);
        console.log(`Attempting to read service account key from file: ${resolvedPath}`);
        
        if (!fs.existsSync(resolvedPath)) {
          throw new Error(`Service account key file not found: ${resolvedPath}`);
        }
        
        const keyContent = fs.readFileSync(resolvedPath, 'utf8');
        console.log(`Successfully read file, length: ${keyContent.length} characters`);
        
        // Trim whitespace that might cause issues
        const trimmedContent = keyContent.trim();
        
        try {
          key = JSON.parse(trimmedContent);
        } catch (parseError) {
          console.error('Failed to parse JSON from file. First 100 chars:', trimmedContent.substring(0, 100));
          throw new Error(`Invalid JSON in service account key file: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`);
        }
      } catch (fileError) {
        const errorMessage = fileError instanceof Error ? fileError.message : 'Unknown error';
        throw new Error(`Failed to read service account key file: ${errorMessage}`);
      }
    } else {
      // Try parsing as JSON string (might not start with {)
      // Could be a JSON string without leading whitespace or escaped JSON
      try {
        // Trim and try parsing
        const trimmed = credentials.trim();
        key = JSON.parse(trimmed);
      } catch (parseError) {
        console.error('Failed to parse as JSON string. First 100 chars:', credentials.substring(0, 100));
        throw new Error(`GOOGLE_SERVICE_ACCOUNT_KEY must be a valid JSON string or file path. Parse error: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`);
      }
    }

    // Validate required fields
    if (!key.client_email || !key.private_key) {
      throw new Error('Service account key must contain client_email and private_key');
    }

    // Create JWT client for service account
    const jwtClient = new google.auth.JWT(
      key.client_email,
      undefined,
      key.private_key,
      ['https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/gmail.readonly'],
      userEmail // The email to impersonate (must be in Google Workspace)
    );

    console.log('Gmail client JWT configured:', {
      serviceAccountEmail: key.client_email,
      clientId: key.client_id,
      impersonatingUser: userEmail,
      scopes: ['https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/gmail.readonly'],
    });

    gmailClient = google.gmail({ version: 'v1', auth: jwtClient });
    return gmailClient;
  } catch (error) {
    console.error('Error initializing Gmail client:', error);
    
    // Provide helpful error message for domain-wide delegation issues
    if (error instanceof Error && (error.message.includes('unauthorized_client') || error.message.includes('unauthorized'))) {
      let serviceAccountEmail = 'unknown';
      let clientId = 'unknown';
      
      try {
        // Try to get service account info from the parsed key
        if (key && key.client_email) {
          serviceAccountEmail = key.client_email;
          clientId = key.client_id || 'unknown';
        }
      } catch (e) {
        // If we can't get it, that's okay
      }
      
      throw new Error(
        `\n❌ Domain-wide delegation not configured!\n\n` +
        `Service Account: ${serviceAccountEmail}\n` +
        `Client ID: ${clientId}\n` +
        `Workspace Email: ${userEmail}\n\n` +
        `To fix this issue:\n` +
        `1. Go to Google Cloud Console → IAM & Admin → Service Accounts\n` +
        `2. Find service account: ${serviceAccountEmail}\n` +
        `3. Enable "Domain-wide delegation" and note the Client ID: ${clientId}\n` +
        `4. Go to Google Workspace Admin Console → Security → API Controls → Domain-wide Delegation\n` +
        `5. Add Client ID: ${clientId}\n` +
        `6. Grant these OAuth scopes:\n` +
        `   - https://www.googleapis.com/auth/gmail.send\n` +
        `   - https://www.googleapis.com/auth/gmail.readonly\n` +
        `7. Wait 5-10 minutes for changes to propagate\n\n` +
        `See DOMAIN_WIDE_DELEGATION_SETUP.md for detailed step-by-step instructions.\n\n` +
        `Original error: ${error.message}`
      );
    }
    
    throw new Error(`Failed to initialize Gmail client: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

/**
 * Get default sender email from environment
 */
export const getDefaultSenderEmail = (): string => {
  const email = process.env.GOOGLE_WORKSPACE_EMAIL;
  if (!email) {
    throw new Error('GOOGLE_WORKSPACE_EMAIL must be set');
  }
  return email;
};

/**
 * Create email message in RFC 2822 format
 */
const createEmailMessage = (request: SendEmailRequest): string => {
  const from = request.from || getDefaultSenderEmail();
  const to = Array.isArray(request.to) ? request.to.join(', ') : request.to;
  const cc = request.cc ? (Array.isArray(request.cc) ? request.cc.join(', ') : request.cc) : undefined;
  const bcc = request.bcc ? (Array.isArray(request.bcc) ? request.bcc.join(', ') : request.bcc) : undefined;

  let message = `From: ${from}\r\n`;
  message += `To: ${to}\r\n`;
  if (cc) message += `Cc: ${cc}\r\n`;
  if (bcc) message += `Bcc: ${bcc}\r\n`;
  message += `Subject: ${request.subject}\r\n`;

  // Handle attachments if present
  if (request.attachments && request.attachments.length > 0) {
    const boundary = `boundary_${Date.now()}`;
    message += `Content-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n`;
    
    // Add body part
    message += `--${boundary}\r\n`;
    message += `Content-Type: ${request.html ? 'text/html' : 'text/plain'}; charset=utf-8\r\n\r\n`;
    message += `${request.body}\r\n\r\n`;

    // Add attachments
    for (const attachment of request.attachments) {
      message += `--${boundary}\r\n`;
      message += `Content-Type: ${attachment.contentType || 'application/octet-stream'}\r\n`;
      message += `Content-Disposition: attachment; filename="${attachment.filename}"\r\n`;
      message += 'Content-Transfer-Encoding: base64\r\n\r\n';
      message += `${attachment.content}\r\n\r\n`;
    }
    message += `--${boundary}--\r\n`;
  } else {
    // Simple email without attachments
    if (request.html) {
      message += 'Content-Type: text/html; charset=utf-8\r\n';
    } else {
      message += 'Content-Type: text/plain; charset=utf-8\r\n';
    }
    message += `\r\n${request.body}`;
  }

  return message;
};

/**
 * Send email using Gmail API
 */
export const sendEmail = async (request: SendEmailRequest): Promise<string> => {
  const gmail = getGmailClient();
  const message = createEmailMessage(request);

  // Encode message in base64url format (RFC 4648)
  const encodedMessage = Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  try {
    const response = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage,
      },
    });

    return response.data.id || '';
  } catch (error: any) {
    console.error('Error sending email:', error);
    throw new Error(`Failed to send email: ${error.message}`);
  }
};

/**
 * Get email message by ID
 */
export const getEmailMessage = async (messageId: string) => {
  const gmail = getGmailClient();
  
  try {
    const response = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full',
    });

    return response.data;
  } catch (error: any) {
    console.error('Error getting email message:', error);
    throw new Error(`Failed to get email message: ${error.message}`);
  }
};

/**
 * List recent emails
 */
export const listEmails = async (maxResults: number = 10, query?: string) => {
  const gmail = getGmailClient();
  
  try {
    const response = await gmail.users.messages.list({
      userId: 'me',
      maxResults,
      q: query,
    });

    return response.data.messages || [];
  } catch (error: any) {
    console.error('Error listing emails:', error);
    
    // Check for domain-wide delegation errors
    if (error?.response?.data?.error === 'unauthorized_client' || 
        error?.message?.includes('unauthorized_client')) {
      throw new Error(
        `Domain-wide delegation not configured. ` +
        `The service account is not authorized to access Gmail API. ` +
        `Please follow the setup instructions in DOMAIN_WIDE_DELEGATION_SETUP.md\n` +
        `Service Account: ${process.env.GOOGLE_SERVICE_ACCOUNT_KEY ? 'Check your service account JSON' : 'Not configured'}\n` +
        `Workspace Email: ${process.env.GOOGLE_WORKSPACE_EMAIL || 'Not configured'}\n` +
        `Original error: ${error.message || error?.response?.data?.error_description || 'Unknown error'}`
      );
    }
    
    throw new Error(`Failed to list emails: ${error.message || error?.response?.data?.error_description || 'Unknown error'}`);
  }
};

