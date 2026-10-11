import { describe, expect, it } from 'vitest';
import {
	GroupInviteError,
	addMembers,
	ensureInvite,
	inviteUrl,
	newInviteCode,
	parseInviteCode,
	previewInvite,
	redeemInvite,
	requireGroupAdmin,
	revokeInvite
} from './group-invites.js';
import { PENDING_JOIN_KEY, redeemPendingJoin, takePendingJoin } from './pending-join.js';

/** An in-memory stand-in for the service-role client: tables of rows, eq/is/in filters. */
function fakeDb(tables) {
	const t = Object.fromEntries(Object.entries(tables).map(([k, rows]) => [k, rows.map((r) => ({ ...r }))]));
	let seq = 0;
	return {
		t,
		from(table) {
			t[table] ??= [];
			let op = 'select';
			let patch;
			const filters = [];
			const match = (row) =>
				filters.every(([kind, k, v]) => (kind === 'in' ? v.includes(row[k]) : kind === 'is' ? (row[k] ?? null) === v : row[k] === v));
			const run = (shape) => {
				if (op === 'insert') {
					if (table === 'conversation_invites' && t[table].some((r) => r.conversation_id === patch.conversation_id && !r.revoked_at)) {
						return { data: null, error: { message: 'duplicate key' } };
					}
					const row = { id: `id-${++seq}`, created_at: 'now', uses: 0, revoked_at: null, left_at: null, ...patch };
					t[table].push(row);
					return { data: shape === 'one' ? row : [row], error: null };
				}
				const rows = t[table].filter(match);
				if (op === 'update') rows.forEach((r) => Object.assign(r, patch));
				return { data: shape === 'one' ? rows[0] ?? null : rows, error: null };
			};
			const q = {
				select: () => q,
				eq: (k, v) => (filters.push(['eq', k, v]), q),
				is: (k, v) => (filters.push(['is', k, v]), q),
				in: (k, v) => (filters.push(['in', k, v]), q),
				insert: (row) => ((op = 'insert'), (patch = row), q),
				update: (p) => ((op = 'update'), (patch = p), q),
				maybeSingle: async () => run('one'),
				single: async () => run('one'),
				then: (res, rej) => Promise.resolve(run('many')).then(res, rej)
			};
			return q;
		}
	};
}

const world = () =>
	fakeDb({
		users: [{ id: 'ann' }, { id: 'bob' }, { id: 'cat' }, { id: 'dan' }],
		conversations: [
			{ id: 'g1', type: 'group', name: 'Friends' },
			{ id: 'd1', type: 'direct', name: null }
		],
		conversation_participants: [
			{ conversation_id: 'g1', user_id: 'ann', role: 'admin', left_at: null },
			{ conversation_id: 'g1', user_id: 'bob', role: 'member', left_at: null },
			{ conversation_id: 'g1', user_id: 'dan', role: 'member', left_at: '2026-01-01' },
			{ conversation_id: 'd1', user_id: 'ann', role: 'admin', left_at: null }
		]
	});

const rejects = async (promise, code) => {
	const error = await promise.then(() => null, (e) => e);
	expect(error).toBeInstanceOf(GroupInviteError);
	expect(error.code).toBe(code);
};

describe('invite codes', () => {
	it('are 128 random url-safe bits', () => {
		const a = newInviteCode();
		expect(a).toMatch(/^[A-Za-z0-9_-]{22}$/);
		expect(newInviteCode()).not.toBe(a);
	});

	it('come from a link or bare, and nothing else', () => {
		const code = newInviteCode();
		expect(parseInviteCode(inviteUrl(code))).toBe(code);
		expect(parseInviteCode(`  http://localhost:3000/join/${code}/ `)).toBe(code);
		expect(parseInviteCode(code)).toBe(code);
		expect(parseInviteCode('https://qrypt.chat/agents/join#abc')).toBeNull();
		expect(parseInviteCode('short')).toBeNull();
		expect(parseInviteCode('not a code at all!!!!!!')).toBeNull();
		expect(parseInviteCode(undefined)).toBeNull();
	});
});

