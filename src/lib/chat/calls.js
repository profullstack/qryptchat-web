/**
 * End-to-end encrypted calls (voice, video, screen) on PairUX's SFU.
 *
 * Starting a call sends an ordinary qrypt message of type 'call' whose
 * ENCRYPTED body carries the room and a fresh 32-byte media key:
 *   { v: 1, type: 'call', room, key, video, at }
 * Like every message it is ML-KEM-1024 encrypted per participant, so only the
 * people in the conversation ever hold the key. @profullstack/pairux-embed
 * encrypts every frame with it in the browser; PairUX forwards ciphertext and
 * neither qrypt's server nor PairUX can hear or see the call.
 */

export const CALL_TYPE = 'call';
/** A call card stops offering Join after this long. */
export const CALL_JOINABLE_MS = 6 * 60 * 60 * 1000;

const b64 = (bytes) => {
	let s = '';
	for (const b of bytes) s += String.fromCharCode(b);
	return btoa(s);
};

/** A fresh media key (32 random bytes). */
export function newCallKey() {
	return crypto.getRandomValues(new Uint8Array(32));
}

/** The encrypted body of a call invite. */
export function callEnvelope({ room, key, video = false, at = new Date().toISOString() }) {
	return JSON.stringify({ v: 1, type: CALL_TYPE, room: String(room), key: b64(key), video: !!video, at });
}

/** A call invite from decrypted content, or null. */
export function parseCall(content) {
	try {
		const d = JSON.parse(content);
		if (d?.type !== CALL_TYPE || typeof d.room !== 'string' || typeof d.key !== 'string') return null;
		const key = Uint8Array.from(atob(d.key), (c) => c.charCodeAt(0));
		if (key.length < 32) return null;
		return { room: d.room, key, video: !!d.video, at: typeof d.at === 'string' ? d.at : null };
	} catch {
		return null;
	}
}

/** Whether a call invite is recent enough to join. */
export function isJoinable(call, createdAt, now = Date.now()) {
	if (!call) return false;
	const started = Date.parse(call.at ?? createdAt);
	return Number.isFinite(started) && now - started < CALL_JOINABLE_MS;
}

/** One-line text for a call invite (conversation previews, qc). */
export function callSummary(message, myUserId) {
	const call = parseCall(message.content);
	const who = message.sender_id === myUserId ? 'You' : message.sender?.display_name || message.sender?.username || 'Someone';
	return `📞 ${who} started ${call?.video ? 'a video' : 'a voice'} call`;
}
