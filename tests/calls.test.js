import { describe, it, expect } from 'vitest';
import { callEnvelope, parseCall, newCallKey, isJoinable, callSummary, CALL_JOINABLE_MS } from '../src/lib/chat/calls.js';

describe('qc and call invites', () => {
	it('never prints the media key', async () => {
		const { QcClient } = await import('../src/cli/api.js');
		const { ephemeralKeypair, keyring } = await import('../src/cli/crypto.js');
		const me = { keys1024: await ephemeralKeypair() };
		const content = callEnvelope({ room: 'c', key: newCallKey(), video: true });
		const encrypted = await keyring(me).encrypt(content, me.keys1024.publicKey);
		const rows = [{ id: 'm', conversation_id: 'c', sender_id: 'b', sender: { display_name: 'Bob' }, message_type: 'call', encrypted_content: encrypted, created_at: new Date().toISOString() }];
		const client = new QcClient(
			{ access_token: 't', keys: me, user: { id: 'a' } },
			{ fetch: async () => new Response(JSON.stringify({ messages: rows }), { status: 200 }), save: () => {} },
		);
		const { messages } = await client.messages('c');
		expect(messages[0].text).toBe('📞 Bob started a video call · join on qrypt.chat');
		expect(messages[0].text).not.toContain(JSON.parse(content).key);
	}, 20000);
});

describe('call invites', () => {
	it('carry the room and a 32-byte media key inside the encrypted body', () => {
		const key = newCallKey();
		expect(key).toHaveLength(32);
		const body = callEnvelope({ room: 'conv-1', key, video: true, at: '2026-10-06T10:00:00.000Z' });
		const call = parseCall(body);
		expect(call).toMatchObject({ room: 'conv-1', video: true, at: '2026-10-06T10:00:00.000Z' });
		expect(Array.from(call.key)).toEqual(Array.from(key));
	});

	it('reject anything that is not a well-formed invite', () => {
		expect(parseCall('hello')).toBeNull();
		expect(parseCall(JSON.stringify({ type: 'call', room: 'r', key: btoa('short') }))).toBeNull();
		expect(parseCall(JSON.stringify({ type: 'reaction', room: 'r', key: 'x' }))).toBeNull();
	});

	it('stop being joinable after a while', () => {
		const call = parseCall(callEnvelope({ room: 'r', key: newCallKey(), at: '2026-10-06T10:00:00.000Z' }));
		const start = Date.parse('2026-10-06T10:00:00.000Z');
		expect(isJoinable(call, null, start + 60_000)).toBe(true);
		expect(isJoinable(call, null, start + CALL_JOINABLE_MS + 1)).toBe(false);
		expect(isJoinable(null, null)).toBe(false);
	});

	it('summarise without the key', () => {
		const content = callEnvelope({ room: 'r', key: newCallKey(), video: false });
		const text = callSummary({ content, sender_id: 'b', sender: { display_name: 'Bob' } }, 'me');
		expect(text).toBe('📞 Bob started a voice call');
		expect(callSummary({ content, sender_id: 'me' }, 'me')).toBe('📞 You started a voice call');
	});
});
