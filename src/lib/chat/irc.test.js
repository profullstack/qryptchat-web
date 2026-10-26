import { describe, expect, it } from 'vitest';
import { IRC_COMMANDS, listLines, namesLines } from './irc.js';
import { parseSlashCommand } from './voice.js';

const agents = {
	id: 'g1',
	type: 'group',
	name: 'Agents',
	participants: [
		{ user_id: 'b', role: 'member', user: { username: 'riotcoder', account_type: 'agent' } },
		{ user_id: 'c', role: 'member', user: { username: 'cha0spunk', account_type: 'agent' } },
		{ user_id: 'a', role: 'admin', user: { username: 'chovy', account_type: 'user' } },
	],
};

describe('IRC commands', () => {
	it('parses /names and /list but not other slash text', () => {
		expect(parseSlashCommand('/names', IRC_COMMANDS)).toEqual({ name: 'names', args: '' });
		expect(parseSlashCommand(' /list ', IRC_COMMANDS)).toEqual({ name: 'list', args: '' });
		expect(parseSlashCommand('/namesake', IRC_COMMANDS)).toBeNull();
		expect(parseSlashCommand('/usr/bin is a path', IRC_COMMANDS)).toBeNull();
	});

	it('/names puts admins first with @ and marks agents', () => {
		expect(namesLines(agents)).toEqual(['Agents: 3 people', '@chovy  cha0spunk 🤖  riotcoder 🤖']);
	});

	it('/names counts one person', () => {
		expect(namesLines({ participants: [{ role: 'member', user: { username: 'me' } }] }, 'Note to self')[0]).toBe('Note to self: 1 person');
	});

	it('/list shows groups first and counts archived chats', () => {
		const dm = { id: 'd', type: 'direct', participants: [{}, {}] };
		const old = { id: 'o', type: 'group', name: 'Old', is_archived: true, participants: [] };
		const titleOf = (c) => c.name || 'Anthony';
		expect(listLines([dm, agents, old], titleOf)).toEqual([
			'2 chats (+1 archived)',
			'#Agents  3 people · group',
			' Anthony  2 people · direct',
		]);
	});
});
