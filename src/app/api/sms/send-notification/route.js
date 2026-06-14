/**
 * @fileoverview SMS notification API endpoint
 * Handles sending SMS notifications via Twilio API
 */

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api/middleware/auth.js';
import { TwilioSMSProvider } from '@/lib/services/twilio-sms-provider.js';

/**
 * Send SMS notification (requires authentication)
 */
export const POST = withAuth(async ({ request }) => {
  try {
    const { phoneNumber, message } = await request.json();

    if (!phoneNumber || !message) {
      return NextResponse.json(
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

    return NextResponse.json({
      success: true,
      messageId,
      status
    });

  } catch (error) {
    console.error('📱 [SMS-API] Error sending SMS:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to send SMS notification';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
});
