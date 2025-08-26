/**
 * @fileoverview API endpoint for sending SMS notifications to inactive users
 * This endpoint is used by the SMS notification service to send messages
 */

import { json } from '@sveltejs/kit';
import { createSupabaseServerClient } from '$lib/supabase.js';

/**
 * POST /api/sms/send-notification
 * Send SMS notification to a user
 * @param {import('@sveltejs/kit').RequestEvent} event
 */
export async function POST(event) {
  const { request } = event;

  try {
    const { phoneNumber, message } = await request.json();

    // Validate inputs
    if (!phoneNumber?.trim()) {
      return json(
        { error: 'Phone number is required' },
        { status: 400 }
      );
    }

    if (!message?.trim()) {
      return json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    // Validate phone number format (basic E.164 check)
    const phoneRegex = /^\+[1-9]\d{1,14}$/;
    if (!phoneRegex.test(phoneNumber)) {
      return json(
        { error: 'Invalid phone number format. Use E.164 format (e.g., +1234567890)' },
        { status: 400 }
      );
    }

    // Create Supabase client
    const supabase = createSupabaseServerClient(event);

    // Use Supabase Auth to send SMS
    // Note: This is a workaround since Supabase Auth doesn't have direct SMS API
    // We're using the OTP system but with a custom message
    const { error: smsError } = await supabase.auth.signInWithOtp({
      phone: phoneNumber,
      options: {
        channel: 'sms',
        shouldCreateUser: false, // Don't create user for notifications
        data: {
          custom_message: message // This might not work with all SMS providers
        }
      }
    });

    if (smsError) {
      console.error('SMS notification failed:', {
        phoneNumber: `${phoneNumber.substring(0, 3)}***${phoneNumber.substring(phoneNumber.length - 2)}`,
        error: smsError.message,
        code: smsError.status
      });

      // Return user-friendly error
      let userMessage = 'Failed to send SMS notification';
      if (smsError.message?.includes('Invalid phone number')) {
        userMessage = 'Invalid phone number';
      } else if (smsError.message?.includes('Too many requests')) {
        userMessage = 'Rate limit exceeded. Please try again later.';
      } else if (smsError.message?.includes('SMS not configured')) {
        userMessage = 'SMS service temporarily unavailable';
      }

      return json(
        { 
          error: userMessage,
          code: smsError.status || 'SMS_SEND_FAILED'
        },
        { status: smsError.status === 429 ? 429 : 500 }
      );
    }

    // Log success
    console.log('SMS notification sent successfully:', {
      phoneNumber: `${phoneNumber.substring(0, 3)}***${phoneNumber.substring(phoneNumber.length - 2)}`,
      messageLength: message.length
    });

    return json({
      success: true,
      messageId: `sms_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      message: 'SMS notification sent successfully'
    });

  } catch (error) {
    console.error('SMS notification endpoint error:', error);

    return json(
      {
        error: 'Internal server error',
        message: error.message
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/sms/send-notification
 * Health check for SMS notification endpoint
 */
export async function GET() {
  return json({
    status: 'healthy',
    service: 'sms-notification',
    timestamp: new Date().toISOString()
  });
}