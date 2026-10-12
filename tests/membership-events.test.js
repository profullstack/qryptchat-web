import { describe, it, expect, vi } from 'vitest';
import { SSEManager } from '../src/lib/api/sse-manager.js';
import { announceArchived, announceJoined, announceLeft, CHAT_LIST_EVENTS, MEMBERSHIP_EVENTS } from '../src/lib/chat/membership-events.js';

/** An SSE manager with two devices for alice, one for bob, and carol offline. */
function setup() {
	const sse = new SSEManager();
	const wire = () => ({ lines: [], write(d) { this.lines.push(d); }, close() {} });
	const alicePhone = wire();
	const aliceLaptop = wire();
	const bob = wire();
	sse.addConnection(alicePhone, 'alice');
	sse.addConnection(aliceLaptop, 'alice');
	sse.addConnection(bob, 'bob');
	sse.joinRoom('alice', 'g1');
	sse.joinRoom('bob', 'g1');
	const events = (w) => w.lines.map((l) => /^event: (\S+)/m.exec(l)?.[1]).filter(Boolean);
	return { sse, alicePhone, aliceLaptop, bob, events };
}

describe('membership events reach every device', () => {
	it('a join reaches everyone in the chat, on all their devices', () => {
		const { sse, alicePhone, aliceLaptop, bob, events } = setup();
		const carol = { lines: [], write(d) { this.lines.push(d); }, close() {} };
		sse.addConnection(carol, 'carol');
		announceJoined(sse, 'g1', ['carol']);
		for (const w of [alicePhone, aliceLaptop, bob, carol]) expect(events(w)).toContain(MEMBERSHIP_EVENTS.JOINED);
	});

	it('a leave reaches the rest of the chat and every device of the one who left', () => {
		const { sse, alicePhone, aliceLaptop, bob, events } = setup();
		announceLeft(sse, 'g1', 'alice');
		for (const w of [alicePhone, aliceLaptop, bob]) expect(events(w)).toEqual([MEMBERSHIP_EVENTS.LEFT]);
		// alice is out of the room, so later chat events no longer reach her.
		sse.broadcastToRoom('g1', 'NEW_MESSAGE', {});
		expect(events(alicePhone)).toEqual([MEMBERSHIP_EVENTS.LEFT]);
	});

	it('archiving reaches only that user, on all their devices', () => {
		const { sse, alicePhone, aliceLaptop, bob, events } = setup();
		announceArchived(sse, 'alice', 'g1', true);
		expect(events(alicePhone)).toEqual([MEMBERSHIP_EVENTS.ARCHIVED]);
		expect(events(aliceLaptop)).toEqual([MEMBERSHIP_EVENTS.ARCHIVED]);
		expect(events(bob)).toEqual([]);
		expect(alicePhone.lines[0]).toContain('"archived":true');
	});

	it('never throw into the request they follow', () => {
		const broken = { joinRoom: vi.fn(() => { throw new Error('boom'); }), broadcastToRoom: vi.fn(), sendToUser: vi.fn(), leaveRoom: vi.fn() };
		const err = vi.spyOn(console, 'error').mockImplementation(() => {});
		expect(() => announceJoined(broken, 'g1', ['x'])).not.toThrow();
		err.mockRestore();
	});

	it('all tell clients to reload the chat list', () => {
		for (const t of [...Object.values(MEMBERSHIP_EVENTS), 'CONVERSATION_CREATED']) expect(CHAT_LIST_EVENTS.has(t)).toBe(true);
	});
});
