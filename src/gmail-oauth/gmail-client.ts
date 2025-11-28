/**
 * Gmail OAuth2 Client for AWS Lambda
 * 
 * A production-ready Gmail client using OAuth2 for personal Gmail accounts.
 * Handles token refresh automatically.
 * 
 * How Token Refresh Works:
 * - Access tokens expire after 1 hour
 * - Refresh tokens are long-lived (until revoked)
 * - When access token expires, we use refresh_token to get a new access_token
 * - googleapis library handles this automatically via refreshAccessToken()
 * 
 * Credential Loading Priority:
 * 1. Config object passed to constructor
 * 2. Environment variables (GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN)
 * 3. Files: client_secret.json and gmail_tokens.json (for local development)
 * 
 * Usage in Lambda:
 *   import { GmailClient } from './gmail-client';
 *   const client = new GmailClient();
 *   const emails = await client.listEmails('is:unread', 10);
 */

import { google, gmail_v1 } from 'googleapis';
import * as fs from 'fs';
import * as path from 'path';

interface GmailClientConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export class GmailClient {
  private oauth2Client: any;
  private gmail!: gmail_v1.Gmail; // Initialized in initializeClient()

  constructor(config?: GmailClientConfig) {
    // This will be initialized asynchronously
    // For backward compatibility, we'll load synchronously first, then try async
    this.initializeSync(config);
  }

  /**
   * Initialize synchronously (for backward compatibility)
   */
  private initializeSync(config?: GmailClientConfig) {
    // Load credentials with fallback priority:
    // 1. Config object
    // 2. Environment variables
    // 3. Files (for local development)
    
    let clientId = config?.clientId || process.env.GMAIL_CLIENT_ID;
    let clientSecret = config?.clientSecret || process.env.GMAIL_CLIENT_SECRET;
    let refreshToken = config?.refreshToken || process.env.GMAIL_REFRESH_TOKEN;

    // If not in env vars, try loading from files
    if (!clientId || !clientSecret || !refreshToken) {
      const credentials = this.loadFromFiles();
      clientId = clientId || credentials.clientId;
      clientSecret = clientSecret || credentials.clientSecret;
      refreshToken = refreshToken || credentials.refreshToken;
    }

    if (!clientId || !clientSecret || !refreshToken) {
      throw new Error(
        'Missing Gmail OAuth2 credentials. Provide via:\n' +
        '1. Config object: new GmailClient({ clientId, clientSecret, refreshToken })\n' +
        '2. Environment variables: GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN\n' +
        '3. AWS Secrets Manager: gmail-oauth-credentials and gmail-oauth-tokens\n' +
        '4. Files: client_secret.json and gmail_tokens.json in project root'
      );
    }

    this.initializeClient(clientId, clientSecret, refreshToken);
  }

  /**
   * Initialize asynchronously from Secrets Manager (call this after construction if needed)
   */
  async initializeFromSecretsManager(): Promise<void> {
    try {
      const { getGmailOAuthCredentials, getGmailTokens } = await import('../utils/secretsManager');
      
      const oauthCreds = await getGmailOAuthCredentials();
      const tokens = await getGmailTokens();

      if (oauthCreds && tokens?.refresh_token) {
        this.initializeClient(
          oauthCreds.client_id,
          oauthCreds.client_secret,
          tokens.refresh_token
        );
        console.log('✓ Loaded Gmail OAuth credentials from Secrets Manager');
        return;
      }
    } catch (error) {
      console.warn('Could not load from Secrets Manager, using existing credentials:', error);
    }
  }

  /**
   * Load credentials from files (for local development)
   * Tries to load from client_secret.json and gmail_tokens.json
   */
  private loadFromFiles(): { clientId: string; clientSecret: string; refreshToken: string } {
    const clientSecretPath = path.join(process.cwd(), 'client_secret.json');
    const tokensPath = path.join(process.cwd(), 'gmail_tokens.json');

    let clientId = '';
    let clientSecret = '';
    let refreshToken = '';

    // Load client_secret.json
    if (fs.existsSync(clientSecretPath)) {
      try {
        const content = fs.readFileSync(clientSecretPath, 'utf8');
        const credentials = JSON.parse(content);
        const installed = credentials.installed || credentials.web;
        if (installed) {
          clientId = installed.client_id || '';
          clientSecret = installed.client_secret || '';
        }
        console.log('✓ Loaded credentials from client_secret.json');
      } catch (error) {
        console.warn('⚠ Could not parse client_secret.json:', error);
      }
    }

    // Load gmail_tokens.json
    if (fs.existsSync(tokensPath)) {
      try {
        const content = fs.readFileSync(tokensPath, 'utf8');
        const tokens = JSON.parse(content);
        refreshToken = tokens.refresh_token || '';
        console.log('✓ Loaded refresh token from gmail_tokens.json');
      } catch (error) {
        console.warn('⚠ Could not parse gmail_tokens.json:', error);
      }
    }

    return { clientId, clientSecret, refreshToken };
  }

