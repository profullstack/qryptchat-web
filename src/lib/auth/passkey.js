/**
 * Passkeys for qrypt.chat: sign up with no phone number, sign in with a tap,
 * and add a passkey to an account that signed up another way.
 *
 *   register-options -> navigator.credentials.create -> register-verify
 *   login-options    -> navigator.credentials.get    -> login-verify
 *
 * Sign-in is discoverable (usernameless): the browser offers the passkeys it
 * holds for this site, so the endpoint never says whether a username exists.
 * Sessions come from the same magic-link bridge the CLI and CoinPay use
 * (mintSession), which gives a passkey-only account a confirmed synthetic
 * address of its own.
 *
 * The relying party is the host the browser is on: qrypt.chat, or the onion
 * address when reached over Tor. A passkey works on the host that made it.
 */
import { randomBytes } from 'node:crypto';
import {
	generateAuthenticationOptions,
	generateRegistrationOptions,
	verifyAuthenticationResponse,
	verifyRegistrationResponse,
} from '@simplewebauthn/server';

export const RP_NAME = 'QryptChat';
export const CHALLENGE_TTL_MS = 5 * 60 * 1000;
export const USERNAME_RE = /^[A-Za-z0-9_]{3,30}$/;

export class PasskeyError extends Error {
	constructor(message, status = 400) {
		super(message);
		this.name = 'PasskeyError';
		this.status = status;
	}
}

const b64url = (buf) => Buffer.from(buf).toString('base64url');
const fromB64url = (s) => new Uint8Array(Buffer.from(s, 'base64url'));

/**
 * The origin and RP ID for this request, from the browser's Origin header,
 * accepted only for the app's own host, an onion host, or localhost in dev.
 */
export function relyingParty(request, env = process.env) {
	const origin = request.headers.get('origin');
	if (!origin) throw new PasskeyError('Missing Origin header');
	let url;
	try {
		url = new URL(origin);
	} catch {
		throw new PasskeyError('Bad Origin header');
	}
	const allowed = new Set(
		[env.NEXT_PUBLIC_APP_URL, env.PUBLIC_APP_URL, 'https://qrypt.chat']
			.filter(Boolean)
			.map((u) => {
				try {
					return new URL(u).hostname;
				} catch {
					return null;
				}
			})
			.filter(Boolean),
	);
	const host = url.hostname;
	const ok =
		(url.protocol === 'https:' && allowed.has(host)) ||
		host.endsWith('.onion') ||
		(env.NODE_ENV !== 'production' && (host === 'localhost' || host === '127.0.0.1'));
	if (!ok) throw new PasskeyError('Passkeys are not available on this address', 403);
	return { origin: url.origin, rpID: host };
}

async function storeChallenge(service, row) {
	const id = b64url(randomBytes(18));
	const { error } = await service.from('webauthn_challenges').insert({
		id,
		...row,
		expires_at: new Date(Date.now() + CHALLENGE_TTL_MS).toISOString(),
	});
	if (error) throw new PasskeyError('Could not start the passkey ceremony', 500);
	return id;
}

/** Load a challenge of the expected kind and burn it (conditional update). */
async function takeChallenge(service, id, kind) {
	if (typeof id !== 'string' || !id) throw new PasskeyError('Missing challenge');
	const { data: row } = await service.from('webauthn_challenges').select('*').eq('id', id).maybeSingle();
	if (!row || row.kind !== kind || row.consumed_at || new Date(row.expires_at) < new Date()) {
		throw new PasskeyError('That passkey request expired. Try again.');
	}
	const { data: burned } = await service
		.from('webauthn_challenges')
		.update({ consumed_at: new Date().toISOString() })
		.eq('id', id)
		.is('consumed_at', null)
		.select('id');
	if (!Array.isArray(burned) || burned.length === 0) throw new PasskeyError('That passkey request was already used.');
	return row;
}

async function usernameTaken(service, username) {
	const { data } = await service.from('users').select('id').ilike('username', username).maybeSingle();
	return !!data;
}

/**
 * Options for creating a passkey.
 * Signed in (authUserId): add one to that account. Otherwise: sign up as `username`.
 */
