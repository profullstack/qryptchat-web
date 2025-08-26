/**
 * @fileoverview SMS notification API endpoint
 * Handles sending SMS notifications via Twilio or other SMS providers
 */

import { json } from '@sveltejs/kit';

/**
 * Send SMS notification
 * @param {Request} request
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

    // For now, we'll simulate SMS sending since we don't have Twilio configured
    // In production, this would integrate with Twilio or another SMS service
    console.log('📱 [SMS-API] Simulating SMS send:', {
      to: phoneNumber,
      message: message.substring(0, 50) + '...',
      timestamp: new Date().toISOString()
    });

    // Simulate a successful SMS send
    const messageId = `sim_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    return json({
      success: true,
      messageId,
      status: 'sent'
    });

  } catch (error) {
    console.error('📱 [SMS-API] Error sending SMS:', error);
    return json(
      { error: 'Failed to send SMS notification' },
      { status: 500 }
    );
  }
}