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
  const smsAuthToken = process.env.TWILIO_SMS_AUTH_TOKEN || authToken;
  return twilio(accountSid, smsAuthToken);
};

export const getWhatsAppClient = () => {
  const whatsappAuthToken = process.env.TWILIO_WHATSAPP_AUTH_TOKEN || authToken;
  return twilio(accountSid, whatsappAuthToken);
};

export const getDefaultPhoneNumber = (): string => {
  const phoneNumber = process.env.TWILIO_PHONE_NUMBER;
  if (!phoneNumber) {
    throw new Error('TWILIO_PHONE_NUMBER must be set');
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