export async function registrationOptions(service, { rp, authUserId, username, displayName }) {
	let userName;
	let userDisplayName;
	let userHandle;
	let excludeCredentials = [];
	const row = { kind: 'register', rp_id: rp.rpID, origin: rp.origin };

	if (authUserId) {
		const { data: user } = await service.from('users').select('username, display_name').eq('auth_user_id', authUserId).maybeSingle();
		userName = user?.username || 'qryptchat';
		userDisplayName = user?.display_name || userName;
		userHandle = b64url(Buffer.from(authUserId.replace(/-/g, ''), 'hex'));
		const { data: creds } = await service.from('webauthn_credentials').select('credential_id, transports').eq('auth_user_id', authUserId);
		excludeCredentials = (creds || []).map((c) => ({ id: c.credential_id, transports: c.transports }));
		row.auth_user_id = authUserId;
	} else {
		const name = String(username || '').trim();
		if (!USERNAME_RE.test(name)) throw new PasskeyError('Choose a username of 3-30 letters, digits or underscores.');
		if (await usernameTaken(service, name)) throw new PasskeyError('That username is taken.', 409);
		userName = name;
		userDisplayName = String(displayName || '').trim().slice(0, 60) || name;
		userHandle = b64url(randomBytes(16));
		row.username = name;
		row.display_name = userDisplayName;
	}
	row.user_handle = userHandle;

	const options = await generateRegistrationOptions({
		rpName: RP_NAME,
		rpID: rp.rpID,
		userName,
		userDisplayName,
		userID: fromB64url(userHandle),
		attestationType: 'none',
		excludeCredentials,
		authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
	});
	const challengeId = await storeChallenge(service, { ...row, challenge: options.challenge });
	return { challengeId, options };
}

async function saveCredential(service, authUserId, info, name) {
	const { credential, credentialDeviceType, credentialBackedUp } = info;
	const { error } = await service.from('webauthn_credentials').insert({
		auth_user_id: authUserId,
		credential_id: credential.id,
		public_key: b64url(credential.publicKey),
		counter: credential.counter ?? 0,
		transports: credential.transports ?? [],
		device_type: credentialDeviceType,
		backed_up: !!credentialBackedUp,
		name: typeof name === 'string' && name.trim() ? name.trim().slice(0, 60) : null,
	});
	if (error) {
		if (error.code === '23505') throw new PasskeyError('That passkey is already registered.', 409);
		throw new PasskeyError('Could not save the passkey', 500);
	}
}

/**
 * Finish creating a passkey. Returns { authUserId, created } where created
 * means a new account was made (sign-up) rather than a passkey added.
 */
export async function registrationVerify(service, { challengeId, response, name, provision }) {
	const row = await takeChallenge(service, challengeId, 'register');
	let verification;
	try {
		verification = await verifyRegistrationResponse({
			response,
			expectedChallenge: row.challenge,
			expectedOrigin: row.origin,
			expectedRPID: row.rp_id,
			requireUserVerification: false,
		});
	} catch (err) {
		throw new PasskeyError(`The passkey could not be verified: ${err.message}`);
	}
	if (!verification.verified || !verification.registrationInfo) throw new PasskeyError('The passkey could not be verified');

	if (row.auth_user_id) {
		await saveCredential(service, row.auth_user_id, verification.registrationInfo, name);
		return { authUserId: row.auth_user_id, created: false };
	}

	// Sign-up: the username was free when the ceremony started; check again.
	if (await usernameTaken(service, row.username)) throw new PasskeyError('That username was just taken. Pick another.', 409);
	const authUserId = await provision({ username: row.username, displayName: row.display_name });
	await saveCredential(service, authUserId, verification.registrationInfo, name);
	return { authUserId, created: true };
}

export async function authenticationOptions(service, { rp }) {
	const options = await generateAuthenticationOptions({ rpID: rp.rpID, userVerification: 'preferred', allowCredentials: [] });
	const challengeId = await storeChallenge(service, { kind: 'login', challenge: options.challenge, rp_id: rp.rpID, origin: rp.origin });
	return { challengeId, options };
}

/** Finish a sign-in; returns the auth user id the passkey belongs to. */
export async function authenticationVerify(service, { challengeId, response }) {
	const row = await takeChallenge(service, challengeId, 'login');
	const credentialId = response?.id;
	if (typeof credentialId !== 'string') throw new PasskeyError('Missing passkey response');
	const { data: cred } = await service.from('webauthn_credentials').select('*').eq('credential_id', credentialId).maybeSingle();
	if (!cred) throw new PasskeyError('This passkey is not registered here. Sign up, or sign in another way and add it in Settings.', 404);

	let verification;
	try {
		verification = await verifyAuthenticationResponse({
			response,
			expectedChallenge: row.challenge,
			expectedOrigin: row.origin,
			expectedRPID: row.rp_id,
			credential: { id: cred.credential_id, publicKey: fromB64url(cred.public_key), counter: Number(cred.counter), transports: cred.transports },
			requireUserVerification: false,
		});
	} catch (err) {
		throw new PasskeyError(`The passkey could not be verified: ${err.message}`, 401);
	}
	if (!verification.verified) throw new PasskeyError('The passkey could not be verified', 401);

	await service
		.from('webauthn_credentials')
		.update({ counter: verification.authenticationInfo.newCounter, last_used_at: new Date().toISOString() })
		.eq('id', cred.id);
	return cred.auth_user_id;
}
