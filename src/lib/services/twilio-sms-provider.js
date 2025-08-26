/**
 * @fileoverview Twilio SMS Provider
 * Direct integration with Twilio API for sending SMS notifications
 */

import twilio from 'twilio';

/**
 * Twilio SMS Provider
 * Uses Twilio REST API to send SMS messages directly
 */
export class TwilioSMSProvider {
  constructor() {
    // Support both naming conventions from your env vars
    const accountSid = process.env.TWILIO_ACCOUNT_SID || process.env.TWILIO_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN || process.env.TWILIO_SECRET;
    const phoneNumber = process.env.TWILIO_PHONE_NUMBER;
    const messageServiceSid = process.env.TWILIO_MESSAGE_SERVICE_SID;

    if (!accountSid || !authToken) {
      throw new Error('Twilio credentials are required: TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN');
    }

    if (!phoneNumber && !messageServiceSid) {
      throw new Error('Either TWILIO_PHONE_NUMBER or TWILIO_MESSAGE_SERVICE_SID must be configured');
    }

    this.client = twilio(accountSid, authToken);
    this.phoneNumber = phoneNumber;
    this.messageServiceSid = messageServiceSid;

    console.log('📱 [TWILIO-PROVIDER] Initialized with:', {
      accountSid: accountSid?.substring(0, 8) + '***',
      hasAuthToken: !!authToken,
      phoneNumber: phoneNumber || 'using message service',
      messageServiceSid: messageServiceSid?.substring(0, 8) + '***' || 'not set'
    });
  }

  /**
   * Send SMS using Twilio REST API
   * @param {string} phoneNumber - Phone number in E.164 format
   * @param {string} message - SMS message content
   * @returns {Promise<Object>} Result with success status and message ID
   */
  async sendSMS(phoneNumber, message) {
    try {
      console.log('📱 [TWILIO-PROVIDER] Sending SMS:', {
        to: phoneNumber,
        messageLength: message.length,
        timestamp: new Date().toISOString()
      });

      // Build message options
      const messageOptions = {
        body: message,
        to: phoneNumber
      };

      // Use Message Service SID if available, otherwise use phone number
      if (this.messageServiceSid) {
        messageOptions.messagingServiceSid = this.messageServiceSid;
      } else {
        messageOptions.from = this.phoneNumber;
      }

      // Send SMS via Twilio
      const twilioMessage = await this.client.messages.create(messageOptions);

      console.log('📱 [TWILIO-PROVIDER] SMS sent successfully:', {
        messageId: twilioMessage.sid,
        status: twilioMessage.status,
        to: phoneNumber
      });

      return {
        success: true,
        messageId: twilioMessage.sid,
        status: twilioMessage.status
      };

    } catch (error) {
      console.error('📱 [TWILIO-PROVIDER] SMS send failed:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        code: (error && typeof error === 'object' && 'code' in error) ? error.code : 'UNKNOWN',
        moreInfo: (error && typeof error === 'object' && 'moreInfo' in error) ? error.moreInfo : 'No additional info',
        to: phoneNumber
      });

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Twilio SMS failed: ${errorMessage}`);
    }
  }

  /**
   * Get SMS delivery status from Twilio
   * @param {string} messageId - Twilio message SID
   * @returns {Promise<Object>} Message status information
   */
  async getMessageStatus(messageId) {
    try {
      const message = await this.client.messages(messageId).fetch();
      return {
        messageId: message.sid,
        status: message.status,
        errorCode: message.errorCode,
        errorMessage: message.errorMessage,
        dateCreated: message.dateCreated,
        dateSent: message.dateSent,
        dateUpdated: message.dateUpdated
      };
    } catch (error) {
      console.error('📱 [TWILIO-PROVIDER] Failed to fetch message status:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to get message status: ${errorMessage}`);
    }
  }
}