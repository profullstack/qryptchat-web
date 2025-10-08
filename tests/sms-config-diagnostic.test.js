/**
 * @fileoverview SMS Configuration Diagnostic Test
 * Tests to identify why SMS is not sending during login
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('SMS Configuration Diagnostic', () => {
	it('should check environment variables for SMS provider', () => {
		console.log('\n=== SMS Configuration Check ===\n');
		
		const requiredEnvVars = {
			'PUBLIC_SUPABASE_URL': process.env.PUBLIC_SUPABASE_URL,
			'PUBLIC_SUPABASE_ANON_KEY': process.env.PUBLIC_SUPABASE_ANON_KEY,
			'TWILIO_SID or TWILIO_ACCOUNT_SID': process.env.TWILIO_SID || process.env.TWILIO_ACCOUNT_SID,
			'TWILIO_SECRET or TWILIO_AUTH_TOKEN': process.env.TWILIO_SECRET || process.env.TWILIO_AUTH_TOKEN,
			'TWILIO_PHONE_NUMBER': process.env.TWILIO_PHONE_NUMBER,
			'TWILIO_MESSAGE_SERVICE_SID': process.env.TWILIO_MESSAGE_SERVICE_SID
		};

		console.log('Environment Variables Status:');
		let missingVars = [];
		
		for (const [key, value] of Object.entries(requiredEnvVars)) {
			const status = value ? '✓ SET' : '✗ MISSING';
			const displayValue = value ? (key.includes('KEY') || key.includes('SECRET') || key.includes('TOKEN') ? '[REDACTED]' : value.substring(0, 20) + '...') : 'NOT SET';
			console.log(`  ${status} ${key}: ${displayValue}`);
			
			if (!value) {
				missingVars.push(key);
			}
		}

		console.log('\n=== Diagnosis ===\n');
		
		if (missingVars.length > 0) {
			console.log('❌ ISSUE FOUND: Missing SMS provider configuration');
			console.log('\nMissing variables:');
			missingVars.forEach(v => console.log(`  - ${v}`));
			console.log('\n📋 SOLUTION:');
			console.log('1. Supabase local development uses Twilio for SMS');
			console.log('2. You need to configure Twilio credentials in your .env file');
			console.log('3. Add the following to your .env file:');
			console.log('\n   TWILIO_SID=your_twilio_account_sid');
			console.log('   TWILIO_SECRET=your_twilio_auth_token');
			console.log('   TWILIO_PHONE_NUMBER=+1XXXXXXXXXX');
			console.log('   TWILIO_MESSAGE_SERVICE_SID=your_message_service_sid (optional)');
			console.log('\n4. Get these credentials from: https://console.twilio.com/');
			console.log('5. Restart your Supabase local instance after adding credentials');
			console.log('\n⚠️  NOTE: For production, configure SMS provider in Supabase Dashboard');
		} else {
			console.log('✓ All SMS provider environment variables are set');
			console.log('\nIf SMS still not working, check:');
			console.log('1. Twilio credentials are valid');
			console.log('2. Twilio phone number is verified');
			console.log('3. Supabase local instance has been restarted');
			console.log('4. Check Supabase logs for SMS errors');
		}

		console.log('\n=== End Diagnostic ===\n');
		
		// Don't fail the test, just report
		assert.ok(true, 'Diagnostic completed');
	});

	it('should check Supabase config.toml for SMS settings', async () => {
		console.log('\n=== Supabase Config Check ===\n');
		
		try {
			const fs = await import('node:fs/promises');
			const path = await import('node:path');
			
			const configPath = path.join(process.cwd(), 'supabase', 'config.toml');
			const configContent = await fs.readFile(configPath, 'utf-8');
			
			// Check for SMS configuration
			const hasSMSSection = configContent.includes('[auth.sms]');
			const smsSignupEnabled = configContent.includes('enable_signup = true');
			const smsConfirmationsEnabled = configContent.includes('enable_confirmations = true');
			
			console.log('Supabase Config Status:');
			console.log(`  ${hasSMSSection ? '✓' : '✗'} [auth.sms] section exists`);
			console.log(`  ${smsSignupEnabled ? '✓' : '✗'} SMS signup enabled`);
			console.log(`  ${smsConfirmationsEnabled ? '✓' : '✗'} SMS confirmations enabled`);
			
			if (hasSMSSection && smsSignupEnabled) {
				console.log('\n✓ Supabase SMS configuration looks correct');
				console.log('\n⚠️  IMPORTANT: Supabase local dev requires Twilio credentials');
				console.log('   These must be set as environment variables (see above)');
			} else {
				console.log('\n❌ Supabase SMS configuration incomplete');
			}
			
		} catch (error) {
			console.log('❌ Could not read supabase/config.toml:', error.message);
		}
		
		console.log('\n=== End Config Check ===\n');
		assert.ok(true, 'Config check completed');
	});
});