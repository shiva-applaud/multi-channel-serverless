/**
 * Session ID Storage Utility
 * 
 * Unified session management for SMS, WhatsApp, and Email channels.
 * Stores session IDs in DynamoDB for persistence across Lambda invocations.
 * 
 * SMS/WhatsApp Sessions:
 * - Format: phone number + session version (e.g., "sms-1234567890-v1")
 * - Check activity time against SESSION_GAP_SMS_WA env var
 * - If gap exceeds SESSION_GAP_SMS_WA, create new session; otherwise use same session
 * - Handle "new session" command to create new session and end existing one
 * - Update activity timestamp on each message
 * 
 * Email Sessions:
 * - Format: from email + session version (e.g., "email-user@example.com-v1")
 * - If subject and from address are same, use same session
 * - If different, use different session
 * - SESSION_GAP_MAIL env var available for future time-based expiration
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';

const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'eu-central-1',
});

const docClient = DynamoDBDocumentClient.from(dynamoClient);

const TABLE_NAME = process.env.SESSION_TABLE_NAME || 'session-store';
const SESSION_GAP_SMS_WA = parseInt(process.env.SESSION_GAP_SMS_WA || '86400000', 10); // Default: 1 day (86400000 ms = 24 hours) for SMS/WhatsApp
const SESSION_GAP_MAIL = parseInt(process.env.SESSION_GAP_MAIL || '604800000', 10); // Default: 1 week (604800000 ms = 7 days) for Email

// ============================================================================
// SMS/WhatsApp Session Management
// ============================================================================

interface SmsWhatsAppSessionRecord {
  sessionKey: string; // Format: "sms-{phone}" or "whatsapp-{phone}"
  sessionId: string; // Format: "{phone}-v{version}"
  channel: 'sms' | 'whatsapp';
  phoneNumber: string;
  sessionVersion: number;
  createdAt: number;
  lastActivity: number;
  isActive: boolean;
}

/**
 * Normalize phone number for session key
 */
function normalizePhoneNumber(phoneNumber: string): string {
  // Remove whatsapp: prefix, spaces, dashes, parentheses, and + sign
  return phoneNumber
    .replace(/^whatsapp:/i, '')
    .replace(/[\s\-\(\)\+]/g, '')
    .toLowerCase();
}

/**
 * Generate session key for SMS/WhatsApp
 */
function generateSmsWhatsAppSessionKey(channel: 'sms' | 'whatsapp', phoneNumber: string): string {
  const normalized = normalizePhoneNumber(phoneNumber);
  return `${channel}-${normalized}`;
}

/**
 * Generate session ID for SMS/WhatsApp (phone number + session version)
 */
function generateSmsWhatsAppSessionId(phoneNumber: string, sessionVersion: number): string {
  const normalized = normalizePhoneNumber(phoneNumber);
  return `${normalized}-v${sessionVersion}`;
}

/**
 * Get or create session ID for SMS/WhatsApp
 * Checks activity time against SESSION_GAP_SMS_WA to determine if new session is needed
 */
