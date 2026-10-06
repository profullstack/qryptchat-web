import { describe, it, expect, vi } from 'vitest';
import { ephemeralKeypair, keyring, openKeyBlob } from '../../src/cli/crypto.js';
import { QcClient, readSse, conversationTitle } from '../../src/cli/api.js';
import { parseArgs, findChat } from '../../src/cli/commands.js';
import { handle } from '../../src/cli/mcp.js';
import { matchCode } from '../../src/lib/auth/cli-match.js';

const json = (body, status = 200) =>
	new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function account() {
	return { keys1024: await ephemeralKeypair() };
}

describe('the login key handoff', () => {
	it('opens keys the browser sealed to the one-time key, and nothing else does', async () => {
		const me = await account();
		const ephemeral = await ephemeralKeypair();
		// What /cli/authorize does in the browser: seal the export to the CLI's key.
		const blob = await keyring(me).encrypt(JSON.stringify({ v: 1, ...me }), ephemeral.publicKey);
		expect(blob).not.toContain(me.keys1024.privateKey);

		const opened = await openKeyBlob(blob, ephemeral);
		expect(opened.keys1024).toEqual(me.keys1024);

		await expect(openKeyBlob(blob, await ephemeralKeypair())).rejects.toThrow(/Could not open/);
	}, 20000);

	it('derives the same confirmation code on both sides', async () => {
		const a = await matchCode('challenge-x', 'kem-y');
		expect(a).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
		expect(await matchCode('challenge-x', 'kem-y')).toBe(a);
		expect(await matchCode('challenge-x', 'kem-z')).not.toBe(a);
	});
});

describe('QcClient', () => {
	it('encrypts a message once per participant, each copy only its owner can read', async () => {
		const alice = await account();
		const bob = await account();
		let sent;
		const fetch = vi.fn(async (url, init) => {
			const path = new URL(url).pathname;
			if (path.endsWith('/participants')) return json({ participants: [{ user_id: 'a' }, { user_id: 'b' }, { user_id: 'c' }] });
			if (path === '/api/crypto/public-keys') return json({ public_keys: { a: alice.keys1024.publicKey, b: bob.keys1024.publicKey, c: null } });
			if (path === '/api/messages/send') {
				sent = JSON.parse(init.body);
				expect(init.headers.Authorization).toBe('Bearer tok');
				return json({ success: true, message: { id: 'm1' } });
			}
			return json({ error: 'nope' }, 404);
		});
		const client = new QcClient(
			{ base: 'https://chat.test', access_token: 'tok', refresh_token: 'r', expires_at: Date.now() / 1000 + 3600, user: { id: 'a' }, keys: alice },
			{ fetch, save: () => {} },
		);
		const { message, skipped } = await client.send('conv', 'ship it 🚀');
		expect(message.id).toBe('m1');
		expect(skipped).toBe(1);
		expect(Object.keys(sent.encryptedContents).sort()).toEqual(['a', 'b']);
		expect(JSON.stringify(sent)).not.toContain('ship it');
		expect(await keyring(bob).decrypt(sent.encryptedContents.b)).toBe('ship it 🚀');
		expect(await keyring(alice).decrypt(sent.encryptedContents.a)).toBe('ship it 🚀');
	}, 20000);

	it('decrypts loaded messages and marks its own', async () => {
		const alice = await account();
		const content = await keyring(alice).encrypt('hello', alice.keys1024.publicKey);
		const fetch = vi.fn(async () =>
			json({ messages: [{ id: 'm', conversation_id: 'c', sender_id: 'a', sender: { username: 'alice' }, encrypted_content: content, created_at: '2026-10-06T10:00:00Z' }] }),
		);
		const client = new QcClient({ access_token: 't', keys: alice, user: { id: 'a' } }, { fetch, save: () => {} });
		const { messages } = await client.messages('c');
		expect(messages[0]).toMatchObject({ text: 'hello', mine: true, sender: 'alice' });
	}, 20000);

	it('folds encrypted reactions into their target and quotes replies', async () => {
		const me = await account();
		const enc = (t) => keyring(me).encrypt(t, me.keys1024.publicKey);
		const { reactionEnvelope } = await import('../../src/lib/chat/reactions.js');
		const rows = [
			{ id: 'm1', conversation_id: 'c', sender_id: 'b', sender: { display_name: 'Bob' }, message_type: 'text', encrypted_content: await enc('ship it?'), created_at: '2026-10-06T10:00:00Z' },
			{ id: 'r1', conversation_id: 'c', sender_id: 'a', sender: { username: 'me' }, message_type: 'reaction', encrypted_content: await enc(reactionEnvelope('m1', '🚀')), created_at: '2026-10-06T10:00:05Z' },
			{ id: 'm2', conversation_id: 'c', sender_id: 'a', sender: { username: 'me' }, message_type: 'text', reply_to_id: 'm1', encrypted_content: await enc('yes'), created_at: '2026-10-06T10:00:10Z' },
		];
		const client = new QcClient({ access_token: 't', keys: me, user: { id: 'a' } }, { fetch: async () => json({ messages: rows }), save: () => {} });
		const { messages } = await client.messages('c');
		expect(messages.map((m) => m.id)).toEqual(['m1', 'm2']);
		expect(messages[0].reactions).toEqual([{ emoji: '🚀', count: 1, mine: true, names: ['You'] }]);
		expect(messages[1].replyTo).toMatchObject({ id: 'm1', name: 'Bob', snippet: 'ship it?' });
	}, 20000);

	it('refreshes once on a 401, saves the rotated session, and retries', async () => {
		const saved = [];
		let calls = 0;
		const fetch = vi.fn(async (url, init) => {
			const path = new URL(url).pathname;
			if (path === '/api/cli/token') {
				expect(JSON.parse(init.body)).toEqual({ grant_type: 'refresh_token', refresh_token: 'old-r' });
				return json({ access_token: 'new', refresh_token: 'new-r', expires_at: Date.now() / 1000 + 3600 });
			}
			calls++;
			return init.headers.Authorization === 'Bearer new' ? json({ conversations: [] }) : json({ error: 'expired' }, 401);
		});
		const client = new QcClient({ access_token: 'old', refresh_token: 'old-r', keys: await account(), user: { id: 'a' } }, { fetch, save: (s) => saved.push(s) });
		expect(await client.conversations()).toEqual([]);
		expect(calls).toBe(2);
		expect(saved.at(-1)).toMatchObject({ access_token: 'new', refresh_token: 'new-r' });
	}, 20000);
});

