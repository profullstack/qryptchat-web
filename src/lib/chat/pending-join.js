/**
 * A group invite opened while signed out: /join/<code> keeps the code here and
 * /chat redeems it after sign-in, whichever way the person signed in.
 */
export const PENDING_JOIN_KEY = 'qrypt_pending_join';

/** Take (read and clear) the pending invite code, or null. */
export function takePendingJoin(storage = globalThis.localStorage) {
	try {
		const code = storage?.getItem(PENDING_JOIN_KEY);
		if (code) storage.removeItem(PENDING_JOIN_KEY);
		return code || null;
	} catch {
		return null;
	}
}

/** Join the group for a pending code; returns its conversation id, or null. */
export async function redeemPendingJoin({ storage, fetchImpl = fetch } = {}) {
	const code = takePendingJoin(storage);
	if (!code) return null;
	try {
		const res = await fetchImpl('/api/conversations/join', {
			method: 'POST',
			credentials: 'include',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ code })
		});
		const data = await res.json().catch(() => ({}));
		return res.ok ? data.conversation_id ?? null : null;
	} catch {
		return null;
	}
}
