/**
 * Telnyx for phone calls from qrypt.chat (see src/lib/server/phone.js).
 *
 * The browser never dials the phone network itself: its WebRTC credential sits
 * on a credential connection with no outbound voice profile. The server rings
 * the browser through a Call Control app, then transfers that leg to the number
 * with a hard time limit, so the limit holds whatever the browser does.
 *
 * Env: TELNYX_API_KEY, TELNYX_PUBLIC_KEY (webhook signatures, raw 32-byte or PEM),
 *      TELNYX_CALL_APP_ID (Call Control app), TELNYX_CREDENTIAL_CONNECTION_ID,
 *      PHONE_CALLER_ID (+1 number shown to the people called).
 */
import crypto from 'node:crypto';

const API = 'https://api.telnyx.com/v2';

export class TelnyxError extends Error {
	constructor(message, status, code) {
		super(message);
		this.status = status;
		this.code = code;
	}
}

export function telnyxConfig(env = process.env) {
	return {
		apiKey: env.TELNYX_API_KEY,
		appId: env.TELNYX_CALL_APP_ID,
		connectionId: env.TELNYX_CREDENTIAL_CONNECTION_ID,
		callerId: env.PHONE_CALLER_ID,
		publicKey: env.TELNYX_PUBLIC_KEY,
	};
}

export const phoneConfigured = (env = process.env) => {
	const c = telnyxConfig(env);
	return !!(c.apiKey && c.appId && c.connectionId && c.callerId && c.publicKey);
};

export function telnyxClient({ apiKey, fetchImpl = fetch } = telnyxConfig()) {
	async function call(path, { method = 'POST', body, raw = false } = {}) {
		const res = await fetchImpl(`${API}${path}`, {
			method,
			headers: { Authorization: `Bearer ${apiKey}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
			body: body ? JSON.stringify(body) : undefined,
		});
		if (raw && res.ok) return res.text();
		const data = await res.json().catch(() => ({}));
		if (!res.ok) {
			const e = data?.errors?.[0];
			throw new TelnyxError(e?.detail || e?.title || `Telnyx HTTP ${res.status}`, res.status, e?.code);
		}
		return data.data;
	}
	const cc = (id) => `/calls/${encodeURIComponent(id)}/actions`;
	return {
		/** A WebRTC login for one user on the credential connection. */
		createCredential: (connectionId, name) => call('/telephony_credentials', { body: { connection_id: connectionId, name, tag: 'qrypt-phone' } }),
		/** A short-lived JWT the browser SDK logs in with. */
		loginToken: (credentialId) => call(`/telephony_credentials/${encodeURIComponent(credentialId)}/token`, { raw: true }),
		/** Ring the user's browser. */
		dial: (body) => call('/calls', { body }),
		transfer: (callControlId, body) => call(`${cc(callControlId)}/transfer`, { body }),
		hangup: (callControlId) => call(`${cc(callControlId)}/hangup`, { body: {} }),
		/**
		 * Telnyx's billing records for one call session (every leg, with `cost` in USD).
		 * Records appear a minute or so after the call; [] until then.
		 */
		async callRecords(sessionId) {
			if (!sessionId) return [];
			const out = [];
			for (const range of ['today', 'yesterday']) {
				for (let page = 1; page <= 4; page++) {
					const q = new URLSearchParams({ 'filter[record_type]': 'call-control', 'filter[date_range]': range, 'page[size]': '50', 'page[number]': String(page) });
					const res = await fetchImpl(`${API}/detail_records?${q}`, { headers: { Authorization: `Bearer ${apiKey}` } });
					const data = await res.json().catch(() => ({}));
					if (!res.ok) throw new TelnyxError(data?.errors?.[0]?.detail || `Telnyx HTTP ${res.status}`, res.status);
					const rows = data.data || [];
					out.push(...rows.filter((r) => r.telnyx_session_id === sessionId));
					if (rows.length < 50) break;
				}
				if (out.length) break;
			}
			return out;
		},
	};
}

/** Telnyx's key may be stored bare (32 bytes, base64) or as PEM: both verify. */
export function publicKeyObject(key) {
	const s = String(key || '').trim();
	if (s.startsWith('-----BEGIN')) return crypto.createPublicKey(s);
	const raw = Buffer.from(s, 'base64');
	if (raw.length !== 32) throw new Error('TELNYX_PUBLIC_KEY is neither PEM nor a 32-byte Ed25519 key');
	const der = Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), raw]);
	return crypto.createPublicKey({ key: der, format: 'der', type: 'spki' });
}

/**
 * Whether a webhook really came from Telnyx: Ed25519 over `${timestamp}|${body}`,
 * and no older than `toleranceSec` (replays).
 */
export function verifyWebhook({ body, signature, timestamp, publicKey, now = Date.now(), toleranceSec = 300 }) {
	if (!publicKey || !signature || !timestamp) return false;
	if (Math.abs(now / 1000 - Number(timestamp)) > toleranceSec) return false;
	try {
		return crypto.verify(null, Buffer.from(`${timestamp}|${body}`), publicKeyObject(publicKey), Buffer.from(signature, 'base64'));
	} catch {
		return false;
	}
}

/** client_state travels base64-encoded on every leg; we keep { c: callId }. */
export const encodeState = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64');
export function decodeState(s) {
	try {
		return s ? JSON.parse(Buffer.from(s, 'base64').toString('utf8')) : null;
	} catch {
		return null;
	}
}
