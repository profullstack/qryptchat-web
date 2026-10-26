import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api/middleware/auth.js';
import { RateLimiter, applyRateLimitForKey } from '@/lib/server/rate-limiter.js';
import { startCall } from '@/lib/server/phone.js';
import { phoneContext, phoneError, phoneUser } from '@/lib/server/phone-route.js';

const perMinute = new RateLimiter({ maxRequests: 10, windowMs: 60 * 1000 });
const perDay = new RateLimiter({ maxRequests: 200, windowMs: 24 * 60 * 60 * 1000 });

/**
 * POST /api/phone/call { to }: call a US or Canadian phone. Rings this user's
 * browser line first; the number is dialled once the browser answers.
 */
export const POST = withAuth(async ({ request, locals }) => {
	const limited = applyRateLimitForKey(perMinute, locals.user.id) || applyRateLimitForKey(perDay, locals.user.id);
	if (limited) return limited;
	try {
		const body = await request.json().catch(() => ({}));
		const ctx = phoneContext();
		const user = await phoneUser(ctx.db, locals.user.id);
		const result = await startCall({ ...ctx, user, to: body?.to });
		return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
	} catch (error) {
		return phoneError(error, 'call');
	}
});
