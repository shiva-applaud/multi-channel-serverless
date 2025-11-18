export interface SendEmailRequest {
  to: string | string[];
  subject: string;
  body: string;
  from?: string;
  cc?: string | string[];
  bcc?: string | string[];
  html?: boolean;
  attachments?: EmailAttachment[];
}

export interface EmailAttachment {
  filename: string;
  content: string; // Base64 encoded content
  contentType?: string;
}

export interface SendEmailResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface EmailWebhookPayload {
  emailAddress: string;
  historyId: string;
  expiration?: string;
}

export interface GmailPushNotification {
  message: {
    data: string; // Base64 encoded Pub/Sub message
    messageId: string;
    publishTime: string;
  };
  subscription: string;
}

export interface WebhookEmailResponse {
  success: boolean;
  message?: string;
  error?: string;
}

