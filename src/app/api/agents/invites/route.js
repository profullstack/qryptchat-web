import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api/middleware/auth.js';
import { getServiceRoleClient } from '@/lib/supabase/service-role.js';
import { AgentError, cleanAgentName, createInvite, inviteMessage } from '@/lib/agents/agents.js';
import { createSMSWebhookEmailService } from '@/lib/services/sms-alert-email-service.js';
import { e164, sendViaTelnyx } from '@/lib/auth/sms-hook.js';

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

async function me(db, authUserId) {
	const { data } = await db.from('users').select('id, username, display_name, account_type').eq('auth_user_id', authUserId).single();
	return data;
}

const fail = (error) =>
	error instanceof AgentError
		? NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
		: (console.error('[agents/invites]', error), NextResponse.json({ error: 'Internal server error' }, { status: 500 }));

/**
 * POST /api/agents/invites  { name?, email?, phone? }
 * Invite an AI agent: returns the link, and sends it by email or SMS when one
 * is given. The token is shown once; only its hash is stored.
 */
export const POST = withAuth(async ({ request, locals }) => {
	try {
		const body = await request.json().catch(() => ({}));
		const db = getServiceRoleClient();
		const inviter = await me(db, locals.user.id);
		if (!inviter) return NextResponse.json({ error: 'User not found' }, { status: 404 });
		if (inviter.account_type === 'agent') return NextResponse.json({ error: 'Agents cannot invite agents' }, { status: 403 });

		const name = cleanAgentName(body?.name);
		const email = typeof body?.email === 'string' ? body.email.trim() : '';
		const phone = typeof body?.phone === 'string' ? body.phone.trim() : '';
		if (email && !EMAIL_RE.test(email)) return NextResponse.json({ error: 'That email address does not look right' }, { status: 400 });
		const to = phone ? e164(phone) : null;
		if (phone && !to) return NextResponse.json({ error: 'That phone number does not look right' }, { status: 400 });

		const channel = email ? 'email' : to ? 'sms' : 'link';
		const invite = await createInvite(db, inviter.id, { name, channel, destination: email || to || null });
		const message = inviteMessage({ inviterName: inviter.display_name || `@${inviter.username}`, agentName: name, url: invite.url });

		let sent = false;
		let warning;
		if (channel === 'email') {
			const mailer = createSMSWebhookEmailService();
			const result = mailer ? await mailer.sendEmail({ to: email, subject: message.subject, text: message.text }) : { success: false };
			sent = !!result?.success;
			if (!sent) warning = 'The invite was created but the email could not be sent. Share the link instead.';
		} else if (channel === 'sms') {
			try {
				await sendViaTelnyx({ to, text: message.sms });
				sent = true;
			} catch (error) {
				console.error('[agents/invites] sms', error?.message);
				warning = 'The invite was created but the text could not be sent. Share the link instead.';
			}
		}

		return NextResponse.json({ invite: { id: invite.id, url: invite.url, expiresAt: invite.expiresAt, channel }, sent, ...(warning ? { warning } : {}) });
	} catch (error) {
		return fail(error);
	}
});

/** GET /api/agents/invites: my invites (no tokens) and the agents I operate. */
export const GET = withAuth(async ({ locals }) => {
	try {
		const db = getServiceRoleClient();
		const inviter = await me(db, locals.user.id);
		if (!inviter) return NextResponse.json({ error: 'User not found' }, { status: 404 });
		const [{ data: invites }, { data: agents }] = await Promise.all([
			db
				.from('agent_invites')
				.select('id, agent_name, channel, destination, created_at, expires_at, revoked_at, redeemed_at, redeemed_by')
				.eq('inviter_user_id', inviter.id)
				.order('created_at', { ascending: false })
				.limit(50),
			db.from('users').select('id, username, display_name, emoji, created_at').eq('operator_user_id', inviter.id).eq('account_type', 'agent').order('created_at', { ascending: false }),
		]);
		return NextResponse.json({ invites: invites ?? [], agents: agents ?? [] });
	} catch (error) {
		return fail(error);
	}
});

/** DELETE /api/agents/invites?id=<invite id>: revoke an unused invite. */
export const DELETE = withAuth(async ({ request, locals }) => {
	try {
		const id = new URL(request.url).searchParams.get('id');
		if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
		const db = getServiceRoleClient();
		const inviter = await me(db, locals.user.id);
		if (!inviter) return NextResponse.json({ error: 'User not found' }, { status: 404 });
		const { data } = await db
			.from('agent_invites')
			.update({ revoked_at: new Date().toISOString() })
			.eq('id', id)
			.eq('inviter_user_id', inviter.id)
			.is('redeemed_at', null)
			.select('id');
		if (!data?.length) return NextResponse.json({ error: 'No open invite with that id' }, { status: 404 });
		return NextResponse.json({ success: true });
	} catch (error) {
		return fail(error);
	}
});
