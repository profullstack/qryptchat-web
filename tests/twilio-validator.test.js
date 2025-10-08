/**
 * @fileoverview Tests for Twilio Validator Utilities
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
	validateTwilioCredentials,
	parseTwilioError,
	extractTwilioErrorCode,
	getSMSErrorDetails
} from '../src/lib/utils/twilio-validator.js';

describe('Twilio Validator', () => {
	describe('validateTwilioCredentials', () => {
		it('should validate correct credentials', () => {
			const result = validateTwilioCredentials({
				accountSid: 'AC' + '1'.repeat(32),
				authToken: '1'.repeat(32),
				phoneNumber: '+14155551234'
			});

			assert.strictEqual(result.valid, true);
			assert.strictEqual(result.errors.length, 0);
		});

		it('should reject invalid Account SID', () => {
			const result = validateTwilioCredentials({
				accountSid: 'INVALID',
				authToken: '1'.repeat(32),
				phoneNumber: '+14155551234'
			});

			assert.strictEqual(result.valid, false);
			assert.ok(result.errors.some(e => e.includes('Account SID')));
		});

		it('should reject invalid Auth Token', () => {
			const result = validateTwilioCredentials({
				accountSid: 'AC' + '1'.repeat(32),
				authToken: 'short',
				phoneNumber: '+14155551234'
			});

			assert.strictEqual(result.valid, false);
			assert.ok(result.errors.some(e => e.includes('Auth Token')));
		});

		it('should reject invalid phone number format', () => {
			const result = validateTwilioCredentials({
				accountSid: 'AC' + '1'.repeat(32),
				authToken: '1'.repeat(32),
				phoneNumber: '4155551234' // Missing +
			});

			assert.strictEqual(result.valid, false);
			assert.ok(result.errors.some(e => e.includes('E.164')));
		});

		it('should accept messaging service SID instead of phone number', () => {
			const result = validateTwilioCredentials({
				accountSid: 'AC' + '1'.repeat(32),
				authToken: '1'.repeat(32),
				messagingServiceSid: 'MG' + '1'.repeat(32)
			});

			assert.strictEqual(result.valid, true);
			assert.strictEqual(result.errors.length, 0);
		});
	});

	describe('parseTwilioError', () => {
		it('should parse authentication error (20003)', () => {
			const message = parseTwilioError(20003);
			assert.ok(message.includes('Authentication'));
			assert.ok(message.includes('Twilio'));
		});

		it('should parse unverified number error (21610)', () => {
			const message = parseTwilioError(21610);
			assert.ok(message.includes('verified'));
			assert.ok(message.includes('Trial'));
		});

		it('should handle unknown error codes', () => {
			const message = parseTwilioError(99999);
			assert.ok(message.includes('99999'));
		});
	});

	describe('extractTwilioErrorCode', () => {
		it('should extract error code from message', () => {
			const code = extractTwilioErrorCode('Error 20003: Authentication failed');
			assert.strictEqual(code, 20003);
		});

		it('should extract error code without "Error" prefix', () => {
			const code = extractTwilioErrorCode('20003: Authentication failed');
			assert.strictEqual(code, 20003);
		});

		it('should return null for no error code', () => {
			const code = extractTwilioErrorCode('Some random error');
			assert.strictEqual(code, null);
		});
	});

	describe('getSMSErrorDetails', () => {
		it('should handle authentication error', () => {
			const error = new Error('Error sending confirmation OTP to provider: Authenticate More information: https://www.twilio.com/docs/errors/20003');
			const details = getSMSErrorDetails(error);

			assert.strictEqual(details.twilioErrorCode, 20003);
			assert.strictEqual(details.actionRequired, 'CONFIGURE_TWILIO');
			assert.ok(details.userMessage.includes('authentication'));
			assert.ok(details.suggestion.includes('Twilio'));
		});

		it('should handle unverified number error', () => {
			const error = new Error('Error 21610: Unverified number');
			const details = getSMSErrorDetails(error);

			assert.strictEqual(details.twilioErrorCode, 21610);
			assert.strictEqual(details.actionRequired, 'VERIFY_NUMBER_OR_UPGRADE');
			assert.ok(details.userMessage.includes('unverified'));
		});

		it('should handle invalid phone format error', () => {
			const error = new Error('Error 21211: Invalid phone number');
			const details = getSMSErrorDetails(error);

			assert.strictEqual(details.twilioErrorCode, 21211);
			assert.strictEqual(details.actionRequired, 'FIX_PHONE_FORMAT');
			assert.ok(details.userMessage.includes('Invalid'));
		});

		it('should handle generic errors', () => {
			const error = new Error('Unknown error occurred');
			const details = getSMSErrorDetails(error);

			assert.strictEqual(details.twilioErrorCode, null);
			assert.ok(details.userMessage.includes('Failed to send SMS'));
		});
	});
});