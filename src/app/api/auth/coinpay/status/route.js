import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api/middleware/auth.js';
import { serviceClient } from '@/lib/auth/cli-auth.js';
import { getCoinpayConfig } from '@/lib/auth/coinpay.js';
import { isCoinpayEmail } from '@/lib/auth/coinpay-identity.js';
import { canDisconnect } from '@/lib/auth/coinpay-flow.js';

/** GET: whether CoinPay signs in to this account, for the Settings card. */
export const GET = withAuth(async ({ locals }) => {
	const service = serviceClient();
	const { data } = await service.auth.admin.getUserById(locals.user.id);
	const user = data?.user || locals.user;
	const { count } = await service
		.from('webauthn_credentials')
		.select('id', { count: 'exact', head: true })
		.eq('auth_user_id', user.id);
	const { clientId, clientSecret } = getCoinpayConfig();
	return NextResponse.json(
		{
			configured: !!(clientId && clientSecret),
			connected: !!user.app_metadata?.coinpay_sub,
			email: user.app_metadata?.coinpay_email || user.user_metadata?.coinpay_email || null,
			canDisconnect: canDisconnect(user, count || 0, isCoinpayEmail)
		},
		{ headers: { 'cache-control': 'no-store' } }
	);
});
