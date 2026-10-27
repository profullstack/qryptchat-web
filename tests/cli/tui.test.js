import { describe, it, expect } from 'vitest';
import { renderToScreen } from '@profullstack/hqtui/testing';
import { setIconMode } from '@profullstack/hqtui';
import { CHAT_LIST_REFRESH_MS, chatsWithNews, initialState, listed, mentionSuggestions, NEW_CHAT_COMMANDS, parseNewChat, render, SLASH_COMMANDS, tabComplete, transcriptLines } from '../../src/cli/tui.js';

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

	it('draws emoji and the brand lock as HD images when the terminal can show them', () => {
		const s = state();
		// Every emoji and icon is "loaded" as image 7.
		s.images = { enabled: true, mode: 'kitty', emoji: () => 7, icon: () => 7, clear: () => {}, attach: () => {} };
		const screen = draw(s);
		const rocket = screen.find('shipped it');
		const cells = screen.buffer.chars;
		const at = (x, y) => cells[y * screen.width + x];
		// "shipped it " is 11 columns; the rocket's two cells follow as image placeholders.
		expect(screen.text()).not.toContain('shipped it 🚀');
		expect(at(rocket.x + 11, rocket.y)).not.toBe(at(rocket.x + 10, rocket.y));
		expect(screen.text()).not.toContain('🔒');
		expect(screen.text()).toContain('qrypt.chat');
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
		expect(draw(s).text()).toContain('No chats yet. Type /msg @name');
	});
});

describe('archived chats in the qc client', () => {
	const withArchive = () => {
		const s = state();
		s.conversations.push({ id: 'c3', title: 'old project', participants: [], is_archived: true });
		return s;
	};

	it('hides archived chats and counts them in the list title', () => {
		const text = draw(withArchive()).text();
		expect(text).not.toContain('old project');
		expect(text).toContain('1 archived');
		expect(listed(withArchive()).map((c) => c.id)).toEqual(['c1', 'c2']);
	});

	it('shows only archived chats in the archived view', () => {
		const s = withArchive();
		s.showArchived = true;
		const text = draw(s).text();
		expect(text).toContain('Archived (1)');
		expect(text).toContain('old project');
		expect(text).not.toContain('team chat');
	});

	it('handles /voice, /archive, /unarchive and /archived in the composer', () => {
		expect(SLASH_COMMANDS).toEqual(expect.arrayContaining(['voice', 'archive', 'unarchive', 'archived']));
	});
});

describe('the periodic chat list refresh', () => {
	it('finds chats that are new or have newer activity', () => {
		const prev = [
			{ id: 'a', updated_at: '2026-10-12T10:00:00Z' },
			{ id: 'b', updated_at: '2026-10-12T10:00:00Z' },
		];
		const next = [
			{ id: 'a', updated_at: '2026-10-12T10:05:00Z' },
			{ id: 'b', updated_at: '2026-10-12T10:00:00Z' },
			{ id: 'c', updated_at: '2026-10-12T10:01:00Z' },
		];
		expect(chatsWithNews(prev, next)).toEqual(['a', 'c']);
		expect(chatsWithNews(next, next)).toEqual([]);
		expect(CHAT_LIST_REFRESH_MS).toBeLessThanOrEqual(30_000);
	});
});

describe('@mention completion in the composer', () => {
	function group() {
		const s = state();
		s.conversations[0].participants = [
			{ user_id: 'me', user: { username: 'anthony' } },
			{ user_id: 'a', user: { username: 'alice' } },
			{ user_id: 'b', user: { username: 'alina' } },
			{ user_id: 'r', user: { username: 'riotcoder', account_type: 'agent' } },
		];
		return s;
	}
	const type = (s, value) => (s.field = { value, cursor: value.length });

	it('Tab completes @partial, Tab again cycles, Shift+Tab goes back', () => {
		const s = group();
		type(s, 'hey @al');
		expect(tabComplete(s)).toBe(true);
		expect(s.field).toEqual({ value: 'hey @alice ', cursor: 11 });
		tabComplete(s);
		expect(s.field.value).toBe('hey @alina ');
		tabComplete(s, -1);
		expect(s.field.value).toBe('hey @alice ');
	});

	it('a bare @ offers everyone but you; Tab outside an @name is left for pane switching', () => {
		const s = group();
		type(s, '@');
		expect(mentionSuggestions(s).matches.map((c) => c.username)).toEqual(['alice', 'alina', 'riotcoder']);
		type(s, 'hello');
		expect(tabComplete(s)).toBe(false);
		expect(mentionSuggestions(s)).toBeNull();
	});

	it('lists the matches above the composer while typing @…', () => {
		const s = group();
		type(s, '@al');
		const text = draw(s).text();
		expect(text).toContain('@al → alice  alina  (Tab)');
		expect(text).not.toContain('alice is typing…');
		expect(text).toMatch(/TAB\s+complete @/i);
	});
});

describe('messaging someone new from the qc client', () => {
	it('/msg, /dm, /query and /new start a direct chat, with an optional first message', () => {
		expect(SLASH_COMMANDS).toEqual(expect.arrayContaining(NEW_CHAT_COMMANDS));
		expect(NEW_CHAT_COMMANDS).toEqual(expect.arrayContaining(['msg', 'dm', 'query', 'new']));
		expect(parseNewChat('@alice hi there\nsecond line')).toEqual({ who: '@alice', text: 'hi there\nsecond line' });
		expect(parseNewChat('  bob  ')).toEqual({ who: 'bob', text: '' });
		expect(parseNewChat('')).toBeNull();
	});

	it('tells someone with no chats how to start one', () => {
		const s = initialState({ id: 'me', username: 'anthony' });
		s.loading = false;
		const text = draw(s).text();
		expect(text).toContain('No chats yet. Type /msg @name to message someone.');
		expect(text).toContain('/msg @name to start a chat');
	});

	it('offers n for a new chat in the chat list', () => {
		const s = state();
		s.focus = 'list';
		expect(draw(s).text()).toContain('new chat');
	});
});
