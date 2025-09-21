import Mailgun from 'mailgun.js';
import formData from 'form-data';

/**
 * Mailgun Email Service
 * Handles sending emails via Mailgun API
 */
export class MailgunEmailService {
  constructor({ apiKey, domain }) {
    if (!apiKey) {
      throw new Error('Mailgun API key is required');
    }
    if (!domain) {
      throw new Error('Mailgun domain is required');
    }

    this.domain = domain;
    
    // Initialize Mailgun client
    const mailgun = new Mailgun(formData);
    this.mg = mailgun.client({
      username: 'api',
      key: apiKey
    });
  }

  /**
   * Send an email via Mailgun
   * @param {Object} emailData - Email data
   * @param {string} emailData.to - Recipient email
   * @param {string} emailData.subject - Email subject
   * @param {string} emailData.text - Plain text content
   * @param {string} [emailData.html] - HTML content (optional)
   * @param {string} [emailData.from] - Sender email (defaults to noreply@domain)
   * @returns {Promise<Object>} Result object with success status
   */
  async sendEmail(emailData) {
    try {
      // Validate required fields
      if (!emailData?.to || !emailData?.subject || !emailData?.text) {
        return {
          success: false,
          error: 'Missing required email fields: to, subject, text'
        };
      }

      // Prepare email data with defaults
      const messageData = {
        from: emailData.from || `noreply@${this.domain}`,
        to: emailData.to,
        subject: emailData.subject,
        text: emailData.text,
        ...(emailData.html && { html: emailData.html })
      };

      // Send email via Mailgun
      const response = await this.mg.messages.create(this.domain, messageData);

      return {
        success: true,
        messageId: response.id,
        response
      };

    } catch (error) {
      console.error('[MAILGUN] Error sending email:', error);
      return {
        success: false,
        error: `Failed to send email: ${error.message}`,
        details: error.message
      };
    }
  }

  /**
   * Send SMS webhook alert email to configured recipient
   * @param {Object} webhookPayload - The SMS webhook payload from Telnyx
   * @returns {Promise<Object>} Result object with success status
   */
  async sendSMSWebhookAlert(webhookPayload) {
    try {
      if (!webhookPayload) {
        return {
          success: false,
          error: 'Invalid webhook payload: payload is null or undefined'
        };
      }

      // Format the webhook payload for email content
      const emailContent = this.formatWebhookPayloadEmail(webhookPayload);

      const emailData = {
        to: process.env.OTP_TO_EMAIL || 'otp@qrypt.chat',
        subject: `SMS Webhook Alert - ${new Date().toISOString()}`,
        text: emailContent,
        from: process.env.FROM_EMAIL || `webhook-alerts@${this.domain}`
      };

      return await this.sendEmail(emailData);

    } catch (error) {
      console.error('[MAILGUN] Error sending SMS webhook alert:', error);
      return {
        success: false,
        error: `Failed to send SMS webhook alert: ${error.message}`,
        details: error.message
      };
    }
  }

  /**
   * Format webhook payload into readable email content
   * @param {Object} payload - Webhook payload
   * @returns {string} Formatted email content
   * @private
   */
  formatWebhookPayloadEmail(payload) {
    const timestamp = new Date().toISOString();
    const eventType = payload?.data?.event_type || 'unknown';
    const messageData = payload?.data?.payload;

    let content = `SMS Webhook Alert\n`;
    content += `Timestamp: ${timestamp}\n`;
    content += `Event Type: ${eventType}\n\n`;

    if (messageData) {
      content += `Message Details:\n`;
      content += `- Message ID: ${messageData.id || 'N/A'}\n`;
      content += `- From: ${messageData.from?.phone_number || 'N/A'}\n`;
      content += `- To: ${messageData.to?.[0]?.phone_number || 'N/A'}\n`;
      content += `- Text: ${messageData.text || 'N/A'}\n`;
      content += `- Direction: ${messageData.direction || 'N/A'}\n`;
      
      if (messageData.media?.length > 0) {
        content += `- Media Count: ${messageData.media.length}\n`;
      }
    }

    content += `\n--- Raw Payload ---\n`;
    content += JSON.stringify(payload, null, 2);

    return content;
  }
}

/**
 * Create SMS webhook email service from environment variables
 * @returns {MailgunEmailService|null} Service instance or null if env vars missing
 */
export function createSMSWebhookEmailService() {
  const apiKey = process.env.MAILGUN_API_KEY;
  const domain = process.env.MAILGUN_DOMAIN || 'mg.qrypt.chat';

  if (!apiKey) {
    console.warn('[MAILGUN] MAILGUN_API_KEY not configured, email alerts disabled');
    return null;
  }

  if (!process.env.OTP_TO_EMAIL) {
    console.warn('[MAILGUN] OTP_TO_EMAIL not configured, using default otp@qrypt.chat');
  }

  if (!process.env.FROM_EMAIL) {
    console.warn('[MAILGUN] FROM_EMAIL not configured, using default webhook-alerts@domain');
  }

  try {
    return new MailgunEmailService({ apiKey, domain });
  } catch (error) {
    console.error('[MAILGUN] Failed to initialize email service:', error);
    return null;
  }
}