  /**
   * Initialize OAuth2 client and Gmail API client
   * 
   * How it works:
   * 1. Create OAuth2 client with client_id and client_secret
   * 2. Set credentials with refresh_token
   * 3. googleapis automatically refreshes access_token when needed
   */
  private initializeClient(clientId: string, clientSecret: string, refreshToken: string): void {
    this.oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      'http://localhost' // Redirect URI (not used for refresh token flow)
    );

    // Set credentials with refresh token
    // The library will automatically refresh access_token when it expires
    this.oauth2Client.setCredentials({
      refresh_token: refreshToken,
    });

    // Initialize Gmail API
    this.gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });
  }

  /**
   * List emails matching a query
   * 
   * Gmail Search Query Examples:
   * - "is:unread" - Unread emails only
   * - "is:read" - Read emails
   * - "from:example@gmail.com" - Emails from specific sender
   * - "subject:test" - Emails with "test" in subject
   * - "newer_than:7d" - Emails newer than 7 days
   * - "after:2024/1/1" - Emails after a date
   * - "before:2024/12/31" - Emails before a date
   * - "has:attachment" - Emails with attachments
   * - Combine: "is:unread from:example@gmail.com newer_than:1d"
   * 
   * @param query - Gmail search query
   * @param maxResults - Maximum number of results (default: 10)
   * @returns Array of message summaries with id, threadId
   */
  async listEmails(query?: string, maxResults: number = 10): Promise<gmail_v1.Schema$Message[]> {
    try {
      const response = await this.gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults,
      });

      return response.data.messages || [];
    } catch (error: any) {
      // Handle token refresh errors
      if (error.message?.includes('invalid_grant') || error.message?.includes('invalid_token')) {
        throw new Error(
          'Refresh token expired or invalid. Run token-generator.ts again to get a new refresh token.'
        );
      }
      throw new Error(`Failed to list emails: ${error.message}`);
    }
  }

  /**
   * Read a specific email by message ID
   * 
   * @param messageId - Gmail message ID
   * @returns Full message object with headers, payload, snippet, etc.
   */
  async readEmail(messageId: string): Promise<gmail_v1.Schema$Message> {
    try {
      const response = await this.gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full', // Get full message with body
      });

      return response.data;
    } catch (error: any) {
      throw new Error(`Failed to read email: ${error.message}`);
    }
  }

  /**
   * Mark email as read
   * 
   * @param messageId - Gmail message ID
   */
  async markAsRead(messageId: string): Promise<void> {
    try {
      await this.gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: {
          removeLabelIds: ['UNREAD'],
        },
      });
    } catch (error: any) {
      throw new Error(`Failed to mark email as read: ${error.message}`);
    }
  }

  /**
   * Wrap text at word boundaries to prevent email clients from wrapping lines in awkward places
   * @param text - The text to wrap
   * @param lineLength - Maximum line length (default: 120)
   * @returns Text with soft line breaks at word boundaries
   */
  private wrapEmailBody(text: string, lineLength: number = 500): string {
    console.log('wrapEmailBody - Input:', {
      lineLength,
      textLength: text.length,
      preview: text.substring(0, 200).replace(/\n/g, '\\n').replace(/\r/g, '\\r'),
      lineBreaks: (text.match(/\n/g) || []).length,
      carriageReturns: (text.match(/\r/g) || []).length,
    });
    
    if (!text || text.length <= lineLength) {
      return text;
    }

    // Step 1: Normalize all line endings to \n
    let normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    
    // Step 2: Identify paragraph breaks (double or more line breaks)
    // Replace multiple line breaks with a unique marker
    const PARA_MARKER = '___PARAGRAPH_BREAK___';
    normalized = normalized.replace(/\n{2,}/g, PARA_MARKER);
    
    // Step 3: Remove ALL remaining single line breaks
    normalized = normalized.replace(/\n/g, ' ');
    
    // Step 4: Split by paragraph markers
    const paragraphs = normalized.split(PARA_MARKER);
    
    const wrappedParagraphs = paragraphs.map((paragraph, index) => {
      // Clean up spaces
      let cleaned = paragraph.replace(/[ \t]+/g, ' ').trim();
      
      if (!cleaned) {
        return '';
      }
      
      if (cleaned.length <= lineLength) {
        return cleaned;
      }

      // Wrap at word boundaries
      const words = cleaned.split(/\s+/);
      const lines: string[] = [];
      let currentLine = '';

      for (const word of words) {
        // If word itself is longer than line length, add it on its own line
        if (word.length > lineLength) {
          if (currentLine) {
            lines.push(currentLine.trim());
            currentLine = '';
          }
          lines.push(word);
          continue;
        }

        // Check if adding this word would exceed line length
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        if (testLine.length <= lineLength) {
          currentLine = testLine;
        } else {
          // Current line is full, start a new one
          if (currentLine) {
            lines.push(currentLine.trim());
          }
          currentLine = word;
        }
      }

      // Add the last line if it exists
      if (currentLine) {
        lines.push(currentLine.trim());
      }

      const result = lines.join('\n');
      
      // Log first paragraph wrapping for debugging
      if (index === 0) {
        const firstLineLength = result.split('\n')[0]?.length || 0;
        console.log('wrapEmailBody - First paragraph wrapped:', {
          originalLength: cleaned.length,
          wrappedLines: lines.length,
          firstLineLength,
          firstLinePreview: result.substring(0, 100),
        });
      }
      
      return result;
    });

    const finalResult = wrappedParagraphs.filter(p => p.length > 0).join('\n\n');
    
    console.log('wrapEmailBody - Output:', {
      originalLength: text.length,
      finalLength: finalResult.length,
      paragraphs: wrappedParagraphs.length,
      lineBreaks: (finalResult.match(/\n/g) || []).length,
      sampleLineLengths: finalResult.split('\n').slice(0, 5).map(line => line.length),
    });
    
    return finalResult;
  }

  /**
   * Send an email
   * 
   * How Gmail Email Sending Works:
   * - Gmail API requires emails to be formatted as RFC 2822 messages
   * - The message must be base64url encoded
   * - Headers include: From, To, Subject, Content-Type
   * - Body is sent as plain text (text/plain)
   * - For threading: Include In-Reply-To and References headers
   * - Body is wrapped at 500 characters to prevent client-side wrapping
   * 
   * @param to - Recipient email address
   * @param subject - Email subject
   * @param body - Email body (plain text only)
   * @param from - Optional sender email (defaults to authenticated user)
   * @param inReplyTo - Optional Message-ID of the email being replied to (for threading)
   * @param references - Optional References header value (for threading chain)
   * @returns Message ID of sent email
   */
  async sendEmail(
    to: string, 
    subject: string, 
    body: string, 
    from?: string,
    inReplyTo?: string,
    references?: string
  ): Promise<string> {
    try {
      // Get the authenticated user's email if 'from' is not provided
      let fromEmail = from;
      console.log('sendEmail - from parameter:', from);
      if (!fromEmail) {
        const profile = await this.gmail.users.getProfile({ userId: 'me' });
        fromEmail = profile.data.emailAddress || 'me';
        console.log('sendEmail - using authenticated user email:', fromEmail);
      } else {
        console.log('sendEmail - using provided from email:', fromEmail);
      }

      // Create RFC 2822 formatted email message
      // Format: headers + blank line + body
      const messageHeaders: string[] = [
        `From: HR Support <${fromEmail}>`,\
        `To: ${to}`,
        `Subject: ${subject}`,
        `Content-Type: text/html; charset=utf-8`,
        `Content-Transfer-Encoding: 7bit`,
      ];

      // Add threading headers if provided
      if (inReplyTo) {
        messageHeaders.push(`In-Reply-To: ${inReplyTo}`);
      }
      if (references) {
        messageHeaders.push(`References: ${references}`);
      }

      // Send body as-is without any wrapping or formatting
      const message = [
        ...messageHeaders,
        '', // Blank line between headers and body
        body,
      ].join('\n');

      // Log the From header to verify format
      console.log('sendEmail - From header:', messageHeaders.find(h => h.startsWith('From:')));

      // Encode message to base64url format
      // Base64url uses '-' instead of '+' and '_' instead of '/'
      const encodedMessage = Buffer.from(message)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, ''); // Remove padding

      // Send email via Gmail API
      const response = await this.gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: encodedMessage,
        },
      });

      return response.data.id || '';
    } catch (error: any) {
      throw new Error(`Failed to send email: ${error.message}`);
    }
  }

  /**
   * Decode base64 email body
   * 
   * How Gmail Base64 Encoding Works:
   * - Gmail API returns email body as base64url encoded strings
   * - Base64url uses '-' instead of '+' and '_' instead of '/'
   * - We need to decode it to get the actual email content
   * - Email body can be in multiple parts (text/plain, text/html, attachments)
   * 
   * @param message - Gmail message object
   * @returns Object with text and html body content
   */
  decodeBase64Email(message: gmail_v1.Schema$Message): { text: string; html: string; attachments: number } {
    const result = { text: '', html: '', attachments: 0 };

    if (!message.payload) return result;

    /**
     * Recursively extract body from message parts
     * Gmail messages can have nested structure:
     * - multipart/mixed (with attachments)
     * - multipart/alternative (text + html)
     * - text/plain or text/html (simple)
     */
    const extractBody = (part: gmail_v1.Schema$MessagePart): void => {
      if (part.body?.data) {
        // Decode base64url to UTF-8
        // Base64url uses '-' and '_' instead of '+' and '/'
        const decoded = Buffer.from(
          part.body.data.replace(/-/g, '+').replace(/_/g, '/'),
          'base64'
        ).toString('utf-8');

        if (part.mimeType === 'text/html') {
          result.html = decoded;
        } else if (part.mimeType === 'text/plain') {
          result.text = decoded;
        } else if (part.filename) {
          // This is an attachment
          result.attachments++;
        }
      }

      // Recursively process nested parts
      if (part.parts) {
        part.parts.forEach(extractBody);
      }
    };

    extractBody(message.payload);
    return result;
  }

  /**
   * Get email headers as a map
   * 
   * @param message - Gmail message object
   * @returns Map of header names (lowercase) to values
   */
  getEmailHeaders(message: gmail_v1.Schema$Message): Record<string, string> {
    const headers: Record<string, string> = {};
    
    if (message.payload?.headers) {
      message.payload.headers.forEach((header) => {
        if (header.name && header.value) {
          headers[header.name.toLowerCase()] = header.value;
        }
      });
    }

    return headers;
  }

  /**
   * Sanitize email body by removing HTML tags and signatures
   * 
   * @param body - Email body text (can be HTML or plain text)
   * @returns Cleaned plain text without HTML and signatures
   */
  sanitizeEmailBody(body: string): string {
    if (!body) return '';

    let sanitized = body;

    // Remove HTML tags
    // Replace common HTML entities first
    sanitized = sanitized
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'");

    // Remove HTML tags (including script, style, etc.)
    sanitized = sanitized.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    sanitized = sanitized.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    sanitized = sanitized.replace(/<[^>]+>/g, '');

    // Decode HTML entities
    sanitized = sanitized.replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec));
    sanitized = sanitized.replace(/&[a-z]+;/gi, '');

    // Remove email signatures
    // Common signature patterns:
    // - Lines starting with "Sent from", "Sent from my", etc.
    // - Lines starting with "Best regards", "Regards", "Thanks", etc.
    // - Lines with "---" or "___" separators
    // - Lines with phone numbers, addresses
    // - Lines starting with common signature closings
    
    const lines = sanitized.split('\n');
    const signatureStartPatterns = [
      /^[-=_]{3,}/,                    // --- or ___ separators
      /^Sent from/i,                    // Sent from...
      /^Sent from my/i,                 // Sent from my iPhone...
      /^Get Outlook/i,                  // Get Outlook for...
      /^Best regards/i,                 // Best regards,
      /^Regards/i,                      // Regards,
      /^Thanks/i,                        // Thanks,
      /^Thank you/i,                    // Thank you,
      /^Sincerely/i,                     // Sincerely,
      /^Yours/i,                         // Yours truly,
      /^On .* wrote:/i,                 // On [date] [name] wrote:
      /^From:.*Sent:.*To:.*Subject:/i,  // Email headers in body
      /^This email was sent to/i,       // Email footer
      /^You received this email/i,       // Email footer
      /^Confidentiality Notice/i,       // Legal notices
      /^Disclaimer:/i,                   // Disclaimer:
      /^CONFIDENTIALITY/i,               // CONFIDENTIALITY notice
    ];

    let signatureStartIndex = -1;
    
    // Find where signature starts
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Check for signature patterns
      for (const pattern of signatureStartPatterns) {
        if (pattern.test(line)) {
          signatureStartIndex = i;
          break;
        }
      }
      
      // Check for common signature indicators
      if (line.match(/^[A-Z][a-z]+ [A-Z][a-z]+$/)) {
        // Might be a name signature (e.g., "John Doe")
        // Check if next lines look like contact info
        if (i + 1 < lines.length) {
          const nextLine = lines[i + 1].trim();
          if (nextLine.match(/^[\w\s@.-]+@[\w.-]+\.\w+/) || // Email
              nextLine.match(/^\+?[\d\s()-]+$/) ||          // Phone
              nextLine.match(/^www\./i)) {                  // Website
            signatureStartIndex = i;
            break;
          }
        }
      }
      
      if (signatureStartIndex !== -1) break;
    }

    // Remove signature if found
    if (signatureStartIndex !== -1) {
      sanitized = lines.slice(0, signatureStartIndex).join('\n');
    }

    // Clean up whitespace
    sanitized = sanitized
      .replace(/\n{3,}/g, '\n\n')  // Multiple newlines to double
      .replace(/[ \t]+/g, ' ')      // Multiple spaces to single
      .trim();

    return sanitized;
  }
}