export async function getOrCreateSmsWhatsAppSession(
  channel: 'sms' | 'whatsapp',
  phoneNumber: string,
  messageText?: string
): Promise<string> {
  // Validate phone number
  if (!phoneNumber || !phoneNumber.trim()) {
    throw new Error('Phone number is required for SMS/WhatsApp session');
  }
  
  const sessionKey = generateSmsWhatsAppSessionKey(channel, phoneNumber);
  const now = Date.now();
  
  // Check if user wants to start a new session
  const wantsNewSession = messageText && 
    messageText.trim().toLowerCase().includes('new session');
  
  try {
    // Get existing session (use threadKey as DynamoDB key name)
    const getResult = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { threadKey: sessionKey },
    }));
    
    if (getResult.Item) {
      const existingSession = getResult.Item as SmsWhatsAppSessionRecord;
      
      // Validate required fields exist
      if (typeof existingSession.sessionVersion !== 'number' || 
          typeof existingSession.lastActivity !== 'number') {
        console.warn('Existing session missing required fields, creating new session');
        // Fall through to create new session below
      } else {
        // If user explicitly wants new session, create one
        if (wantsNewSession) {
          // Mark existing session as inactive
          await docClient.send(new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { threadKey: sessionKey },
            UpdateExpression: 'SET isActive = :inactive',
            ExpressionAttributeValues: {
              ':inactive': false,
            },
          }));
          
          // Create new session
          const newVersion = existingSession.sessionVersion + 1;
          const newSessionId = generateSmsWhatsAppSessionId(phoneNumber, newVersion);
          
          const newSession: SmsWhatsAppSessionRecord = {
            sessionKey,
            sessionId: newSessionId,
            channel,
            phoneNumber: normalizePhoneNumber(phoneNumber),
            sessionVersion: newVersion,
            createdAt: now,
            lastActivity: now,
            isActive: true,
          };
          
          await docClient.send(new PutCommand({
            TableName: TABLE_NAME,
            Item: { ...newSession, threadKey: sessionKey },
          }));
          
          console.log(`✓ Created new session (user requested): ${newSessionId}`);
          return newSessionId;
        }
        
        // Check if session is still active and within SESSION_GAP_SMS_WA
        if (existingSession.isActive !== false) {
          const timeSinceLastActivity = now - existingSession.lastActivity;
          
          if (timeSinceLastActivity <= SESSION_GAP_SMS_WA) {
            // Update activity timestamp
            await docClient.send(new UpdateCommand({
              TableName: TABLE_NAME,
              Key: { threadKey: sessionKey },
              UpdateExpression: 'SET lastActivity = :now',
              ExpressionAttributeValues: {
                ':now': now,
              },
            }));
            
            console.log(`✓ Using existing session: ${existingSession.sessionId}`);
            return existingSession.sessionId;
          } else {
            // Session expired, create new one
            const newVersion = existingSession.sessionVersion + 1;
            const newSessionId = generateSmsWhatsAppSessionId(phoneNumber, newVersion);
            
            // Mark old session as inactive
            await docClient.send(new UpdateCommand({
              TableName: TABLE_NAME,
              Key: { threadKey: sessionKey },
              UpdateExpression: 'SET isActive = :inactive',
              ExpressionAttributeValues: {
                ':inactive': false,
              },
            }));
            
            // Create new session
            const newSession: SmsWhatsAppSessionRecord = {
              sessionKey,
              sessionId: newSessionId,
              channel,
              phoneNumber: normalizePhoneNumber(phoneNumber),
              sessionVersion: newVersion,
              createdAt: now,
              lastActivity: now,
              isActive: true,
            };
            
            await docClient.send(new PutCommand({
              TableName: TABLE_NAME,
              Item: { ...newSession, threadKey: sessionKey },
            }));
            
            console.log(`✓ Created new session (gap exceeded): ${newSessionId}`);
            return newSessionId;
          }
        } else {
          // Previous session was ended, create new one
          const newVersion = existingSession.sessionVersion + 1;
          const newSessionId = generateSmsWhatsAppSessionId(phoneNumber, newVersion);
          
          const newSession: SmsWhatsAppSessionRecord = {
            sessionKey,
            sessionId: newSessionId,
            channel,
            phoneNumber: normalizePhoneNumber(phoneNumber),
            sessionVersion: newVersion,
            createdAt: now,
            lastActivity: now,
            isActive: true,
          };
          
          await docClient.send(new PutCommand({
            TableName: TABLE_NAME,
            Item: { ...newSession, threadKey: sessionKey },
          }));
          
          console.log(`✓ Created new session (previous ended): ${newSessionId}`);
          return newSessionId;
        }
      }
    }
    
    // No existing session, create first one
    const newSessionId = generateSmsWhatsAppSessionId(phoneNumber, 1);
    const newSession: SmsWhatsAppSessionRecord = {
      sessionKey,
      sessionId: newSessionId,
      channel,
      phoneNumber: normalizePhoneNumber(phoneNumber),
      sessionVersion: 1,
      createdAt: now,
      lastActivity: now,
      isActive: true,
    };
    
    await docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: { ...newSession, threadKey: sessionKey },
    }));
    
    console.log(`✓ Created first session: ${newSessionId}`);
    return newSessionId;
    
  } catch (error: any) {
    console.error('❌ DynamoDB Error - SMS/WhatsApp Session Store:', {
      error: error.message || 'Unknown error',
      errorName: error.name || 'Unknown',
      stack: error.stack,
      channel,
      phoneNumber: phoneNumber.substring(0, 20) + '...', // Log partial for privacy
      sessionKey,
      tableName: TABLE_NAME,
      operation: 'getOrCreateSmsWhatsAppSession',
    });
    // Fallback: generate a session ID without storing
    const fallbackSessionId = `${normalizePhoneNumber(phoneNumber)}-v1`;
    console.warn(`⚠ Using fallback session ID (not persisted): ${fallbackSessionId}`);
    return fallbackSessionId;
  }
}

