import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api/middleware/auth.js';
import { hangupCall } from '@/lib/server/phone.js';
import { phoneContext, phoneError, phoneUser } from '@/lib/server/phone-route.js';

/** POST /api/phone/hangup { callId }: end this user's call on both legs. */
export const POST = withAuth(async ({ request, locals }) => {
	try {
		const body = await request.json().catch(() => ({}));
		const ctx = phoneContext();
		const user = await phoneUser(ctx.db, locals.user.id);
		return NextResponse.json(await hangupCall({ ...ctx, user, callId: String(body?.callId || '') }));
	} catch (error) {
		return phoneError(error, 'hangup');
	}
});
