/**
 * CoinPay identity for qrypt.chat accounts: bound by CoinPay's `sub`, never by
 * email (CoinPay reports every address as unverified). See the callback route.
 */

const COINPAY_EMAIL_DOMAIN = process.env.COINPAY_IDENTITY_EMAIL_DOMAIN || 'coinpay.qrypt.chat';

/** Redirect-mode handoff: set by the callback on /auth, read once by the page. */
export const COINPAY_HANDOFF_COOKIE = 'qrypt_coinpay_handoff';

/** The session message the /auth page understands (expires_at is required by the store). */
export function sessionMessage(session, user) {
	return {
		type: 'coinpay-session',
		access_token: session.access_token,
		refresh_token: session.refresh_token,
		expires_at: session.expires_at,
		expires_in: session.expires_in,
		token_type: session.token_type,
		user: user || null
	};
}

/**
 * Find the auth user that carries this CoinPay subject (paged admin scan).
 * @param {import('@supabase/supabase-js').SupabaseClient} service
 * @param {string} sub
 */
export async function findAuthUserByCoinpaySub(service, sub) {
	const perPage = 200;
	for (let page = 1; page <= 50; page++) {
		// eslint-disable-next-line no-await-in-loop
		const { data, error } = await service.auth.admin.listUsers({ page, perPage });
		if (error) throw error;
		const match = (data?.users || []).find((u) => u.user_metadata?.coinpay_sub === sub);
		if (match) return match;
		if (!data?.users || data.users.length < perPage) break;
	}
	return null;
}

/** `<sub>@coinpay.qrypt.chat`, with the sub reduced to address-safe characters. */
export function coinpayEmail(sub) {
	const local = String(sub).toLowerCase().replace(/[^a-z0-9._-]/g, '-').replace(/^[.-]+|[.-]+$/g, '').slice(0, 60);
	return `${local || 'user'}@${COINPAY_EMAIL_DOMAIN}`;
}
