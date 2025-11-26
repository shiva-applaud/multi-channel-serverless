/**
 * Session ID Storage Utility
 * 
 * Stores email thread session IDs in DynamoDB for persistence across Lambda invocations.
 * Uses normalized subject + sender email to identify threads.
 * Does NOT use references, in-reply-to, or threadId as they change with each message.
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
  threadId?: string; // Gmail thread ID (not used for key generation, stored for reference only)
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
 * Uses normalized subject + sender email only
 * Does NOT use references or in-reply-to as they change with each message
 * Does NOT use threadId as it changes when we send replies
 */
export function generateThreadKey(identifier: ThreadIdentifier): string {
  const parts: string[] = [];
  
  // PRIORITY 1: Normalize subject (remove Re:, Fwd:, etc. and whitespace)
  // "Re: login bug" and "login bug" should be treated as the same
  const normalizedSubject = (identifier.subject || '')
    .trim()
    .replace(/^(re|fwd?):\s*/i, '') // Remove Re:, Fwd:, etc.
    .replace(/\s+/g, ' ') // Normalize whitespace
    .toLowerCase();
  
  if (normalizedSubject) {
    parts.push(`subject:${normalizedSubject}`);
  }
  
  // PRIORITY 2: Add sender email (to differentiate between different senders with same subject)
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

