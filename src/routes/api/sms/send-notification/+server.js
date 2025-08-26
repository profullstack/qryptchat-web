/**
 * @fileoverview SMS notification API endpoint
 * Handles sending SMS notifications via Twilio API
 */

import { json } from '@sveltejs/kit';
import { TwilioSMSProvider } from '$lib/services/twilio-sms-provider.js';

/**
 * Send SMS notification
 * @param {Object} params - SvelteKit request parameters
 * @param {Request} params.request - The request object
 */
export async function POST({ request }) {
  try {
    const { phoneNumber, message } = await request.json();

    if (!phoneNumber || !message) {
      return json(
        { error: 'Phone number and message are required' },
        { status: 400 }
      );
    }

    console.log('📱 [SMS-API] Sending SMS via Twilio:', {
      to: phoneNumber,
      messageLength: message.length,
      timestamp: new Date().toISOString()
    });

    // Initialize Twilio SMS provider
    const twilioProvider = new TwilioSMSProvider();
    
    // Send SMS via Twilio
    const result = await twilioProvider.sendSMS(phoneNumber, message);
    
    const messageId = (result && typeof result === 'object' && 'messageId' in result) ? result.messageId : 'unknown';
    const status = (result && typeof result === 'object' && 'status' in result) ? result.status : 'sent';
    
    console.log('📱 [SMS-API] SMS sent successfully:', {
      messageId,
      status
    });
    
    return json({
      success: true,
      messageId,
      status
    });

  } catch (error) {
    console.error('📱 [SMS-API] Error sending SMS:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to send SMS notification';
    return json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}