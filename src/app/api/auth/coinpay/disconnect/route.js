import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api/middleware/auth.js';
import { serviceClient } from '@/lib/auth/cli-auth.js';
import { isCoinpayEmail } from '@/lib/auth/coinpay-identity.js';
import { canDisconnect } from '@/lib/auth/coinpay-flow.js';

const noStore = { 'cache-control': 'no-store' };

/** POST: stop CoinPay signing in to this account, unless it is the only way in. */
export const POST = withAuth(async ({ locals }) => {
	const service = serviceClient();
	const { data, error } = await service.auth.admin.getUserById(locals.user.id);
	if (error || !data?.user) return NextResponse.json({ error: 'Not found' }, { status: 404, headers: noStore });
	const user = data.user;
	if (!user.app_metadata?.coinpay_sub) return NextResponse.json({ connected: false }, { headers: noStore });
	const { count } = await service
		.from('webauthn_credentials')
		.select('id', { count: 'exact', head: true })
		.eq('auth_user_id', user.id);
	if (!canDisconnect(user, count || 0, isCoinpayEmail)) {
		return NextResponse.json(
			{ error: 'CoinPay is the only way to sign in to this account. Add a passkey first, then disconnect.' },
			{ status: 409, headers: noStore }
		);
	}
	const { error: updateError } = await service.auth.admin.updateUserById(user.id, {
		app_metadata: { coinpay_sub: null, coinpay_email: null }
	});
	if (updateError) return NextResponse.json({ error: 'Could not disconnect CoinPay' }, { status: 500, headers: noStore });
	return NextResponse.json({ connected: false }, { headers: noStore });
});
