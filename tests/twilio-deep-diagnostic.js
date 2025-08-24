/**
 * @fileoverview Deep Twilio Diagnostic Tool
 * Investigates SMS delivery issues for paid Twilio accounts
 */

/**
 * Test Twilio configuration and delivery status
 */
async function deepTwilioTest() {
	console.log('=== Deep Twilio SMS Diagnostic ===\n');
	
	const testNumbers = ['+16508042454', '+16693223469'];
	
	for (const phoneNumber of testNumbers) {
		console.log(`\n📱 Testing ${phoneNumber}:`);
		console.log('─'.repeat(50));
		
		try {
			// Test SMS sending
			const response = await fetch('http://localhost:8080/api/auth/send-sms', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ phoneNumber })
			});
			
			const result = await response.json();
			
			if (response.ok) {
				console.log('✅ API Response: SUCCESS');
				console.log(`   Message: ${result.message}`);
				
				// Show debug logs if available
				if (result.logs) {
					console.log('\n📋 Debug Logs:');
					result.logs.forEach(log => {
						console.log(`   [${log.level.toUpperCase()}] ${log.message}`);
						if (log.data) console.log(`   Data: ${log.data}`);
					});
				}
			} else {
				console.log('❌ API Response: FAILED');
				console.log(`   Error: ${result.error}`);
				console.log(`   Code: ${result.code || 'N/A'}`);
			}
			
		} catch (error) {
			console.log(`❌ Network Error: ${error.message}`);
		}
	}
	
	console.log('\n' + '='.repeat(60));
	console.log('NEXT STEPS FOR INVESTIGATION:');
	console.log('='.repeat(60));
	console.log('1. Check Twilio Console Logs:');
	console.log('   → Go to https://console.twilio.com/');
	console.log('   → Navigate to Monitor > Logs > Messaging');
	console.log('   → Look for recent SMS attempts');
	console.log('   → Check delivery status for both numbers');
	console.log('');
	console.log('2. Check Twilio Account Status:');
	console.log('   → Verify account is not suspended');
	console.log('   → Check SMS sending limits');
	console.log('   → Verify phone number ownership');
	console.log('');
	console.log('3. Check Geographic Restrictions:');
	console.log('   → Some carriers block SMS from certain regions');
	console.log('   → Check if recipient carrier has restrictions');
	console.log('');
	console.log('4. Check Supabase Configuration:');
	console.log('   → Verify Twilio credentials in Supabase dashboard');
	console.log('   → Check if "from" number is correct');
	console.log('   → Verify SMS template configuration');
}

// Run the diagnostic
deepTwilioTest().catch(console.error);