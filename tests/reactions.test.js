import { describe, it, expect } from 'vitest';
import { foldMessages, parseReaction, reactionEnvelope, snippet, myReaction } from '../src/lib/chat/reactions.js';

const alice = { display_name: 'Alice' };
const bob = { display_name: 'Bob' };
let t = 0;
const at = () => new Date(Date.UTC(2026, 9, 6, 12, 0, t++)).toISOString();
const msg = (id, sender_id, content, extra = {}) => ({ id, sender_id, sender: sender_id === 'a' ? alice : bob, content, message_type: 'text', created_at: at(), ...extra });
const react = (id, sender_id, target, emoji, remove = false) =>
	msg(id, sender_id, reactionEnvelope(target, emoji, remove), { message_type: 'reaction' });

describe('reaction envelopes', () => {
	it('round-trip and reject anything else', () => {
		expect(parseReaction(reactionEnvelope('m1', '❤️'))).toEqual({ target: 'm1', emoji: '❤️', remove: false });
		expect(parseReaction('hello')).toBeNull();
		expect(parseReaction(JSON.stringify({ type: 'reaction', target: 'm1' }))).toBeNull();
		expect(parseReaction(JSON.stringify({ type: 'reaction', target: 'm1', emoji: 'x'.repeat(40) }))).toBeNull();
	});
});

describe('folding a conversation', () => {
	it('hides reaction messages and counts them on their target', () => {
		const out = foldMessages(
			[msg('m1', 'a', 'shipped it'), react('r1', 'b', 'm1', '❤️'), react('r2', 'a', 'm1', '❤️'), msg('m2', 'b', 'nice')],
			'a',
		);
		expect(out.map((m) => m.id)).toEqual(['m1', 'm2']);
		expect(out[0].reactions).toEqual([{ emoji: '❤️', count: 2, mine: true, names: ['Bob', 'You'], first: expect.any(String) }]);
		expect(myReaction(out[0])).toBe('❤️');
		expect(out[1].reactions).toEqual([]);
	});

	it('keeps one reaction per person: a new emoji replaces, remove withdraws', () => {
		const out = foldMessages(
			[msg('m1', 'a', 'hi'), react('r1', 'b', 'm1', '👍'), react('r2', 'b', 'm1', '😂'), react('r3', 'a', 'm1', '😂'), react('r4', 'a', 'm1', '😂', true)],
			'a',
		);
		expect(out[0].reactions.map((r) => [r.emoji, r.count, r.mine])).toEqual([['😂', 1, false]]);
		expect(myReaction(out[0])).toBeNull();
	});

	it('ignores a remove for an emoji that was not the current one, and junk envelopes', () => {
		const out = foldMessages(
			[msg('m1', 'a', 'hi'), react('r1', 'b', 'm1', '👍'), react('r2', 'b', 'm1', '😮', true), msg('r3', 'b', 'not json', { message_type: 'reaction' })],
			'a',
		);
		expect(out.map((m) => m.id)).toEqual(['m1']);
		expect(out[0].reactions.map((r) => r.emoji)).toEqual(['👍']);
	});

	it('attaches a quote to replies, from the reader’s own copy', () => {
		const out = foldMessages([msg('m1', 'b', 'are we\n shipping   today?'), msg('m2', 'a', 'yes', { reply_to_id: 'm1' }), msg('m3', 'a', 'and', { reply_to_id: 'gone' })], 'a');
		expect(out[1].replyTo).toEqual({ id: 'm1', name: 'Bob', snippet: 'are we shipping today?', missing: false });
		expect(out[2].replyTo).toMatchObject({ id: 'gone', missing: true });
	});

	it('previews attachments and long text', () => {
		expect(snippet({ message_type: 'file', content: '[File attachment]' })).toBe('📎 Attachment');
		expect(snippet({ content: 'x'.repeat(200) }, 10)).toBe('xxxxxxxxx…');
	});
});
