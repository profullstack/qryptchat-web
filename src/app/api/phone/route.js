import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api/middleware/auth.js';
import { accountState } from '@/lib/server/phone.js';
import { phoneContext, phoneError, phoneUser } from '@/lib/server/phone-route.js';
import { CENTS_PER_MINUTE, FREE_SECONDS_PER_DAY } from '@/lib/phone/rules.js';

export const dynamic = 'force-dynamic';

/** GET /api/phone: today's free minutes, recent calls, caller ID. */
export const GET = withAuth(async ({ locals }) => {
	try {
		const { db, store, config } = phoneContext();
		const user = await phoneUser(db, locals.user.id);
		const account = await accountState({ store, user });
		const calls = (await store.recentCalls(user.id)) || [];
		return NextResponse.json(
			{ ...account, freeSecondsPerDay: FREE_SECONDS_PER_DAY, centsPerMinute: CENTS_PER_MINUTE, callerId: config.callerId, calls },
			{ headers: { 'Cache-Control': 'no-store' } }
		);
	} catch (error) {
		return phoneError(error, 'status');
	}
});
