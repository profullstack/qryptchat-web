/**
 * @fileoverview Test Twilio SMS Provider
 * Simple test to verify Twilio SMS integration works
 */

import { TwilioSMSProvider } from '../src/lib/services/twilio-sms-provider.js';

/**
 * Test Twilio SMS Provider
 * This is a manual test - run with: node tests/twilio-sms-test.js
 */
async function testTwilioSMS() {
  try {
    console.log('🧪 [TEST] Testing Twilio SMS Provider...');
    
    // Initialize provider
    const twilioProvider = new TwilioSMSProvider();
    console.log('✅ [TEST] Twilio provider initialized successfully');
    
    // Test phone number (replace with your test number)
    const testPhoneNumber = '+16693223469'; // Replace with your phone number
    const testMessage = 'Test message from Qrypt Chat - Twilio integration working!';
    
    console.log('📱 [TEST] Sending test SMS...');
    console.log('📱 [TEST] To:', testPhoneNumber);
    console.log('📱 [TEST] Message:', testMessage);
    
    // Send test SMS
    const result = await twilioProvider.sendSMS(testPhoneNumber, testMessage);
    
    console.log('✅ [TEST] SMS sent successfully!');
    console.log('📱 [TEST] Result:', {
      success: result.success,
      messageId: result.messageId,
      status: result.status
    });
    
    // Check message status
    if (result.messageId) {
      console.log('📱 [TEST] Checking message status...');
      const status = await twilioProvider.getMessageStatus(result.messageId);
      console.log('📱 [TEST] Message status:', status);
    }
    
    console.log('🎉 [TEST] All tests passed!');
    
  } catch (error) {
    console.error('❌ [TEST] Test failed:', error.message);
    console.error('❌ [TEST] Error details:', error);
    process.exit(1);
  }
}

// Run test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testTwilioSMS();
}