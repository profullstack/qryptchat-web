import { describe, expect, it } from 'vitest';
import { completeMention, expandMentions, insertMention, matchMentions, mentionAt, mentionCandidates, mentionHint } from './mentions.js';

const participants = [
	{ user_id: 'me', user: { username: 'chovy', display_name: 'Anthony' } },
	{ user_id: 'b', user: { username: 'riotcoder', account_type: 'agent' } },
	{ user_id: 'c', user: { username: 'cha0spunk', account_type: 'agent' } },
	{ user_id: 'd', user: { username: 'alice', display_name: 'Alice Smith' } },
	{ user_id: 'e', user: { username: 'alina' } },
	{ user_id: 'f', user: { username: 'zed.pit', display_name: 'Bob Ross' } },
	{ user_id: 'g', user: { display_name: 'no username' } },
];
const people = mentionCandidates(participants, 'me');

describe('mentionCandidates', () => {
	it('drops you and anyone without a username, sorted A-Z', () => {
		expect(people.map((c) => c.username)).toEqual(['alice', 'alina', 'cha0spunk', 'riotcoder', 'zed.pit']);
		expect(people.find((c) => c.username === 'riotcoder').agent).toBe(true);
	});
});

describe('mentionAt', () => {
	it('finds a bare @ and a partial name at the cursor', () => {
		expect(mentionAt('hey @')).toEqual({ start: 4, end: 5, query: '' });
		expect(mentionAt('@ali')).toEqual({ start: 0, end: 4, query: 'ali' });
		expect(mentionAt('(@ri')).toEqual({ start: 1, end: 4, query: 'ri' });
	});
	it('covers the rest of the word when the cursor is mid-name', () => {
		expect(mentionAt('@alice hi', 3)).toEqual({ start: 0, end: 6, query: 'al' });
	});
	it('ignores email addresses and text without an @', () => {
		expect(mentionAt('me@ali')).toBeNull();
		expect(mentionAt('hello')).toBeNull();
		expect(mentionAt('@alice ')).toBeNull();
	});
});

describe('matchMentions', () => {
	it('ranks username prefix, then display-name word, then substring', () => {
		expect(matchMentions(people, 'al').map((c) => c.username)).toEqual(['alice', 'alina']);
		expect(matchMentions(people, 'bob').map((c) => c.username)).toEqual(['zed.pit']);
		expect(matchMentions(people, 'coder').map((c) => c.username)).toEqual(['riotcoder']);
		expect(matchMentions(people, 'coder', { anywhere: false })).toEqual([]);
		expect(matchMentions(people, '')).toHaveLength(5);
	});
});

describe('completeMention (Tab)', () => {
	it('completes @partial and adds one space', () => {
		const r = completeMention('hi @ri', 6, people);
		expect(r.value).toBe('hi @riotcoder ');
		expect(r.cursor).toBe(14);
	});
	it('Tab again cycles the matches, Shift+Tab goes back', () => {
		let r = completeMention('@al', 3, people);
		expect(r.value).toBe('@alice ');
		r = completeMention(r.value, r.cursor, people, r.cycle);
		expect(r.value).toBe('@alina ');
		r = completeMention(r.value, r.cursor, people, r.cycle);
		expect(r.value).toBe('@alice ');
		r = completeMention(r.value, r.cursor, people, r.cycle, -1);
		expect(r.value).toBe('@alina ');
	});
	it('a bare @ cycles everyone', () => {
		let r = completeMention('@', 1, people);
		const seen = [r.value];
		for (let i = 0; i < 4; i++) {
			r = completeMention(r.value, r.cursor, people, r.cycle);
			seen.push(r.value);
		}
		expect(seen).toEqual(['@alice ', '@alina ', '@cha0spunk ', '@riotcoder ', '@zed.pit ']);
	});
	it('keeps the text after the cursor and does not double the space', () => {
		const r = completeMention('@ch thanks', 3, people);
		expect(r.value).toBe('@cha0spunk thanks');
		expect(r.cursor).toBe(11);
	});
	it('starts fresh once the text changed after a Tab', () => {
		const r = completeMention('@al', 3, people);
		const again = completeMention('@alice @ri', 10, people, r.cycle);
		expect(again.value).toBe('@alice @riotcoder ');
	});
	it('returns null when nothing to complete, so Tab keeps its job', () => {
		expect(completeMention('hello', 5, people)).toBeNull();
		expect(completeMention('@xyz', 4, people)).toBeNull();
	});
});

describe('expandMentions (qc send, MCP)', () => {
	it('expands a unique partial and reports ambiguous and unknown ones', () => {
		const r = expandMentions('@ri and @al, ping @nobody. mail a@b.com', people);
		expect(r.text).toBe('@riotcoder and @al, ping @nobody. mail a@b.com');
		expect(r.mentions).toEqual(['riotcoder']);
		expect(r.ambiguous).toEqual([{ query: 'al', matches: ['alice', 'alina'] }]);
		expect(r.unknown).toEqual(['nobody']);
	});
	it('keeps sentence punctuation and fixes the case of exact names', () => {
		expect(expandMentions('thanks @ALICE.', people).text).toBe('thanks @alice.');
		expect(expandMentions('@zed.pit!', people).text).toBe('@zed.pit!');
	});
});

describe('insertMention and mentionHint', () => {
	it('insertMention replaces the range', () => {
		expect(insertMention('x @a y', { start: 2, end: 4 }, 'alice')).toEqual({ value: 'x @alice y', cursor: 9 });
	});
	it('mentionHint lists and marks the current pick', () => {
		expect(mentionHint(matchMentions(people, 'al'), 'al', 1)).toBe('@al → alice  [alina]  (Tab)');
		expect(mentionHint([], 'zz')).toBe('@zz: nobody here by that name');
	});
});
