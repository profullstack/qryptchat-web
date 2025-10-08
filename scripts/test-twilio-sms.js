#!/usr/bin/env node

/**
 * @fileoverview CLI script to test Twilio SMS sending directly
 * Usage: node scripts/test-twilio-sms.js +1234567890 "Your message"
 */

import twilio from 'twilio';
import { config } from 'dotenv';

// Load environment variables
config();

/**
 * Parse command line arguments
 */
function parseArgs() {
	const args = process.argv.slice(2);
	
	if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
		console.log(`
Twilio SMS Test Script
======================

Usage:
  node scripts/test-twilio-sms.js <phone-number> [message]

Arguments:
  phone-number    Destination phone number in E.164 format (e.g., +14155551234)
  message         Optional message text (default: "Test message from Twilio")

Environment Variables Required:
  TWILIO_ACCOUNT_SID or TWILIO_SID
  TWILIO_AUTH_TOKEN or TWILIO_SECRET
  TWILIO_PHONE_NUMBER

Examples:
  node scripts/test-twilio-sms.js +14155551234
  node scripts/test-twilio-sms.js +14155551234 "Hello from Twilio!"

Options:
  --help, -h      Show this help message
		`);
		process.exit(0);
	}

	const phoneNumber = args[0];
	const message = args[1] || 'Test message from Twilio';

	return { phoneNumber, message };
}

/**
 * Validate phone number format
 */
function validatePhoneNumber(phoneNumber) {
	const phoneRegex = /^\+[1-9]\d{1,14}$/;
	if (!phoneRegex.test(phoneNumber)) {
		console.error('❌ Invalid phone number format');
		console.error('   Phone number must be in E.164 format (e.g., +14155551234)');
		console.error('   Format: +[country code][number]');
		process.exit(1);
	}
}

/**
 * Get Twilio credentials from environment
 */
function getTwilioCredentials() {
	const accountSid = process.env.TWILIO_ACCOUNT_SID || process.env.TWILIO_SID;
	const authToken = process.env.TWILIO_AUTH_TOKEN || process.env.TWILIO_SECRET;
	const fromNumber = process.env.TWILIO_PHONE_NUMBER;

	const missing = [];
	if (!accountSid) missing.push('TWILIO_ACCOUNT_SID or TWILIO_SID');
	if (!authToken) missing.push('TWILIO_AUTH_TOKEN or TWILIO_SECRET');
	if (!fromNumber) missing.push('TWILIO_PHONE_NUMBER');

	if (missing.length > 0) {
		console.error('❌ Missing required environment variables:');
		missing.forEach(v => console.error(`   - ${v}`));
		console.error('\nAdd these to your .env file or export them:');
		console.error('   export TWILIO_ACCOUNT_SID=your_account_sid');
		console.error('   export TWILIO_AUTH_TOKEN=your_auth_token');
		console.error('   export TWILIO_PHONE_NUMBER=+1234567890');
		process.exit(1);
	}

	return { accountSid, authToken, fromNumber };
}

/**
 * Send SMS via Twilio
 */
async function sendSMS(phoneNumber, message) {
	console.log('\n📱 Twilio SMS Test\n');
	console.log('═'.repeat(50));

	// Get credentials
	const { accountSid, authToken, fromNumber } = getTwilioCredentials();

	// Validate phone number
	validatePhoneNumber(phoneNumber);

	// Display configuration
	console.log('\n📋 Configuration:');
	console.log(`   Account SID: ${accountSid.substring(0, 10)}...`);
	console.log(`   From Number: ${fromNumber}`);
	console.log(`   To Number:   ${phoneNumber}`);
	console.log(`   Message:     "${message}"`);
	console.log('\n' + '─'.repeat(50));

	try {
		// Initialize Twilio client
		console.log('\n🔄 Initializing Twilio client...');
		const client = twilio(accountSid, authToken);

		// Send SMS
		console.log('📤 Sending SMS...');
		const messageResponse = await client.messages.create({
			body: message,
			from: fromNumber,
			to: phoneNumber
		});

		// Display success
		console.log('\n✅ SMS sent successfully!\n');
		console.log('📊 Message Details:');
		console.log(`   Message SID:  ${messageResponse.sid}`);
		console.log(`   Status:       ${messageResponse.status}`);
		console.log(`   Direction:    ${messageResponse.direction}`);
		console.log(`   Price:        ${messageResponse.price || 'Pending'} ${messageResponse.priceUnit || ''}`);
		console.log(`   Date Created: ${messageResponse.dateCreated}`);

		// Display next steps
		console.log('\n' + '═'.repeat(50));
		console.log('\n📝 Next Steps:\n');
		console.log('1. Check your phone for the SMS message');
		console.log('2. If not received, check Twilio Console:');
		console.log('   https://console.twilio.com/us1/monitor/logs/sms');
		console.log(`3. Search for Message SID: ${messageResponse.sid}`);
		console.log('4. Check the delivery status and any error codes');

		// Display status meanings
		console.log('\n📖 Status Meanings:');
		console.log('   queued      - Message queued for sending');
		console.log('   sending     - Message is being sent');
		console.log('   sent        - Message sent to carrier');
		console.log('   delivered   - Message delivered to phone');
		console.log('   failed      - Message failed to send');
		console.log('   undelivered - Carrier could not deliver');

		console.log('\n' + '═'.repeat(50) + '\n');

		// Exit successfully
		process.exit(0);

	} catch (error) {
		console.error('\n❌ Error sending SMS:\n');
		console.error(`   Error: ${error.message}`);
		
		if (error.code) {
			console.error(`   Code:  ${error.code}`);
		}
		
		if (error.moreInfo) {
			console.error(`   Info:  ${error.moreInfo}`);
		}

		// Provide helpful suggestions based on error
		console.error('\n💡 Troubleshooting:\n');
		
		if (error.code === 20003) {
			console.error('   Authentication failed. Check your credentials:');
			console.error('   - Verify TWILIO_ACCOUNT_SID is correct');
			console.error('   - Verify TWILIO_AUTH_TOKEN is correct');
			console.error('   - Check https://console.twilio.com/ for correct values');
		} else if (error.code === 21211) {
			console.error('   Invalid phone number format.');
			console.error('   - Ensure number is in E.164 format: +[country][number]');
			console.error('   - Example: +14155551234');
		} else if (error.code === 21610) {
			console.error('   Unverified phone number (Trial account).');
			console.error('   - Verify the destination number in Twilio Console');
			console.error('   - Or upgrade to a paid Twilio account');
			console.error('   - https://console.twilio.com/us1/develop/phone-numbers/manage/verified');
		} else if (error.code === 21608) {
			console.error('   The number is not a valid mobile number.');
			console.error('   - Ensure it\'s a mobile number, not landline');
			console.error('   - Try a different phone number');
		} else {
			console.error('   Check Twilio documentation for error code:');
			console.error(`   https://www.twilio.com/docs/api/errors/${error.code || 'general'}`);
		}

		console.error('\n' + '═'.repeat(50) + '\n');
		process.exit(1);
	}
}

// Run the script
const { phoneNumber, message } = parseArgs();
sendSMS(phoneNumber, message);