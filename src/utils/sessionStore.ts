/**
 * Session ID Storage Utility
 * 
 * Stores email thread session IDs in DynamoDB for persistence across Lambda invocations.
 * Uses thread identifiers (subject, in-reply-to, references) to maintain conversation context.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';

const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'eu-central-1',
});

const docClient = DynamoDBDocumentClient.from(dynamoClient);

const TABLE_NAME = process.env.SESSION_TABLE_NAME || 'gmail-session-store';

interface ThreadIdentifier {
  threadId?: string; // Gmail thread ID (most reliable identifier)
  subject: string;
  inReplyTo?: string;
  references?: string;
  senderEmail?: string;
}

interface SessionRecord {
  threadKey: string;
  sessionId: string;
  createdAt: number;
  lastUsed: number;
  threadId?: string; // Gmail thread ID if available
  subject: string;
  inReplyTo?: string;
  references?: string;
  senderEmail?: string;
}

/**
 * Generate a unique thread key from email headers
 * Prioritizes Gmail threadId (most reliable), then falls back to subject, in-reply-to, and references
 */
export function generateThreadKey(identifier: ThreadIdentifier): string {
  // PRIORITY 1: Use Gmail threadId if available (most reliable identifier)
  if (identifier.threadId) {
    return `threadId:${identifier.threadId}`;
  }
  
  // PRIORITY 2: Use first reference as thread root (original message ID)
  if (identifier.references) {
    const refs = identifier.references.split(/\s+/).filter(Boolean);
    if (refs.length > 0) {
      // Use the first reference as the thread root
      return `ref:${refs[0].trim()}`;
    }
  }
  
  // PRIORITY 3: Use in-reply-to header
  if (identifier.inReplyTo) {
    return `replyTo:${identifier.inReplyTo.trim()}`;
  }
  
  // PRIORITY 4: Fallback to subject + sender email
  const parts: string[] = [];
  
  // Normalize subject (remove Re:, Fwd:, etc. and whitespace)
  const normalizedSubject = (identifier.subject || '')
    .trim()
    .replace(/^(re|fwd?):\s*/i, '')
    .toLowerCase();
  
  if (normalizedSubject) {
    parts.push(`subject:${normalizedSubject}`);
  }
  
  // Add sender email if available (for cases where same subject is used by different senders)
  if (identifier.senderEmail) {
    parts.push(`from:${identifier.senderEmail.toLowerCase()}`);
  }
  
  // If we have no identifiers, generate a fallback key
  if (parts.length === 0) {
    return `fallback:${uuidv4()}`;
  }
  
  return parts.join('|');
}

/**
 * Get or create a session ID for a thread
 * Returns existing session ID if thread exists, otherwise creates a new one
 */
export async function getOrCreateSessionId(identifier: ThreadIdentifier): Promise<string> {
  const threadKey = generateThreadKey(identifier);
  
  try {
    // Try to get existing session ID
    const getResult = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { threadKey },
    }));
    
    if (getResult.Item && getResult.Item.sessionId) {
      // Update lastUsed timestamp
      await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          ...getResult.Item,
          lastUsed: Date.now(),
        },
      }));
      
      console.log(`✓ Found existing session ID for thread: ${threadKey.substring(0, 100)}`);
      return getResult.Item.sessionId;
    }
    
    // Create new session ID
    const newSessionId = uuidv4();
    const sessionRecord: SessionRecord = {
      threadKey,
      sessionId: newSessionId,
      createdAt: Date.now(),
      lastUsed: Date.now(),
      threadId: identifier.threadId,
      subject: identifier.subject || '',
      inReplyTo: identifier.inReplyTo,
      references: identifier.references,
      senderEmail: identifier.senderEmail,
    };
    
    await docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: sessionRecord,
    }));
    
    console.log(`✓ Created new session ID for thread: ${threadKey.substring(0, 100)}`);
    return newSessionId;
    
  } catch (error: any) {
    console.error('Error accessing session store:', error);
    // Fallback: generate a session ID without storing (for resilience)
    const fallbackSessionId = uuidv4();
    console.warn(`⚠ Using fallback session ID (not persisted): ${fallbackSessionId}`);
    return fallbackSessionId;
  }
}

/**
 * Get session ID for a thread (without creating if not found)
 */
export async function getSessionId(identifier: ThreadIdentifier): Promise<string | null> {
  const threadKey = generateThreadKey(identifier);
  
  try {
    const result = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { threadKey },
    }));
    
    if (result.Item && result.Item.sessionId) {
      // Update lastUsed timestamp
      await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          ...result.Item,
          lastUsed: Date.now(),
        },
      }));
      
      return result.Item.sessionId;
    }
    
    return null;
  } catch (error: any) {
    console.error('Error getting session ID from store:', error);
    return null;
  }
}

