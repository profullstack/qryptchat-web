import { NextResponse } from 'next/server';
import { PhoneError } from '@/lib/server/phone.js';
import { handleCoinpayWebhook } from '@/lib/server/phone-credit.js';
import { phoneContext } from '@/lib/server/phone-route.js';

export const dynamic = 'force-dynamic';

/** POST /api/phone/coinpay-webhook: CoinPay payment events; a paid top-up adds phone credit once. */
export async function POST(request) {
	const rawBody = await request.text();
	try {
		const { store } = phoneContext();
		const result = await handleCoinpayWebhook({
			store,
			rawBody,
			signature: request.headers.get('x-coinpay-signature'),
			secret: process.env.COINPAY_WEBHOOK_SECRET,
		});
		return NextResponse.json({ ok: true, ...result });
	} catch (error) {
		if (error instanceof PhoneError) return NextResponse.json({ error: error.message }, { status: error.status });
		console.error('[phone/coinpay-webhook]', error?.message);
		return NextResponse.json({ error: 'failed' }, { status: 500 });
	}
}
