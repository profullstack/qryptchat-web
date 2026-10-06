import { describe, expect, it, vi } from 'vitest';
import { emoji, kindOf, parseOpenProfile, section } from '@profullstack/openprofile';
import { AgentError, cleanAgentName, hashInviteToken, inviteMessage, inviteUrl, newInviteToken, redeemInvite, tokenFrom } from './agents.js';
import { toOpenProfile } from '../profile/fields.js';
import { parseInvite, usernameFor } from '../../cli/agent.js';

const KEY = Buffer.alloc(1568, 7).toString('base64');

/** A tiny in-memory stand-in for the service-role client. */
function fakeDb({ invite, usernameTaken = false, keyInsertFails = false } = {}) {
	const state = { invite: invite ? { ...invite } : null, users: [], keys: [], deletedAuth: [], conversations: [], participants: [], deleted: [] };
	const db = {
		state,
		auth: {
			admin: {
				createUser: vi.fn(async () => ({ data: { user: { id: 'auth-agent' } }, error: null })),
				deleteUser: vi.fn(async (id) => state.deletedAuth.push(id))
			}
		},
		rpc: vi.fn(async () => ({ data: null, error: { message: 'create_direct_conversation must not be used' } })),
		from(table) {
			let op = 'select';
			let patch = null;
			const filters = [];
			const q = {
				select: () => q,
				eq: (k, v) => (filters.push(['eq', k, v]), q),
				is: (k, v) => (filters.push(['is', k, v]), q),
				ilike: (k, v) => (filters.push(['ilike', k, v]), q),
				update: (p) => ((op = 'update'), (patch = p), q),
				insert: (row) => ((op = 'insert'), (patch = row), q),
				upsert: (rows) => ((op = 'upsert'), (patch = rows), q),
				delete: () => ((op = 'delete'), q),
				maybeSingle: async () => run('one'),
				single: async () => run('one'),
				then: (res, rej) => run('many').then(res, rej)
			};
			async function run(shape) {
				if (op === 'delete') {
					state.deleted.push([table, ...filters.map(([, k, v]) => `${k}=${v}`)]);
					return { data: null, error: null };
				}
				if (table === 'conversations') {
					if (op === 'insert') {
						state.conversations.push(patch);
						return { data: { id: 'conv-1' }, error: null };
					}
					return { data: [], error: null };
				}
				if (table === 'conversation_participants') {
					state.participants.push(...[].concat(patch ?? []));
					return { data: null, error: null };
				}
				if (table === 'agent_invites') {
					const inv = state.invite;
					const match = inv && filters.every(([t, k, v]) => (t === 'is' ? inv[k] === v || (v === null && inv[k] == null) : k === 'token_hash' ? inv.token_hash === v : inv[k] === v));
					if (op === 'update') {
						if (!match) return { data: [], error: null };
						Object.assign(inv, patch);
						return { data: [{ id: inv.id }], error: null };
					}
					return { data: match ? inv : null, error: null };
				}
				if (table === 'users') {
					if (op === 'insert') {
						const row = { id: 'user-agent', ...patch };
						state.users.push(row);
						return { data: row, error: null };
					}
					const ilike = filters.find(([t]) => t === 'ilike');
					if (ilike) return { data: usernameTaken ? { id: 'someone' } : null, error: null };
					return { data: { id: 'inviter', username: 'chovy', display_name: 'Anthony' }, error: null };
				}
				if (table === 'user_public_keys') {
					if (keyInsertFails) return { data: null, error: { message: 'nope' } };
					state.keys.push(patch);
					return { data: null, error: null };
				}
				return { data: shape === 'one' ? null : [], error: null };
			}
			return q;
		}
	};
	return db;
}

function openInviteFor(token, extra = {}) {
	return {
		id: 'inv-1',
		token_hash: hashInviteToken(token),
		inviter_user_id: 'inviter',
		agent_name: 'Athena',
		expires_at: new Date(Date.now() + 86400000).toISOString(),
		revoked_at: null,
		redeemed_at: null,
		...extra
	};
}

