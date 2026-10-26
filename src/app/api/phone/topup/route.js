import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api/middleware/auth.js';
import { RateLimiter, applyRateLimitForKey } from '@/lib/server/rate-limiter.js';
import { PhoneError } from '@/lib/server/phone.js';
import { coinpayClient, coinpayConfigured, createTopup } from '@/lib/server/phone-credit.js';
import { phoneContext, phoneError, phoneUser } from '@/lib/server/phone-route.js';

const limiter = new RateLimiter({ maxRequests: 10, windowMs: 10 * 60 * 1000 });

/** POST /api/phone/topup { dollars }: a CoinPay checkout for phone credit; returns { url }. */
export const POST = withAuth(async ({ request, locals }) => {
	const limited = applyRateLimitForKey(limiter, locals.user.id);
	if (limited) return limited;
	try {
		if (!coinpayConfigured()) throw new PhoneError('Buying credit is not set up on this server.', 503);
		const body = await request.json().catch(() => ({}));
		const { db, store } = phoneContext();
		const user = await phoneUser(db, locals.user.id);
		const result = await createTopup({ store, coinpay: coinpayClient(), user, email: locals.user.email, dollars: body?.dollars });
		return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
	} catch (error) {
		if (error?.name === 'CoinPayError') {
			console.error('[phone/topup] coinpay', error.status, error.message);
			return NextResponse.json({ error: 'CoinPay could not start the checkout.' }, { status: 502 });
		}
		return phoneError(error, 'topup');
	}
});