describe('the SSE reader', () => {
	it('parses frames split across chunks', async () => {
		const enc = new TextEncoder();
		const frame = `event: NEW_MESSAGE\ndata: ${JSON.stringify({ type: 'NEW_MESSAGE', data: { message: { id: 'x' } } })}\n\n`;
		async function* body() {
			yield enc.encode(frame.slice(0, 20));
			yield enc.encode(frame.slice(20) + 'event: ping\ndata: {"type":"ping","data":{}}\n\n');
		}
		const events = [];
		await readSse(body(), (e) => events.push(e));
		expect(events).toEqual([
			{ type: 'NEW_MESSAGE', data: { message: { id: 'x' } } },
			{ type: 'ping', data: {} },
		]);
	});
});

describe('arguments and chats', () => {
	it('parses flags', () => {
		expect(parseArgs(['read', 'team', '-n', '5', '--json'])).toEqual({ _: ['read', 'team'], flags: { n: '5', json: true } });
		expect(parseArgs(['--url', 'http://x', 'chats'])).toEqual({ _: ['chats'], flags: { url: 'http://x' } });
		expect(parseArgs(['send', 'a', '--', '--not-a-flag'])._).toEqual(['send', 'a', '--not-a-flag']);
	});

	it('finds a chat by id, name or a unique fragment', () => {
		const chats = [{ id: '1', title: 'Alice' }, { id: '2', title: 'Team chat' }, { id: '3', title: 'Team ops' }];
		expect(findChat(chats, '1').title).toBe('Alice');
		expect(findChat(chats, 'alice').id).toBe('1');
		expect(findChat(chats, 'ops').id).toBe('3');
		expect(() => findChat(chats, 'team')).toThrow(/matches 2 chats/);
		expect(() => findChat(chats, 'zzz')).toThrow(/No chat matches/);
	});

	it('names a direct chat after the other people in it', () => {
		const c = { participants: [{ user_id: 'me', user: { username: 'me' } }, { user_id: 'b', user: { display_name: 'Bob' } }] };
		expect(conversationTitle(c, { id: 'me' })).toBe('Bob');
		expect(conversationTitle({ name: 'Ops', participants: [] }, { id: 'me' })).toBe('Ops');
	});
});

