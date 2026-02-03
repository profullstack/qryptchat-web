import { json } from '@sveltejs/kit';
import { createServiceRoleClient } from '$lib/supabase/service-role.js';
import { createSMSWebhookEmailService } from '$lib/services/mailgun-email-service.js';
import crypto from 'crypto';

// Lazy service role client creation
let supabase = null;
function getServiceRoleClient() {
	if (!supabase) {
		supabase = createServiceRoleClient();
	}
	return supabase;
}

/**
 * Verify Telnyx webhook signature
 * @see https://developers.telnyx.com/docs/v2/messaging/webhooks
 */
function verifyTelnyxSignature(payload, signature, timestamp, publicKey) {
	if (!publicKey) {
		console.warn('[TELNYX-WEBHOOK] TELNYX_PUBLIC_KEY not configured - skipping signature verification');
		return true; // Allow if not configured (backward compatibility)
	}

	if (!signature || !timestamp) {
		console.error('[TELNYX-WEBHOOK] Missing signature or timestamp headers');
		return false;
	}

	try {
		// Telnyx signs: timestamp + '|' + payload
		const signedPayload = `${timestamp}|${payload}`;
		
		// Verify using ed25519 (Telnyx uses this algorithm)
		const isValid = crypto.verify(
			null, // algorithm is determined by key type
			Buffer.from(signedPayload),
			{
				key: publicKey,
				format: 'pem',
				type: 'spki'
			},
			Buffer.from(signature, 'base64')
		);

		return isValid;
	} catch (error) {
		console.error('[TELNYX-WEBHOOK] Signature verification error:', error.message);
		return false;
	}
}

/**
 * POST /api/webhooks/telnyx/sms
 * Webhook endpoint for receiving inbound SMS messages from Telnyx
 * This handles SMS replies for OTP verification during registration
 */
export async function POST({ request }) {
	try {
		// Get raw body for signature verification
		const rawBody = await request.text();
		
		// Verify webhook signature (if configured)
		const telnyxPublicKey = process.env.TELNYX_PUBLIC_KEY;
		const signature = request.headers.get('telnyx-signature-ed25519');
		const timestamp = request.headers.get('telnyx-timestamp');

		if (telnyxPublicKey && !verifyTelnyxSignature(rawBody, signature, timestamp, telnyxPublicKey)) {
			console.error('[TELNYX-WEBHOOK] Invalid signature - rejecting webhook');
			return json({ error: 'Invalid signature' }, { status: 401 });
		}

		const body = JSON.parse(rawBody);
		
		// Log the incoming webhook for debugging
		console.log('[TELNYX-WEBHOOK] Received webhook:', {
			timestamp: new Date().toISOString(),
			eventType: body.data?.event_type,
			messageId: body.data?.payload?.id,
			from: body.data?.payload?.from?.phone_number,
			to: body.data?.payload?.to?.[0]?.phone_number,
			text: body.data?.payload?.text
		});

		// Send webhook payload to otp@qrypt.chat via email
		try {
			const emailService = createSMSWebhookEmailService();
			if (emailService) {
				const emailResult = await emailService.sendSMSWebhookAlert(body);
				console.log('[TELNYX-WEBHOOK] Email notification sent:', {
					success: emailResult.success,
					messageId: emailResult.messageId,
					error: emailResult.error
				});
			} else {
				console.log('[TELNYX-WEBHOOK] Email service not configured, skipping email notification');
			}
		} catch (emailError) {
			console.error('[TELNYX-WEBHOOK] Failed to send email notification:', emailError);
			// Don't fail the webhook processing if email fails
		}

		// Verify this is a message received event
		if (body.data?.event_type !== 'message.received') {
			console.log('[TELNYX-WEBHOOK] Ignoring non-message event:', body.data?.event_type);
			return json({ status: 'ignored', reason: 'not_message_received_event' });
		}

		const payload = body.data.payload;
		const fromPhone = payload.from?.phone_number;
		const toPhone = payload.to?.[0]?.phone_number;
		const messageText = payload.text;
		const messageId = payload.id;

		if (!fromPhone || !messageText) {
			console.log('[TELNYX-WEBHOOK] Missing required fields:', { fromPhone, messageText });
			return json({ error: 'Missing required fields' }, { status: 400 });
		}

		// Extract OTP code from message text (assuming it's just the code)
		const otpCode = messageText.trim();
		
		// Validate OTP format (6 digits)
		if (!/^\d{6}$/.test(otpCode)) {
			console.log('[TELNYX-WEBHOOK] Invalid OTP format:', otpCode);
			return json({ status: 'ignored', reason: 'invalid_otp_format' });
		}

		// Use Supabase service role client to verify the OTP
		const supabase = getServiceRoleClient();

		try {
			// Attempt to verify the OTP with Supabase Auth
			const { data, error } = await supabase.auth.verifyOtp({
				phone: fromPhone,
				token: otpCode,
				type: 'sms'
			});

			if (error) {
				console.log('[TELNYX-WEBHOOK] OTP verification failed:', {
					phone: fromPhone,
					code: otpCode,
					error: error.message
				});
				
				// Send response back to user via Telnyx (optional)
				await sendTelnyxResponse(toPhone, fromPhone, 'Invalid or expired code. Please try again.');
				
				return json({ 
					status: 'otp_verification_failed', 
					error: error.message 
				});
			}

			console.log('[TELNYX-WEBHOOK] OTP verification successful:', {
				phone: fromPhone,
				userId: data.user?.id
			});

			// Send success response back to user via Telnyx (optional)
			await sendTelnyxResponse(toPhone, fromPhone, 'Verification successful! You can now use QryptChat.');

			return json({ 
				status: 'success', 
				message: 'OTP verified successfully',
				userId: data.user?.id
			});

		} catch (verificationError) {
			console.error('[TELNYX-WEBHOOK] Error during OTP verification:', verificationError);
			
			// Send error response back to user via Telnyx (optional)
			await sendTelnyxResponse(toPhone, fromPhone, 'Verification failed. Please try again.');
			
			return json({ 
				status: 'error', 
				error: 'Verification failed' 
			}, { status: 500 });
		}

	} catch (error) {
		console.error('[TELNYX-WEBHOOK] Webhook processing error:', error);
		return json({ error: 'Webhook processing failed' }, { status: 500 });
	}
}

/**
 * Send a response SMS back to the user via Telnyx API
 * This is optional but provides better UX
 */
async function sendTelnyxResponse(fromPhone, toPhone, message) {
	try {
		const telnyxApiKey = process.env.TELNYX_API_KEY;
		if (!telnyxApiKey) {
			console.log('[TELNYX-WEBHOOK] No Telnyx API key configured, skipping response SMS');
			return;
		}

		const response = await fetch('https://api.telnyx.com/v2/messages', {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${telnyxApiKey}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				from: fromPhone, // Your Telnyx phone number
				to: toPhone,     // User's phone number
				text: message
			})
		});

		if (!response.ok) {
			const errorData = await response.json();
			console.error('[TELNYX-WEBHOOK] Failed to send response SMS:', errorData);
		} else {
			console.log('[TELNYX-WEBHOOK] Response SMS sent successfully');
		}
	} catch (error) {
		console.error('[TELNYX-WEBHOOK] Error sending response SMS:', error);
	}
}

/**
 * GET /api/webhooks/telnyx/sms
 * Health check endpoint for the webhook
 */
export async function GET() {
	return json({ 
		status: 'healthy', 
		service: 'telnyx-sms-webhook',
		timestamp: new Date().toISOString()
	});
}