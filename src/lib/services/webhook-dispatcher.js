import { getServiceRoleClient } from '$lib/supabase/service-role.js';

/**
 * Dispatch an event to all registered webhooks that subscribe to it.
 * Fires and forgets — failures are logged but don't block the caller.
 *
 * @param {string} userId - The user whose webhooks to trigger
 * @param {string} eventType - e.g. 'message.created', 'conversation.created'
 * @param {object} payload - Event data to send
 */
export async function dispatchWebhookEvent(userId, eventType, payload) {
	const supabase = getServiceRoleClient();

	const { data: webhooks, error } = await supabase
		.from('webhooks')
		.select('id, url, events')
		.eq('user_id', userId)
		.contains('events', [eventType]);

	if (error) {
		console.error('[WEBHOOK-DISPATCH] Query error:', error.message);
		return;
	}

	if (!webhooks || webhooks.length === 0) return;

	const body = JSON.stringify({
		event: eventType,
		timestamp: new Date().toISOString(),
		data: payload
	});

	await Promise.allSettled(
		webhooks.map(async (hook) => {
			try {
				const res = await fetch(hook.url, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body,
					signal: AbortSignal.timeout(10000)
				});
				if (!res.ok) {
					console.error(`[WEBHOOK-DISPATCH] ${hook.url} returned ${res.status}`);
				}
			} catch (err) {
				console.error(`[WEBHOOK-DISPATCH] Failed to reach ${hook.url}:`, err.message);
			}
		})
	);
}
