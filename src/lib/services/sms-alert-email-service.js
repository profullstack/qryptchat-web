/**
 * SMS alert email service.
 *
 * Forwards inbound Telnyx SMS webhooks (in practice: OTP codes) to an inbox
 * by email, through Resend's HTTP API. Was Mailgun until 2026-10; the fleet
 * sends everything through Resend now, and qrypt.chat is a Resend domain.
 */
const RESEND_URL = 'https://api.resend.com/emails';

export class SMSAlertEmailService {
  /**
   * @param {Object} opts
   * @param {string} opts.apiKey - Resend API key
   * @param {string} [opts.domain] - Sending domain, verified on Resend
   * @param {typeof fetch} [opts.fetchImpl] - Injected in tests
   */
  constructor({ apiKey, domain = 'qrypt.chat', fetchImpl } = {}) {
    if (!apiKey) {
      throw new Error('Resend API key is required');
    }
    this.apiKey = apiKey;
    this.domain = domain;
    this.fetch = fetchImpl ?? ((...args) => fetch(...args));
  }

  /**
   * Send an email.
   * @param {Object} emailData
   * @param {string} emailData.to - Recipient email
   * @param {string} emailData.subject - Email subject
   * @param {string} emailData.text - Plain text content
   * @param {string} [emailData.html] - HTML content
   * @param {string} [emailData.from] - Sender (defaults to noreply@domain)
   * @returns {Promise<Object>} Result object with success status
   */
  async sendEmail(emailData) {
    try {
      if (!emailData?.to || !emailData?.subject || !emailData?.text) {
        return {
          success: false,
          error: 'Missing required email fields: to, subject, text'
        };
      }

      const message = {
        from: emailData.from || `noreply@${this.domain}`,
        to: [emailData.to],
        subject: emailData.subject,
        text: emailData.text,
        ...(emailData.html && { html: emailData.html })
      };

      const res = await this.fetch(RESEND_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify(message)
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(`resend ${res.status}: ${body?.message ?? 'request failed'}`);
      }

      return { success: true, messageId: body.id, response: body };
    } catch (error) {
      console.error('[SMS-ALERT-EMAIL] Error sending email:', error);
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

      return await this.sendEmail({
        to: process.env.OTP_TO_EMAIL || 'otp@qrypt.chat',
        subject: `SMS Webhook Alert - ${new Date().toISOString()}`,
        text: this.formatWebhookPayloadEmail(webhookPayload),
        from: process.env.FROM_EMAIL || `webhook-alerts@${this.domain}`
      });
    } catch (error) {
      console.error('[SMS-ALERT-EMAIL] Error sending SMS webhook alert:', error);
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
 * @returns {SMSAlertEmailService|null} Service instance or null if not configured
 */
export function createSMSWebhookEmailService() {
  const apiKey = process.env.RESEND_API_KEY;
  const domain = process.env.EMAIL_DOMAIN || 'qrypt.chat';

  if (!apiKey) {
    console.warn('[SMS-ALERT-EMAIL] RESEND_API_KEY not configured, email alerts disabled');
    return null;
  }

  try {
    return new SMSAlertEmailService({ apiKey, domain });
  } catch (error) {
    console.error('[SMS-ALERT-EMAIL] Failed to initialize email service:', error);
    return null;
  }
}
