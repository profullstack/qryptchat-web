/**
 * Accounts made with a passkey: an auth user with a confirmed synthetic
 * address (the magic-link bridge that mints sessions is addressed by email)
 * and the public users row, plus the session/user payload the /auth page
 * stores exactly as it does for the phone and CoinPay flows.
 */
import { randomUUID } from 'node:crypto';
import { mintSession } from './cli-auth.js';

const EMAIL_DOMAIN = process.env.PASSKEY_IDENTITY_EMAIL_DOMAIN || 'passkey.qrypt.chat';

/** Create the auth user + users row for a passkey sign-up; returns the auth user id. */
export async function provisionPasskeyAccount(service, { username, displayName }) {
	const { data: created, error } = await service.auth.admin.createUser({
		email: `${randomUUID()}@${EMAIL_DOMAIN}`,
		email_confirm: true,
		user_metadata: { provider: 'passkey' },
	});
	if (error || !created?.user) throw Object.assign(new Error('Could not create the account'), { status: 500 });
	const authUserId = created.user.id;
	const now = new Date().toISOString();
	const { error: insertError } = await service.from('users').insert({
		auth_user_id: authUserId,
		phone_number: null,
		account_type: 'verified',
		username,
		display_name: displayName || username,
		created_at: now,
		updated_at: now,
	});
	if (insertError) {
		await service.auth.admin.deleteUser(authUserId).catch(() => {});
		const taken = insertError.code === '23505';
		throw Object.assign(new Error(taken ? 'That username was just taken. Pick another.' : 'Could not create the account'), { status: taken ? 409 : 500 });
	}
	return authUserId;
}

/** A fresh session plus the users row, in the shape the /auth page stores. */
export async function signedIn(service, authUserId) {
	const session = await mintSession(service, authUserId);
	const { data: user } = await service.from('users').select('*').eq('auth_user_id', authUserId).maybeSingle();
	return { session, user: user ?? null };
}