describe('who may invite', () => {
	it('is a group admin only', async () => {
		const db = world();
		await expect(requireGroupAdmin(db, 'g1', 'ann')).resolves.toMatchObject({ id: 'g1' });
		await rejects(requireGroupAdmin(db, 'g1', 'bob'), 'not_admin');
		await rejects(requireGroupAdmin(db, 'g1', 'cat'), 'forbidden');
		await rejects(requireGroupAdmin(db, 'g1', 'dan'), 'forbidden'); // left the group
		await rejects(requireGroupAdmin(db, 'd1', 'ann'), 'not_group');
		await rejects(requireGroupAdmin(db, 'nope', 'ann'), 'not_found');
	});
});

describe('the link', () => {
	it('is one per group: made once, reused, reset, revoked', async () => {
		const db = world();
		const first = await ensureInvite(db, 'g1', 'ann');
		expect((await ensureInvite(db, 'g1', 'ann')).code).toBe(first.code);
		const reset = await ensureInvite(db, 'g1', 'ann', { reset: true });
		expect(reset.code).not.toBe(first.code);
		await rejects(redeemInvite(db, first.code, 'cat'), 'invalid');
		await revokeInvite(db, 'g1');
		await rejects(redeemInvite(db, reset.code, 'cat'), 'invalid');
		expect(db.t.conversation_invites.filter((r) => !r.revoked_at)).toHaveLength(0);
	});

	it('previews the group and whether you are in it', async () => {
		const db = world();
		const { code } = await ensureInvite(db, 'g1', 'ann');
		await expect(previewInvite(db, code, 'cat')).resolves.toEqual({ conversation_id: 'g1', name: 'Friends', members: 2, already_member: false });
		await expect(previewInvite(db, code, 'bob')).resolves.toMatchObject({ already_member: true });
		await rejects(previewInvite(db, 'x'.repeat(22), 'cat'), 'invalid');
	});

	it('joins a newcomer once, brings back someone who left, and counts uses', async () => {
		const db = world();
		const { code } = await ensureInvite(db, 'g1', 'ann');
		await expect(redeemInvite(db, code, 'cat')).resolves.toEqual({ conversation_id: 'g1', joined: true });
		await expect(redeemInvite(db, code, 'cat')).resolves.toEqual({ conversation_id: 'g1', joined: false });
		await expect(redeemInvite(db, code, 'dan')).resolves.toEqual({ conversation_id: 'g1', joined: true });
		const dan = db.t.conversation_participants.find((r) => r.conversation_id === 'g1' && r.user_id === 'dan');
		expect(dan).toMatchObject({ left_at: null, role: 'member' });
		expect(db.t.conversation_invites[0].uses).toBe(2);
	});
});

describe('addMembers', () => {
	it('adds real users, skips current members, never demotes an admin', async () => {
		const db = world();
		const added = await addMembers(db, 'g1', ['cat', 'bob', 'ann', 'ghost', 'cat', '', 7]);
		expect(added).toEqual(['cat']);
		const ann = db.t.conversation_participants.find((r) => r.conversation_id === 'g1' && r.user_id === 'ann');
		expect(ann.role).toBe('admin');
		expect(db.t.conversation_participants.filter((r) => r.user_id === 'ghost')).toHaveLength(0);
	});
});

describe('a link opened while signed out', () => {
	const store = (initial) => {
		const m = new Map(Object.entries(initial));
		return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k), m };
	};

	it('is taken once', () => {
		const s = store({ [PENDING_JOIN_KEY]: 'abc' });
		expect(takePendingJoin(s)).toBe('abc');
		expect(takePendingJoin(s)).toBeNull();
	});

	it('is redeemed after sign-in', async () => {
		const s = store({ [PENDING_JOIN_KEY]: 'abc' });
		let sent;
		const fetchImpl = async (url, init) => ((sent = [url, JSON.parse(init.body)]), { ok: true, json: async () => ({ conversation_id: 'g1' }) });
		await expect(redeemPendingJoin({ storage: s, fetchImpl })).resolves.toBe('g1');
		expect(sent).toEqual(['/api/conversations/join', { code: 'abc' }]);
		await expect(redeemPendingJoin({ storage: s, fetchImpl })).resolves.toBeNull();
	});
});
