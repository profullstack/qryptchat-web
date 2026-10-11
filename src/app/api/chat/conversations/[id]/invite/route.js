import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api/middleware/auth.js';
import { getServiceRoleClient } from '@/lib/supabase/service-role.js';
import { getAppOrigin } from '@/lib/auth/coinpay.js';
import { GroupInviteError, activeInvite, appUserId, ensureInvite, inviteUrl, requireGroupAdmin, revokeInvite } from '@/lib/chat/group-invites.js';

const fail = (error) =>
	error instanceof GroupInviteError
		? NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
		: (console.error('[conversations/invite]', error), NextResponse.json({ error: 'Internal server error' }, { status: 500 }));

/** Run as an admin of the group in the route: handler(...) returns the response body. */
const asAdmin = (handler) =>
	withAuth(async ({ request, locals, context }) => {
		try {
			const { id } = (await context?.params) || {};
			const conversationId = String(id ?? '').trim();
			const db = getServiceRoleClient();
			const userId = await appUserId(db, locals.user.id);
			await requireGroupAdmin(db, conversationId, userId);
			const origin = getAppOrigin(new URL(request.url).origin);
			return NextResponse.json(await handler({ db, request, conversationId, userId, origin }));
		} catch (error) {
			return fail(error);
		}
	});

const shape = (invite, origin) => (invite ? { code: invite.code, url: inviteUrl(invite.code, origin), created_at: invite.created_at, uses: invite.uses } : null);

/** GET /api/chat/conversations/[id]/invite: the group's active link, or null. */
export const GET = asAdmin(async ({ db, conversationId, origin }) => ({ invite: shape(await activeInvite(db, conversationId), origin) }));

/** POST { reset? }: the active link, made if there is none; reset replaces it. */
export const POST = asAdmin(async ({ db, request, conversationId, userId, origin }) => {
	const body = await request.json().catch(() => ({}));
	return { invite: shape(await ensureInvite(db, conversationId, userId, { reset: body?.reset === true }), origin) };
});

/** DELETE: turn the link off. */
export const DELETE = asAdmin(async ({ db, conversationId }) => {
	await revokeInvite(db, conversationId);
	return { success: true };
});
