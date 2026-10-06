import { describe, it, expect } from 'vitest';
import { renderToScreen } from '@profullstack/hqtui/testing';
import { setIconMode } from '@profullstack/hqtui';
import { initialState, render, transcriptLines } from '../../src/cli/tui.js';

setIconMode('unicode');

function state() {
	const s = initialState({ id: 'me', username: 'anthony' });
	s.loading = false;
	s.status = 'live';
	s.conversations = [
		{ id: 'c1', title: 'alice', participants: [{ user_id: 'me' }, { user_id: 'a' }] },
		{ id: 'c2', title: 'team chat', participants: [] },
	];
	s.activeId = 'c1';
	s.unread = { c2: 3 };
	s.messages.c1 = [
		{ id: '1', senderId: 'a', sender: 'alice', mine: false, text: 'shipped it 🚀', at: '2026-10-06T14:02:00' },
		{ id: '2', senderId: 'a', sender: 'alice', mine: false, text: 'second line in the same run', at: '2026-10-06T14:02:30' },
		{ id: '3', senderId: 'me', sender: 'anthony', mine: true, text: '🔥🔥', at: '2026-10-06T14:03:00' },
	];
	s.typing = { c1: { a: { name: 'alice', until: Date.now() + 5000 } } };
	return s;
}

const draw = (s, on = {}, size = { width: 100, height: 24 }) =>
	renderToScreen((args) => render(args, s, on), size);

describe('the qc client screen', () => {
	it('shows the brand, live status, chats with unread counts, transcript, typing and the composer', () => {
		const screen = draw(state());
		const text = screen.text();
		expect(text).toContain('qrypt.chat');
		expect(text).toContain('@anthony');
		expect(text).toContain('● live');
		expect(text).toMatch(/team chat\s+●3/);
		expect(text).toContain('2 people · ML-KEM-1024');
		expect(text).toContain('shipped it 🚀');
		expect(text).toContain('alice is typing…');
		expect(text).toContain('Message alice');
		expect(text).toContain('you');
		expect(text).toMatch(/ENTER\s+send/i);
	});

	it('groups a run of messages under one name line', () => {
		const lines = transcriptLines(state().messages.c1, 60, { border: 0, primary: 1, muted: 2, foreground: 3, accent: 4, info: 5, success: 6, warning: 7, secondary: 8 });
		const headers = lines.filter((l) => l.spans);
		expect(headers).toHaveLength(2); // alice once for two messages, then you
		expect(lines[0].text).toContain('─');
	});

	it('opens the emoji picker over the composer', () => {
		const s = state();
		s.picker = { query: '', tab: 0, index: 0, offset: 0 };
		const text = draw(s).text();
		expect(text).toContain('Search emoji');
		expect(text).toContain('😀');
	});

	it('a click on a chat opens it; the wheel scrolls the transcript', () => {
		const opened = [];
		const scrolled = [];
		const screen = draw(state(), { open: (i) => opened.push(i), select: () => {}, scroll: (d) => scrolled.push(d) });
		const team = screen.find('team chat');
		screen.click(team.x, team.y);
		expect(opened.at(-1) ?? null).toBe(1);
		const msg = screen.find('shipped it');
		screen.scroll(msg.x, msg.y, -1);
		expect(scrolled).toEqual([1]);
	});

	it('says what to do before anything is open', () => {
		const s = initialState({ username: 'x' });
		expect(draw(s).text()).toContain('Loading your chats');
		s.loading = false;
		expect(draw(s).text()).toContain('Pick a chat on the left');
	});
});
