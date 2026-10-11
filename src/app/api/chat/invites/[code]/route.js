import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api/middleware/auth.js';
import { getServiceRoleClient } from '@/lib/supabase/service-role.js';
import { GroupInviteError, appUserId, previewInvite } from '@/lib/chat/group-invites.js';

/** GET /api/chat/invites/[code]: the group a link leads to, shown on /join/<code>. */
export const GET = withAuth(async ({ locals, context }) => {
	try {
		const { code } = (await context?.params) || {};
		const db = getServiceRoleClient();
		return NextResponse.json(await previewInvite(db, code, await appUserId(db, locals.user.id)));
	} catch (error) {
		if (error instanceof GroupInviteError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
		console.error('[chat/invites]', error);
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
	}
});