// ============================================================================
// Email Session Management
// ============================================================================

interface ThreadIdentifier {
  threadId?: string; // Gmail thread ID (not used for key generation, stored for reference only)
  subject: string;
  inReplyTo?: string;
  references?: string;
  senderEmail?: string;
}

interface EmailSessionRecord {
  sessionKey: string; // Format: "email-{fromEmail}"
  sessionId: string; // Format: "{fromEmail}-v{version}"
  senderEmail: string;
  subject: string;
  sessionVersion: number;
  createdAt: number;
  lastActivity: number;
  threadId?: string;
  inReplyTo?: string;
  references?: string;
}

/**
 * Normalize subject for use in sessionId (URL-safe, shortened)
 */
function normalizeSubjectForSessionId(subject: string): string {
  if (!subject) return '';
  
  // Normalize subject: remove Re:/Fwd:, normalize spaces, lowercase
  let normalized = subject
    .trim()
    .replace(/^(re|fwd?):\s*/i, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
  
  // Make URL-safe: replace special chars with hyphens, limit length
  normalized = normalized
    .replace(/[^a-z0-9\s-]/g, '-')  // Replace non-alphanumeric with hyphens
    .replace(/\s+/g, '-')            // Replace spaces with hyphens
    .replace(/-+/g, '-')             // Replace multiple hyphens with single
    .replace(/^-|-$/g, '')           // Remove leading/trailing hyphens
    .substring(0, 50);                // Limit to 50 chars for readability
  
  return normalized;
}

/**
 * Generate a unique session key for email
 * Uses normalized subject + sender email
 */
function generateEmailSessionKey(identifier: ThreadIdentifier): string {
  const parts: string[] = [];
  
  // Normalize subject (remove Re:, Fwd:, etc. and whitespace)
  const normalizedSubject = (identifier.subject || '')
    .trim()
    .replace(/^(re|fwd?):\s*/i, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
  
  if (normalizedSubject) {
    parts.push(`subject:${normalizedSubject}`);
  }
  
  // Add sender email
  if (identifier.senderEmail) {
    parts.push(`from:${identifier.senderEmail.toLowerCase()}`);
  }
  
  // If we have no identifiers, generate a fallback key
  if (parts.length === 0) {
    return `email-fallback-${uuidv4()}`;
  }
  
  return `email-${parts.join('|')}`;
}

/**
 * Get or create session ID for email
 * If subject and from address are same, use same session
 * If different, use different session
 */
export async function getOrCreateEmailSession(identifier: ThreadIdentifier): Promise<string> {
  const sessionKey = generateEmailSessionKey(identifier);
  const now = Date.now();
  
  try {
    // Try to get existing session (use threadKey as DynamoDB key name)
    const getResult = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { threadKey: sessionKey },
    }));
    
    if (getResult.Item) {
      const existingSession = getResult.Item as EmailSessionRecord;
      
      // Check if subject and from email match
      const normalizedSubject = (identifier.subject || '')
        .trim()
        .replace(/^(re|fwd?):\s*/i, '')
        .replace(/\s+/g, ' ')
        .toLowerCase();
      
      const normalizedFrom = identifier.senderEmail?.toLowerCase() || '';
      const existingSubject = (existingSession.subject || '')
        .trim()
        .replace(/^(re|fwd?):\s*/i, '')
        .replace(/\s+/g, ' ')
        .toLowerCase();
      const existingFrom = (existingSession.senderEmail || '').toLowerCase();
      
      // If subject and from match, use same session
      if (normalizedSubject === existingSubject && normalizedFrom === existingFrom) {
        // Update lastActivity timestamp
        await docClient.send(new UpdateCommand({
          TableName: TABLE_NAME,
          Key: { threadKey: sessionKey },
          UpdateExpression: 'SET lastActivity = :now',
          ExpressionAttributeValues: {
            ':now': now,
          },
        }));
        
        console.log(`✓ Using existing email session: ${existingSession.sessionId}`);
        return existingSession.sessionId;
      } else {
        // Subject or from changed, create new session
        const newVersion = (existingSession.sessionVersion || 0) + 1;
        const normalizedSubjectForId = normalizeSubjectForSessionId(identifier.subject || '');
        const normalizedFrom = (identifier.senderEmail || '').toLowerCase().replace(/[@.]/g, '-');
        const newSessionId = normalizedSubjectForId 
          ? `${normalizedFrom}-${normalizedSubjectForId}-v${newVersion}`
          : `${normalizedFrom}-v${newVersion}`;
        
        const newSession: EmailSessionRecord = {
          sessionKey,
          sessionId: newSessionId,
          senderEmail: identifier.senderEmail || '',
          subject: identifier.subject || '',
          sessionVersion: newVersion,
          createdAt: now,
          lastActivity: now,
          threadId: identifier.threadId,
          inReplyTo: identifier.inReplyTo,
          references: identifier.references,
        };
        
        await docClient.send(new PutCommand({
          TableName: TABLE_NAME,
          Item: { ...newSession, threadKey: sessionKey },
        }));
        
        console.log(`✓ Created new email session (subject/from changed): ${newSessionId}`);
        return newSessionId;
      }
    }
    
    // No existing session, create first one
    const normalizedSubjectForId = normalizeSubjectForSessionId(identifier.subject || '');
    const normalizedFrom = (identifier.senderEmail || '').toLowerCase().replace(/[@.]/g, '-');
    const newSessionId = normalizedSubjectForId
      ? `${normalizedFrom}-${normalizedSubjectForId}-v1`
      : `${normalizedFrom}-v1`;
    
    const newSession: EmailSessionRecord = {
      sessionKey,
      sessionId: newSessionId,
      senderEmail: identifier.senderEmail || '',
      subject: identifier.subject || '',
      sessionVersion: 1,
      createdAt: now,
      lastActivity: now,
      threadId: identifier.threadId,
      inReplyTo: identifier.inReplyTo,
      references: identifier.references,
    };
    
    await docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: { ...newSession, threadKey: sessionKey },
    }));
    
    console.log(`✓ Created first email session: ${newSessionId}`);
    return newSessionId;
    
  } catch (error: any) {
    console.error('❌ DynamoDB Error - Email Session Store:', {
      error: error.message || 'Unknown error',
      errorName: error.name || 'Unknown',
      stack: error.stack,
      senderEmail: identifier.senderEmail?.substring(0, 30) + '...', // Log partial for privacy
      subject: identifier.subject?.substring(0, 50) + '...',
      sessionKey,
      tableName: TABLE_NAME,
      operation: 'getOrCreateEmailSession',
    });
    // Fallback: generate a session ID without storing
    const normalizedSubjectForId = normalizeSubjectForSessionId(identifier.subject || '');
    const normalizedFrom = (identifier.senderEmail || 'unknown').toLowerCase().replace(/[@.]/g, '-');
    const fallbackSessionId = normalizedSubjectForId
      ? `${normalizedFrom}-${normalizedSubjectForId}-v1`
      : `${normalizedFrom}-v1`;
    console.warn(`⚠ Using fallback email session ID (not persisted): ${fallbackSessionId}`);
    return fallbackSessionId;
  }
}