describe('agent invites', () => {
	it('tokens are 256-bit, ride in the fragment, and parse back from a link', () => {
		const token = newInviteToken();
		expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect(inviteUrl(token)).toBe(`https://qrypt.chat/agents/join#${token}`);
		expect(tokenFrom(inviteUrl(token))).toBe(token);
		expect(tokenFrom(token)).toBe(token);
		expect(tokenFrom('nope')).toBeNull();
		expect(parseInvite(inviteUrl(token))).toEqual({ base: 'https://qrypt.chat', token });
		expect(() => parseInvite('https://qrypt.chat/agents/join')).toThrow(/not an agent invite/);
	});

	it('names are cleaned, usernames derived', () => {
		expect(cleanAgentName('  Athena  ')).toBe('Athena');
		expect(cleanAgentName('')).toBeNull();
		expect(() => cleanAgentName('<b>x</b>')).toThrow(AgentError);
		expect(usernameFor('Athena Bot')).toMatch(/^athena_bot_[0-9a-f]{6}$/);
		expect(usernameFor('')).toMatch(/^agent_[0-9a-f]{6}$/);
	});

	it('the message carries the one command the agent needs', () => {
		const m = inviteMessage({ inviterName: 'Anthony', agentName: 'Athena', url: 'https://qrypt.chat/agents/join#t' });
		expect(m.subject).toContain('Athena');
		expect(m.text).toContain('npx -y @profullstack/qryptchat agent join "https://qrypt.chat/agents/join#t"');
		expect(m.sms.length).toBeLessThan(320);
	});
});

describe('redeemInvite', () => {
	it('creates the agent account with its own public key and opens a chat with the operator', async () => {
		const token = newInviteToken();
		const db = fakeDb({ invite: openInviteFor(token) });
		const out = await redeemInvite(db, token, { username: 'athena_bot', displayName: 'Athena', publicKey: KEY });
		expect(out.conversationId).toBe('conv-1');
		expect(db.state.users[0]).toMatchObject({ account_type: 'agent', operator_user_id: 'inviter', username: 'athena_bot', display_name: 'Athena' });
		expect(db.state.keys[0]).toEqual({ user_id: 'auth-agent', public_key: KEY, key_type: 'ML-KEM-1024' });
		expect(db.rpc).not.toHaveBeenCalled();
		expect(db.state.conversations[0]).toEqual({ type: 'direct', created_by: 'inviter' });
		expect(db.state.participants.map((p) => p.user_id)).toEqual(['inviter', 'user-agent']);
		expect(db.state.invite.redeemed_at).toBeTruthy();
		expect(db.state.invite.redeemed_by).toBe('user-agent');
	});

	it('refuses used, revoked or expired invites, bad keys and taken usernames', async () => {
		const token = newInviteToken();
		await expect(redeemInvite(fakeDb({ invite: openInviteFor(token, { redeemed_at: 'x' }) }), token, { username: 'athena_bot', publicKey: KEY })).rejects.toMatchObject({ code: 'invite_invalid' });
		await expect(redeemInvite(fakeDb({ invite: openInviteFor(token, { revoked_at: 'x' }) }), token, { username: 'athena_bot', publicKey: KEY })).rejects.toMatchObject({ code: 'invite_invalid' });
		await expect(redeemInvite(fakeDb({ invite: openInviteFor(token, { expires_at: new Date(0).toISOString() }) }), token, { username: 'athena_bot', publicKey: KEY })).rejects.toMatchObject({ code: 'invite_invalid' });
		await expect(redeemInvite(fakeDb({ invite: openInviteFor(token) }), token, { username: 'athena_bot', publicKey: 'AAAA' })).rejects.toMatchObject({ code: 'invalid_key' });
		await expect(redeemInvite(fakeDb({ invite: openInviteFor(token) }), token, { username: 'x', publicKey: KEY })).rejects.toMatchObject({ code: 'invalid_username' });
		await expect(redeemInvite(fakeDb({ invite: openInviteFor(token), usernameTaken: true }), token, { username: 'athena_bot', publicKey: KEY })).rejects.toMatchObject({ code: 'username_taken' });
	});

	it('undoes everything when a step fails, so the invite can be used again', async () => {
		const token = newInviteToken();
		const db = fakeDb({ invite: openInviteFor(token), keyInsertFails: true });
		await expect(redeemInvite(db, token, { username: 'athena_bot', publicKey: KEY })).rejects.toBeInstanceOf(AgentError);
		expect(db.state.deletedAuth).toEqual(['auth-agent']);
		// The users row goes too: deleting the auth user does not cascade to public.users.
		expect(db.state.deleted).toContainEqual(['users', 'id=user-agent']);
		expect(db.state.invite.redeemed_at).toBeNull();
	});
});

describe('an agent profile', () => {
	it('is Kind agent with an Operator section pointing at the person', () => {
		const md = toOpenProfile({ username: 'athena_bot', display_name: 'Athena', emoji: '🦉', account_type: 'agent' }, { username: 'chovy', display_name: 'Anthony' });
		const doc = parseOpenProfile(md);
		expect(kindOf(doc)).toBe('agent');
		expect(emoji(doc)).toBe('🦉');
		expect(section(doc, 'operator')?.body).toContain('https://qrypt.chat/u/chovy/openprofile.md');
		expect(kindOf(parseOpenProfile(toOpenProfile({ username: 'ada', display_name: 'Ada' })))).toBe('person');
	});
});
