import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api/middleware/auth.js';
import { accountState, settlePending } from '@/lib/server/phone.js';
import { coinpayConfigured } from '@/lib/server/phone-credit.js';
import { phoneContext, phoneError, phoneUser } from '@/lib/server/phone-route.js';
import { ALLOWED_COUNTRIES, FREE_COUNTRIES, FREE_SECONDS_PER_DAY, INTL_MAX_MICROS_PER_MINUTE, TOPUP_DOLLARS, US_CA_MICROS_PER_MINUTE } from '@/lib/phone/rules.js';

export const dynamic = 'force-dynamic';

/** GET /api/phone: free minutes, credit, prices, recent calls, caller ID. */
export const GET = withAuth(async ({ locals }) => {
	try {
		const { db, store, telnyx, config } = phoneContext();
		const user = await phoneUser(db, locals.user.id);
		await settlePending({ store, telnyx, userId: user.id });
		const account = await accountState({ store, user });
		const calls = (await store.recentCalls(user.id)) || [];
		return NextResponse.json(
			{
				...account,
				freeSecondsPerDay: FREE_SECONDS_PER_DAY,
				freeCountries: FREE_COUNTRIES,
				countries: ALLOWED_COUNTRIES,
				prices: { usCaMicrosPerMinute: US_CA_MICROS_PER_MINUTE, intlMaxMicrosPerMinute: INTL_MAX_MICROS_PER_MINUTE, intl: 'twice the carrier cost' },
				topups: coinpayConfigured() ? TOPUP_DOLLARS : [],
				callerId: config.callerId,
				calls,
			},
			{ headers: { 'Cache-Control': 'no-store' } }
		);
	} catch (error) {
		return phoneError(error, 'status');
	}
});