// ============================================================================
// Legacy Email Support (for backward compatibility)
// ============================================================================

/**
 * Legacy function for email sessions (backward compatibility)
 * @deprecated Use getOrCreateEmailSession instead
 */
export async function getOrCreateSessionId(identifier: ThreadIdentifier): Promise<string> {
  return getOrCreateEmailSession(identifier);
}

/**
 * Generate thread key (legacy function for backward compatibility)
 * @deprecated Use generateEmailSessionKey instead
 */
export function generateThreadKey(identifier: ThreadIdentifier): string {
  return generateEmailSessionKey(identifier);
}

/**
 * Get session ID for a thread (without creating if not found)
 * @deprecated Legacy function
 */
export async function getSessionId(identifier: ThreadIdentifier): Promise<string | null> {
  const sessionKey = generateEmailSessionKey(identifier);
  
  try {
    const result = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { threadKey: sessionKey },
    }));
    
    if (result.Item) {
      const session = result.Item as EmailSessionRecord;
      // Update lastActivity timestamp
      await docClient.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { threadKey: sessionKey },
        UpdateExpression: 'SET lastActivity = :now',
        ExpressionAttributeValues: {
          ':now': Date.now(),
        },
      }));
      
      return session.sessionId;
    }
    
    return null;
  } catch (error: any) {
    console.error('❌ DynamoDB Error - Get Session ID:', {
      error: error.message || 'Unknown error',
      errorName: error.name || 'Unknown',
      stack: error.stack,
      sessionKey,
      tableName: TABLE_NAME,
      operation: 'getSessionId',
    });
    return null;
  }
}
