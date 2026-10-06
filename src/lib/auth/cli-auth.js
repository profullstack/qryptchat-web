/**
 * `qc login`: OAuth 2.1 authorization code + PKCE for the qc command-line client.
 *
 *   1. qc opens /cli/authorize with an S256 code_challenge, a loopback
 *      redirect_uri and an ephemeral ML-KEM-1024 public key.
 *   2. The signed-in web app approves: it seals the account keypair to that
 *      ephemeral key and POSTs /api/cli/authorize, which stores a one-time code.
 *   3. qc POSTs /api/cli/token with code + code_verifier and gets its OWN
 *      session (never a copy of the browser's: Supabase rotates refresh tokens,
 *      and two holders of one family revoke each other) plus the sealed keys.
 *
 * Refresh is grant_type=refresh_token on the same endpoint; Supabase rotates it.
 */
import { createHash, randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

export const CODE_TTL_MS = 5 * 60 * 1000;

/** Where a phone-only or anonymous account's magic-link address lives. */
const EMAIL_DOMAIN = process.env.CLI_IDENTITY_EMAIL_DOMAIN || 'cli.qrypt.chat';

export class CliAuthError extends Error {
	/** @param {string} code OAuth error code @param {string} message @param {number} [status] */
	constructor(code, message, status = 400) {
		super(message);
		this.name = 'CliAuthError';
		this.code = code;
		this.status = status;
	}
}

export const b64url = (buf) => Buffer.from(buf).toString('base64url');

/** S256: base64url(sha256(verifier)). */
export function pkceChallenge(verifier) {
	return b64url(createHash('sha256').update(verifier).digest());
}

export const hashCode = (code) => createHash('sha256').update(code).digest('hex');

export function newCode() {
	return b64url(randomBytes(32));
}

/** RFC 7636: 43-128 chars of [A-Za-z0-9-._~]. */
export function validVerifier(v) {
	return typeof v === 'string' && /^[A-Za-z0-9\-._~]{43,128}$/.test(v);
}

export function validChallenge(c) {
	return typeof c === 'string' && /^[A-Za-z0-9_-]{43}$/.test(c);
}

/**
 * Only a loopback redirect (RFC 8252 7.3), or "oob" when the CLI runs where no
 * browser can reach it back (SSH): the page then shows the code to paste.
 */
export function validRedirectUri(uri) {
	if (uri === 'oob') return true;
	try {
		const u = new URL(uri);
		return u.protocol === 'http:' && (u.hostname === '127.0.0.1' || u.hostname === '[::1]') && !!u.port && !u.username && !u.password && !u.hash;
	} catch {
		return false;
	}
}

/** A service-role client (bypasses RLS). */
export function serviceClient() {
	return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
		auth: { autoRefreshToken: false, persistSession: false }
	});
}

/** An anon client that never touches cookies: sessions here belong to the CLI. */
export function anonClient() {
	return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
		auth: { autoRefreshToken: false, persistSession: false }
	});
}

/**
 * The magic-link bridge is addressed by email. Phone-only and anonymous
 * accounts have none, so they get a confirmed synthetic one, the same way a
 * Moshpit name does (see name-account.js). It is keyed by the auth id, so it
 * can never collide with another account.
 */
export async function sessionEmail(service, authUserId) {
	const { data, error } = await service.auth.admin.getUserById(authUserId);
	if (error || !data?.user) throw new CliAuthError('server_error', 'Account not found', 500);
	if (data.user.email) return data.user.email;
	const email = `${authUserId}@${EMAIL_DOMAIN}`;
	const { error: updateError } = await service.auth.admin.updateUserById(authUserId, { email, email_confirm: true });
	if (updateError) throw new CliAuthError('server_error', 'Could not prepare a session for this account', 500);
	return email;
}

export function sessionPayload(session) {
	return {
		access_token: session.access_token,
		refresh_token: session.refresh_token,
		expires_at: session.expires_at,
		expires_in: session.expires_in,
		token_type: 'bearer'
	};
}

