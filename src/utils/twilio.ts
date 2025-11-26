import twilio from 'twilio';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
// Use SMS auth token as default, fallback to WhatsApp token if SMS token not available
const authToken = process.env.TWILIO_SMS_AUTH_TOKEN || process.env.TWILIO_WHATSAPP_AUTH_TOKEN;

if (!accountSid || !authToken) {
  throw new Error('TWILIO_ACCOUNT_SID and TWILIO_SMS_AUTH_TOKEN (or TWILIO_WHATSAPP_AUTH_TOKEN) must be set');
}

export const twilioClient = twilio(accountSid, authToken);

// Create separate clients for SMS and WhatsApp if different tokens are provided
export const getSmsClient = () => {
  // Use SMS-specific account SID and auth token (required for SMS operations)
  const smsAccountSid = process.env.TWILIO_SMS_ACCOUNT_SID;
  const smsAuthToken = process.env.TWILIO_SMS_AUTH_TOKEN;
  
  // Check for missing or empty values
  if (!smsAccountSid || smsAccountSid.trim() === '') {
    throw new Error('TWILIO_SMS_ACCOUNT_SID must be set in environment variables for SMS operations. Please set it in your .env file or AWS Lambda environment variables.');
  }
  
  if (!smsAuthToken || smsAuthToken.trim() === '') {
    throw new Error('TWILIO_SMS_AUTH_TOKEN must be set in environment variables for SMS operations. Please set it in your .env file or AWS Lambda environment variables.');
  }
  
  return twilio(smsAccountSid, smsAuthToken);
};

export const getWhatsAppClient = () => {
  const whatsappAuthToken = process.env.TWILIO_WHATSAPP_AUTH_TOKEN || authToken;
  return twilio(accountSid, whatsappAuthToken);
};

export const getDefaultPhoneNumber = (): string => {
  const phoneNumber = process.env.TWILIO_PHONE_NUMBER;
  if (!phoneNumber || phoneNumber.trim() === '') {
    throw new Error('TWILIO_PHONE_NUMBER must be set in environment variables');
  }
  return phoneNumber;
};

export const getDefaultWhatsAppNumber = (): string => {
  const whatsappNumber = process.env.TWILIO_WHATSAPP_PHONE_NUMBER;
  if (!whatsappNumber) {
    throw new Error('TWILIO_WHATSAPP_PHONE_NUMBER must be set');
  }
  // Ensure WhatsApp number has the whatsapp: prefix
  return whatsappNumber.startsWith('whatsapp:') ? whatsappNumber : `whatsapp:${whatsappNumber}`;
};

