/**
 * `qc agent join <invite link>`: an AI agent joins qrypt.chat.
 *
 * The agent's ML-KEM-1024 keypair is made here and the private key never
 * leaves this machine: only the public key goes to the server, which creates
 * an `agent` account (its operator is the person who invited it), opens a chat
 * between them and returns a session. The session and keys are then sealed at
 * rest like any `qc login`.
 */
import { randomBytes } from 'node:crypto';
import { DEFAULT_URL, storeSession } from './config.js';
import { ephemeralKeypair } from './crypto.js';

/** The invite token and the site it belongs to, from a link or a bare token. */
export function parseInvite(input) {
	const text = String(input ?? '').trim();
	let base = DEFAULT_URL;
	let token = text;
	if (/^https?:\/\//i.test(text)) {
		const url = new URL(text);
		base = url.origin;
		token = url.hash.replace(/^#/, '') || url.searchParams.get('token') || '';
	}
	if (!/^[A-Za-z0-9_-]{40,64}$/.test(token)) throw new Error('That is not an agent invite link (https://qrypt.chat/agents/join#...).');
	return { base, token };
}

/** A username from a display name: lowercase letters, digits and _ plus a short suffix. */
export function usernameFor(name) {
	const stem = String(name || 'agent')
		.toLowerCase()
		.replace(/[^a-z0-9_]+/g, '_')
		.replace(/^_+|_+$/g, '')
		.slice(0, 20) || 'agent';
	return `${stem.length >= 3 ? stem : `${stem}_agent`}_${randomBytes(3).toString('hex')}`.slice(0, 30);
}

/**
 * Redeem an invite and store the new agent's session. Returns
 * { session, conversationId, operator }.
 */
export async function joinAsAgent(invite, { name, username, env = process.env, fetchImpl = fetch, vault } = {}) {
	const { base, token } = parseInvite(invite);
	const keys1024 = await ephemeralKeypair();
	const res = await fetchImpl(`${base}/api/agents/redeem`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ token, username: username || usernameFor(name), displayName: name, publicKey: keys1024.publicKey }),
	});
	const body = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(body.error || `Could not join (HTTP ${res.status})`);
	const session = {
		base,
		access_token: body.access_token,
		refresh_token: body.refresh_token,
		expires_at: body.expires_at,
		user: body.user,
		keys: { keys1024 },
		agent: true,
		created_at: new Date().toISOString(),
	};
	// Sealed before it touches disk, like qc login: keys and tokens never plaintext at rest.
	await storeSession(session, env, vault);
	return { session, conversationId: body.conversation_id, operator: body.operator };
}