describe('qc mcp', () => {
	const fake = {
		conversations: async () => [{ id: 'c1', title: 'Alice', participants: [1, 2] }],
		messages: async () => ({ messages: [{ id: 'm1', sender: 'alice', mine: false, text: 'hi', at: 't', reactions: [{ emoji: '❤️', count: 1, mine: true }] }] }),
		send: async () => ({ message: { id: 'm' }, skipped: 0 }),
	};

	it('lists tools and answers initialize', async () => {
		const init = await handle(fake, { id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } }, { version: '1' });
		expect(init.serverInfo.name).toBe('qc');
		const { tools } = await handle(fake, { id: 2, method: 'tools/list' }, { version: '1' });
		expect(tools.map((t) => t.name)).toEqual(['list_chats', 'read_chat', 'send_message', 'react_to_message']);
	});

	it('calls tools and reports errors as tool errors', async () => {
		const read = await handle(fake, { id: 3, method: 'tools/call', params: { name: 'read_chat', arguments: { chat: 'alice' } } }, { version: '1' });
		expect(read.structuredContent.messages).toEqual([{ id: 'm1', from: 'alice', text: 'hi', at: 't', reactions: [{ emoji: '❤️', count: 1, mine: true }] }]);
		const bad = await handle(fake, { id: 4, method: 'tools/call', params: { name: 'send_message', arguments: { chat: 'nobody', text: 'x' } } }, { version: '1' });
		expect(bad.isError).toBe(true);
		await expect(handle(fake, { id: 5, method: 'nope' }, { version: '1' })).rejects.toThrow(/Method not found/);
		expect(await handle(fake, { method: 'notifications/initialized' }, { version: '1' })).toBeUndefined();
	});
});

describe('qc login on a remote box', () => {
	it('treats SSH without a display as remote (no loopback redirect)', async () => {
		const { isRemote } = await import('../../src/cli/login.js');
		expect(isRemote({ platform: 'linux', env: { SSH_CONNECTION: '1 2 3 4' } })).toBe(true);
		expect(isRemote({ platform: 'linux', env: { SSH_CONNECTION: '1 2 3 4', DISPLAY: ':0' } })).toBe(false);
		expect(isRemote({ platform: 'linux', env: {} })).toBe(true); // tmux/mosh drop SSH_*
		expect(isRemote({ platform: 'linux', env: { WAYLAND_DISPLAY: 'wayland-0' } })).toBe(false);
		expect(isRemote({ platform: 'win32', env: {} })).toBe(false);
		expect(isRemote({ platform: 'darwin', env: { SSH_TTY: '/dev/pts/1' } })).toBe(false);
		expect(isRemote({ platform: 'linux', env: { QC_NO_BROWSER: '1' } })).toBe(true);
	});

	it('takes a pasted callback URL or a bare code, and refuses another login’s URL', async () => {
		const { parsePasted } = await import('../../src/cli/login.js');
		const code = '35_r7KgyhCrrz2JNWUpYJFFN8sCOSjQhuQm0NZe8Oi4';
		expect(parsePasted(`http://127.0.0.1:35839/callback?code=${code}&state=abc`, 'abc')).toBe(code);
		expect(parsePasted(`  ${code}  `, 'abc')).toBe(code);
		expect(() => parsePasted(`http://127.0.0.1:1/callback?code=${code}&state=zzz`, 'abc')).toThrow(/different login/);
		expect(parsePasted('nope', 'abc')).toBeNull();
		expect(parsePasted('', 'abc')).toBeNull();
	});
});
