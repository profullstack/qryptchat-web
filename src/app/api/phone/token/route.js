import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api/middleware/auth.js';
import { RateLimiter, applyRateLimitForKey } from '@/lib/server/rate-limiter.js';
import { loginToken } from '@/lib/server/phone.js';
import { phoneContext, phoneError, phoneUser } from '@/lib/server/phone-route.js';

const limiter = new RateLimiter({ maxRequests: 20, windowMs: 60 * 1000 });

/**
 * POST /api/phone/token: a short-lived login for the browser's phone line
 * (Telnyx WebRTC). The line can only receive calls; the server places them.
 */
export const POST = withAuth(async ({ locals }) => {
	const limited = applyRateLimitForKey(limiter, locals.user.id);
	if (limited) return limited;
	try {
		const ctx = phoneContext();
		const user = await phoneUser(ctx.db, locals.user.id);
		const { token } = await loginToken({ ...ctx, user });
		return NextResponse.json({ token }, { headers: { 'Cache-Control': 'no-store' } });
	} catch (error) {
		return phoneError(error, 'token');
	}
});
