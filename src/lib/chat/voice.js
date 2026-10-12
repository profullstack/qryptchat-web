/**
 * `/voice`: an anonymous PairUX room link, end-to-end encrypted.
 *
 *   https://pairux.com/r/<room>#k=<key>
 *
 * Made entirely on this device, the same way `pairux room` makes it: <room> is
 * 128 random bits and <key> is the 32-byte media key in the URL fragment, which
 * browsers never send to PairUX. Posted into a chat it travels inside an
 * ML-KEM-encrypted message, so only the people in the conversation hold it.
 * Nobody needs a PairUX (or qrypt) account to join.
 */

export const PAIRUX_URL = 'https://pairux.com';

const toBase64Url = (bytes) => {
	let s = '';
	for (const b of bytes) s += String.fromCharCode(b);
	return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/** A link to a fresh anonymous room. */
export function newVoiceRoomLink(base = PAIRUX_URL) {
	const room = toBase64Url(crypto.getRandomValues(new Uint8Array(16)));
	const key = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
	return `${String(base).replace(/\/$/, '')}/r/${room}#k=${key}`;
}

/** The chat message that carries a room link. */
export const voiceMessage = (url) => `🎙️ Join my end-to-end encrypted voice room (no account needed): ${url}`;

/**
 * A composer slash command, or null. Only the names given count, so an
 * ordinary message that happens to start with "/" is still sent as typed.
 */
export function parseSlashCommand(text, names) {
	const m = /^\/([a-z]+)(?:\s+(.*))?$/s.exec(String(text).trim());
	if (!m || !names.includes(m[1])) return null;
	return { name: m[1], args: (m[2] ?? '').trim() };
}
