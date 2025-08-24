/**
 * @fileoverview SMS Configuration Test Script
 * Tests SMS configuration and sending to specific phone numbers
 */

import { diagnoseSMSConfig, generateDiagnosticReport } from '../src/lib/utils/sms-config-diagnostic.js';

// Test phone numbers provided by user
const TEST_PHONE_NUMBERS = [
	'+16508042454',
	'+16693223469'
];

/**
 * Test SMS configuration
 */
async function testSMSConfig() {
	console.log('=== SMS Configuration Test ===\n');
	
	// Load environment variables (simulate .env loading)
	const config = {
		PROJECT_REF: process.env.PROJECT_REF,
		SUPABASE_ACCESS_TOKEN: process.env.SUPABASE_ACCESS_TOKEN,
		TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
		TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
		TWILIO_PHONE_NUMBER: process.env.TWILIO_PHONE_NUMBER,
		TWILIO_MESSAGE_SERVICE_SID: process.env.TWILIO_MESSAGE_SERVICE_SID
	};
	
	// Run diagnostic
	const diagnostic = diagnoseSMSConfig(config);
	const report = generateDiagnosticReport(diagnostic);
	
	console.log(report);
	
	if (!diagnostic.isValid) {
		console.log('\n❌ Configuration is invalid. Please fix the issues above before testing SMS sending.');
		return;
	}
	
	console.log('\n✅ Configuration looks valid. Testing SMS sending...\n');
	
	// Test SMS sending to each phone number
	for (const phoneNumber of TEST_PHONE_NUMBERS) {
		await testSMSSending(phoneNumber);
		console.log(''); // Add spacing between tests
	}
}

/**
 * Test SMS sending to a specific phone number
 * @param {string} phoneNumber
 */
async function testSMSSending(phoneNumber) {
	console.log(`📱 Testing SMS to: ${phoneNumber}`);
	
	try {
		const response = await fetch('http://localhost:5173/api/auth/send-sms', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				phoneNumber
			})
		});
		
		const result = await response.json();
		
		if (response.ok) {
			console.log(`✅ SMS sent successfully to ${phoneNumber}`);
			if (result.logs) {
				console.log('Debug logs:', result.logs);
			}
		} else {
			console.log(`❌ SMS failed for ${phoneNumber}:`);
			console.log(`   Error: ${result.error}`);
			console.log(`   Code: ${result.code || 'N/A'}`);
			
			if (result.debug) {
				console.log('   Debug info:', result.debug);
			}
			
			if (result.logs) {
				console.log('   Debug logs:', result.logs);
			}
		}
		
	} catch (error) {
		console.log(`❌ Network error testing ${phoneNumber}:`, error.message);
	}
}

/**
 * Test the diagnostic API endpoint
 */
async function testDiagnosticAPI() {
	console.log('\n=== Testing Diagnostic API ===\n');
	
	try {
		const response = await fetch('http://localhost:5173/api/auth/debug-sms-config');
		const result = await response.json();
		
		if (response.ok) {
			console.log('✅ Diagnostic API working');
			console.log(result.report);
		} else {
			console.log('❌ Diagnostic API failed:', result.error);
		}
		
	} catch (error) {
		console.log('❌ Network error accessing diagnostic API:', error.message);
		console.log('Make sure your dev server is running on http://localhost:5173');
	}
}

/**
 * Main test function
 */
async function main() {
	console.log('SMS Configuration and Testing Tool');
	console.log('==================================\n');
	
	// First test the configuration
	await testSMSConfig();
	
	// Then test the diagnostic API
	await testDiagnosticAPI();
	
	console.log('\n=== Test Complete ===');
	console.log('\nIf SMS is only working for one number, this suggests:');
	console.log('1. Twilio trial account restrictions (can only send to verified numbers)');
	console.log('2. Phone number configuration issue (sending TO instead of FROM)');
	console.log('3. Geographic restrictions or carrier blocking');
	console.log('\nCheck the Twilio Console for more details about your account limits.');
}

// Run the test
main().catch(console.error);