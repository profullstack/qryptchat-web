/**
 * Group invite links and adding people to a group chat.
 *
 * A group has at most one active link, https://qrypt.chat/join/<code>. Anyone
 * signed in who opens it joins the group; a group admin can make, reset or
 * revoke it, and add people by username. Messages are encrypted to each
 * participant when sent, so someone who joins reads what is sent from then on,
 * not the history. All of this runs with the service-role client.
 */
import { randomBytes } from 'node:crypto';

export const SITE = 'https://qrypt.chat';
const CODE_RE = /^[A-Za-z0-9_-]{16,64}$/;

export class GroupInviteError extends Error {
	constructor(code, message, status) {
		super(message);
		this.code = code;
		this.status = status;
	}
}

/** 128 random bits, url-safe: 22 characters. */
export const newInviteCode = () => randomBytes(16).toString('base64url');

export const inviteUrl = (code, origin = SITE) => `${origin}/join/${code}`;

/** The code from a /join/<code> link or a bare code; null when it is neither. */
export function parseInviteCode(input) {
	const text = String(input ?? '').trim();
	let code = text;
	if (/^https?:\/\//i.test(text)) {
		try {
			code = new URL(text).pathname.match(/\/join\/([^/]+)\/?$/)?.[1] ?? '';
		} catch {
			return null;
		}
	}
	return CODE_RE.test(code) ? code : null;
}

/** The group and the caller's active membership in it. */
async function groupAndMember(db, conversationId, userId) {
	const { data: conversation } = await db.from('conversations').select('id, type, name').eq('id', conversationId).maybeSingle();
	if (!conversation) throw new GroupInviteError('not_found', 'Chat not found', 404);
	const { data: member } = await db
		.from('conversation_participants')
		.select('role, left_at')
		.eq('conversation_id', conversationId)
		.eq('user_id', userId)
		.maybeSingle();
	return { conversation, member: member && !member.left_at ? member : null };
}

/** Throws unless the caller is an admin of this group chat. */
export async function requireGroupAdmin(db, conversationId, userId) {
	const { conversation, member } = await groupAndMember(db, conversationId, userId);
	if (!member) throw new GroupInviteError('forbidden', 'You are not in this chat', 403);
	if (conversation.type !== 'group') throw new GroupInviteError('not_group', 'Only group chats can have people added', 400);
	if (member.role !== 'admin') throw new GroupInviteError('not_admin', 'Only a group admin can do that', 403);
	return conversation;
}

export async function activeInvite(db, conversationId) {
	const { data } = await db
		.from('conversation_invites')
		.select('id, code, created_at, uses')
		.eq('conversation_id', conversationId)
		.is('revoked_at', null)
		.maybeSingle();
	return data ?? null;
}

export async function revokeInvite(db, conversationId) {
	await db.from('conversation_invites').update({ revoked_at: new Date().toISOString() }).eq('conversation_id', conversationId).is('revoked_at', null);
}

/** The group's active link, made if there is none; `reset` replaces it so the old link stops working. */
export async function ensureInvite(db, conversationId, userId, { reset = false } = {}) {
	if (reset) await revokeInvite(db, conversationId);
	else {
		const existing = await activeInvite(db, conversationId);
		if (existing) return existing;
	}
	const { data, error } = await db
		.from('conversation_invites')
		.insert({ conversation_id: conversationId, code: newInviteCode(), created_by: userId })
		.select('id, code, created_at, uses')
		.single();
	if (error || !data) {
		// Two admins at once: the unique index lets one win, so use theirs.
		const raced = await activeInvite(db, conversationId);
		if (raced) return raced;
		throw new GroupInviteError('server_error', 'Could not create the invite link', 500);
	}
	return data;
}

async function inviteFor(db, code) {
	if (!CODE_RE.test(String(code ?? ''))) return null;
	const { data } = await db.from('conversation_invites').select('id, conversation_id, revoked_at, uses').eq('code', code).maybeSingle();
	return data && !data.revoked_at ? data : null;
}

/** What /join/<code> shows before joining: the group name and member count. */
export async function previewInvite(db, code, userId) {
	const invite = await inviteFor(db, code);
	if (!invite) throw new GroupInviteError('invalid', 'This invite link is not valid any more. Ask for a new one.', 404);
	const { conversation, member } = await groupAndMember(db, invite.conversation_id, userId);
	const { data: members } = await db.from('conversation_participants').select('user_id').eq('conversation_id', invite.conversation_id).is('left_at', null);
	return { conversation_id: conversation.id, name: conversation.name || 'Group chat', members: members?.length ?? 0, already_member: !!member };
}

/**
 * Put users into a group as members. Active members are left alone (an admin
 * stays an admin); people who left are brought back. Returns the ids added.
 */
export async function addMembers(db, conversationId, userIds) {
	const ids = [...new Set(userIds.filter((id) => typeof id === 'string' && id.trim()).map((id) => id.trim()))];
	if (!ids.length) return [];
	const { data: users } = await db.from('users').select('id').in('id', ids);
	const real = new Set((users ?? []).map((u) => u.id));
	const { data: rows } = await db.from('conversation_participants').select('user_id, left_at').eq('conversation_id', conversationId).in('user_id', ids);
	const existing = new Map((rows ?? []).map((r) => [r.user_id, r]));
	const now = new Date().toISOString();
	const added = [];
	for (const id of ids) {
		if (!real.has(id)) continue;
		const row = existing.get(id);
		if (row && !row.left_at) continue;
		const { error } = row
			? await db.from('conversation_participants').update({ left_at: null, role: 'member', joined_at: now }).eq('conversation_id', conversationId).eq('user_id', id)
			: await db.from('conversation_participants').insert({ conversation_id: conversationId, user_id: id, role: 'member' });
		if (error) throw new GroupInviteError('server_error', 'Could not add to the chat', 500);
		added.push(id);
	}
	return added;
}

/** Join the group behind an invite code. Returns { conversation_id, joined } (joined is false if already in). */
export async function redeemInvite(db, code, userId) {
	const invite = await inviteFor(db, code);
	if (!invite) throw new GroupInviteError('invalid', 'This invite link is not valid any more. Ask for a new one.', 404);
	const { conversation } = await groupAndMember(db, invite.conversation_id, userId);
	if (conversation.type !== 'group') throw new GroupInviteError('invalid', 'This invite link is not valid any more. Ask for a new one.', 404);
	const added = await addMembers(db, conversation.id, [userId]);
	if (added.length) await db.from('conversation_invites').update({ uses: (invite.uses ?? 0) + 1 }).eq('id', invite.id);
	return { conversation_id: conversation.id, joined: added.length > 0 };
}

/** The users row id for an authenticated Supabase auth user. */
export async function appUserId(db, authUserId) {
	const { data } = await db.from('users').select('id').eq('auth_user_id', authUserId).maybeSingle();
	if (!data) throw new GroupInviteError('no_user', 'User not found', 404);
	return data.id;
}