/** A fresh session for an account, independent of any browser's. */
export async function mintSession(service, authUserId) {
	const email = await sessionEmail(service, authUserId);
	const { data: link, error: linkError } = await service.auth.admin.generateLink({ type: 'magiclink', email });
	if (linkError || !link?.properties?.hashed_token) {
		throw new CliAuthError('server_error', 'Could not start a session', 500);
	}
	const { data, error } = await anonClient().auth.verifyOtp({ type: 'magiclink', token_hash: link.properties.hashed_token });
	if (error || !data?.session) throw new CliAuthError('server_error', 'Could not start a session', 500);
	return sessionPayload(data.session);
}

/** Store a one-time code for an approved request; returns the code itself. */
export async function issueCode(service, { authUserId, codeChallenge, redirectUri, clientName, keyBlob }) {
	if (!validChallenge(codeChallenge)) throw new CliAuthError('invalid_request', 'code_challenge must be an S256 challenge');
	if (!validRedirectUri(redirectUri)) throw new CliAuthError('invalid_request', 'redirect_uri must be a loopback address or "oob"');
	if (typeof keyBlob !== 'string' || keyBlob.length < 32 || keyBlob.length > 200_000) {
		throw new CliAuthError('invalid_request', 'key_blob is missing or malformed');
	}
	const code = newCode();
	const { error } = await service.from('cli_auth_codes').insert({
		code_hash: hashCode(code),
		auth_user_id: authUserId,
		code_challenge: codeChallenge,
		redirect_uri: redirectUri,
		client_name: typeof clientName === 'string' ? clientName.slice(0, 80) : null,
		key_blob: keyBlob,
		expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString()
	});
	if (error) throw new CliAuthError('server_error', 'Could not store the authorization', 500);
	return code;
}

/**
 * Trade a code + verifier for a session. Every check runs BEFORE the burn, and
 * the burn is a conditional UPDATE, so two racing requests cannot both win.
 */
export async function redeemCode(service, { code, codeVerifier, redirectUri }) {
	if (typeof code !== 'string' || !validVerifier(codeVerifier)) {
		throw new CliAuthError('invalid_request', 'code and code_verifier are required');
	}
	const codeHash = hashCode(code);
	const { data: row } = await service.from('cli_auth_codes').select('*').eq('code_hash', codeHash).maybeSingle();
	if (!row || row.consumed_at || new Date(row.expires_at) < new Date()) {
		throw new CliAuthError('invalid_grant', 'That code is unknown, used or expired');
	}
	if (row.redirect_uri !== redirectUri) throw new CliAuthError('invalid_grant', 'redirect_uri does not match');
	if (pkceChallenge(codeVerifier) !== row.code_challenge) throw new CliAuthError('invalid_grant', 'code_verifier does not match');

	const { data: burned } = await service
		.from('cli_auth_codes')
		.update({ consumed_at: new Date().toISOString() })
		.eq('code_hash', codeHash)
		.is('consumed_at', null)
		.select('code_hash');
	if (!Array.isArray(burned) || burned.length === 0) throw new CliAuthError('invalid_grant', 'That code has already been used');

	const session = await mintSession(service, row.auth_user_id);
	const { data: user } = await service
		.from('users')
		.select('id, username, display_name')
		.eq('auth_user_id', row.auth_user_id)
		.maybeSingle();
	return { ...session, key_blob: row.key_blob, user: user ?? null };
}

/** grant_type=refresh_token: Supabase rotates the token on every use. */
export async function refresh(refreshToken) {
	if (typeof refreshToken !== 'string' || !refreshToken) throw new CliAuthError('invalid_request', 'refresh_token is required');
	const { data, error } = await anonClient().auth.refreshSession({ refresh_token: refreshToken });
	if (error || !data?.session) throw new CliAuthError('invalid_grant', 'That refresh token is no longer valid; run qc login');
	return sessionPayload(data.session);
}
