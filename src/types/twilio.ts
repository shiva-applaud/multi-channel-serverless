export interface TwilioWebhookPayload {
  MessageSid: string;
  AccountSid: string;
  MessagingServiceSid?: string;
  From: string;
  To: string;
  Body: string;
  NumMedia: string;
  MessageStatus?: string;
  SmsStatus?: string;
  SmsSid?: string;
  WaId?: string;
}

export interface SendMessageRequest {
  to: string;
  message: string;
  from?: string;
}

export interface SendMessageResponse {
  success: boolean;
  messageSid?: string;
  error?: string;
}

export interface WebhookResponse {
  success: boolean;
  message?: string;
  error?: string;
}

