/**
 * Session ID Utility
 * 
 * Generates unique session IDs for different communication channels:
 * - SMS: Based on phone number + 5-minute conversation windows
 * - WhatsApp: Based on phone number/WaId + 5-minute conversation windows
 * - Email: Uses Gmail threadId if available, otherwise generates based on sender email
 * 
 * SessionId Rules:
 * - New phone number → New sessionId
 * - Same phone number but 5+ minutes since last message → New sessionId
 * - Same phone number with messages within 5 minutes → Same sessionId
 * 
 * Note: Uses time-windowed approach (no database required). Messages within the same
 * 5-minute time bucket share the same sessionId. After 5 minutes of inactivity,
 * the next message falls into a new time bucket, creating a new sessionId.
 */

import { v4 as uuidv4 } from 'uuid';

/**
 * Generate session ID for SMS
 * Format: sms-{normalized_phone_number}-{conversationStartTime}
 * 
 * SessionId logic:
 * - Different phone number → New sessionId
 * - Same phone number but last message was more than 5 minutes ago → New sessionId
 * - Same phone number with messages within 5 minutes → Same sessionId
 * 
 * Implementation: Uses 5-minute time buckets. Messages within the same 5-minute window
 * share the same sessionId. After 5 minutes of inactivity, the next message gets a new sessionId.
 * 
 * Example:
 * - Message at 12:00 → sms-+1234567890-1735128000000
 * - Message at 12:03 → sms-+1234567890-1735128000000 (same session - within 5 min)
 * - Message at 12:06 → sms-+1234567890-1735128300000 (new session - 5+ min passed)
 */
export function generateSmsSessionId(phoneNumber: string): string {
  // Normalize phone number (remove spaces, dashes, parentheses, and + sign)
  // The + sign is not allowed in sessionId by the API regex pattern [0-9a-zA-Z._:-]+
  const normalized = phoneNumber.replace(/[\s\-\(\)\+]/g, '');
  
  // Calculate 5-minute time window (timestamp rounded down to nearest 5 minutes)
  // This creates buckets: messages within the same 5-minute window share sessionId
  // After 5 minutes, the bucket changes, creating a new sessionId
  const now = Date.now();
  const fiveMinutesInMs = 5 * 60 * 1000; // 5 minutes in milliseconds
  const conversationStartTime = Math.floor(now / fiveMinutesInMs) * fiveMinutesInMs;
  
  // Format conversation start time as timestamp
  const conversationStartTimeStr = conversationStartTime.toString();
  
  return `sms-${normalized}-${conversationStartTimeStr}`;
}

/**
 * Generate session ID for WhatsApp
 * Format: whatsapp-{normalized_phone_number}-{conversationStartTime} or whatsapp-{waId}-{conversationStartTime}
 * 
 * SessionId logic:
 * - Different phone number/WaId → New sessionId
 * - Same phone number/WaId but last message was more than 5 minutes ago → New sessionId
 * - Same phone number/WaId with messages within 5 minutes → Same sessionId
 * 
 * Implementation: Uses 5-minute time buckets. Messages within the same 5-minute window
 * share the same sessionId. After 5 minutes of inactivity, the next message gets a new sessionId.
 * 
 * Example:
 * - Message at 12:00 → whatsapp-+1234567890-1735128000000
 * - Message at 12:03 → whatsapp-+1234567890-1735128000000 (same session - within 5 min)
 * - Message at 12:06 → whatsapp-+1234567890-1735128300000 (new session - 5+ min passed)
 */
export function generateWhatsAppSessionId(phoneNumber: string, waId?: string): string {
  // Calculate 5-minute time window (timestamp rounded down to nearest 5 minutes)
  // This creates buckets: messages within the same 5-minute window share sessionId
  // After 5 minutes, the bucket changes, creating a new sessionId
  const now = Date.now();
  const fiveMinutesInMs = 5 * 60 * 1000; // 5 minutes in milliseconds
  const conversationStartTime = Math.floor(now / fiveMinutesInMs) * fiveMinutesInMs;
  const conversationStartTimeStr = conversationStartTime.toString();
  
  if (waId) {
    return `whatsapp-${waId}-${conversationStartTimeStr}`;
  }
  // Normalize phone number (remove whatsapp: prefix, spaces, dashes, parentheses, and + sign)
  // The + sign is not allowed in sessionId by the API regex pattern [0-9a-zA-Z._:-]+
  const normalized = phoneNumber.replace(/^whatsapp:/, '').replace(/[\s\-\(\)\+]/g, '');
  return `whatsapp-${normalized}-${conversationStartTimeStr}`;
}

/**
 * Generate session ID for Email
 * Uses Gmail threadId if available, otherwise generates based on sender email
 * Format: email-{threadId} or email-{normalized_sender_email}-{uuid}
 * Example: email-1234567890abcdef or email-user-example-com-{uuid}
 */
export function generateEmailSessionId(threadId?: string, senderEmail?: string): string {
  // If threadId is available, use it directly
  if (threadId) {
    return `email-${threadId}`;
  }
  
  // Otherwise, generate based on sender email
  if (senderEmail) {
    // Normalize email (replace @ and . with -)
    const normalized = senderEmail.toLowerCase().replace(/[@\.]/g, '-');
    // Add UUID to ensure uniqueness if threadId is not available
    const uniqueId = uuidv4().substring(0, 8);
    return `email-${normalized}-${uniqueId}`;
  }
  
  // Fallback: generate random session ID
  return `email-${uuidv4()}`;
}

/**
 * Extract session ID from various sources
 * Helper function to get sessionId from different contexts
 */
export function extractSessionId(
  channel: 'sms' | 'whatsapp' | 'email',
  data: {
    phoneNumber?: string;
    waId?: string;
    threadId?: string;
    senderEmail?: string;
  }
): string {
  switch (channel) {
    case 'sms':
      if (!data.phoneNumber) {
        throw new Error('Phone number is required for SMS session ID');
      }
      return generateSmsSessionId(data.phoneNumber);
    
    case 'whatsapp':
      if (!data.phoneNumber && !data.waId) {
        throw new Error('Phone number or WaId is required for WhatsApp session ID');
      }
      return generateWhatsAppSessionId(data.phoneNumber || '', data.waId);
    
    case 'email':
      return generateEmailSessionId(data.threadId, data.senderEmail);
    
    default:
      throw new Error(`Unknown channel: ${channel}`);
  }
}

