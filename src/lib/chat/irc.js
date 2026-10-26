/**
 * IRC-style `/names` and `/list`, answered on this device and never sent.
 *
 *   /names  who is in the open chat (admins first, marked @; agents 🤖)
 *   /list   the chats you are in, with how many people each has
 *
 * Both read the conversation list the client already loaded
 * (/api/conversations/load), so they cost no request and reveal nothing the
 * user could not already see in the sidebar.
 */

export const IRC_COMMANDS = ['names', 'list'];

const nameOf = (p) => {
	const u = p.user || p;
	return u.username || u.display_name || 'unknown';
};

/** Lines for `/names` in one conversation. */
export function namesLines(conversation, title = conversation?.name || 'this chat') {
	const people = [...(conversation?.participants || [])].sort(
		(a, b) => (b.role === 'admin') - (a.role === 'admin') || nameOf(a).localeCompare(nameOf(b))
	);
	const names = people.map((p) => {
		const u = p.user || p;
		const op = p.role === 'admin' ? '@' : p.role === 'moderator' ? '+' : '';
		const agent = u.account_type === 'agent' ? ' 🤖' : '';
		return `${op}${nameOf(p)}${agent}`;
	});
	const n = names.length;
	return [`${title}: ${n} ${n === 1 ? 'person' : 'people'}`, names.join('  ') || '(nobody)'];
}

/**
 * Lines for `/list`: your chats, groups first. `titleOf` names a chat (the
 * other person for a direct chat); archived chats are counted, not listed.
 */
export function listLines(conversations, titleOf = (c) => c.name || 'Chat') {
	const live = (conversations || []).filter((c) => !c.is_archived);
	const rank = { group: 0, direct: 1, note_to_self: 2 };
	const sorted = [...live].sort((a, b) => (rank[a.type] ?? 1) - (rank[b.type] ?? 1) || titleOf(a).localeCompare(titleOf(b)));
	const lines = sorted.map((c) => {
		const n = c.participants?.length ?? 0;
		const kind = c.type === 'group' ? 'group' : c.type === 'note_to_self' ? 'note' : 'direct';
		return `${c.type === 'group' ? '#' : ' '}${titleOf(c)}  ${n} ${n === 1 ? 'person' : 'people'} · ${kind}`;
	});
	const archived = (conversations || []).length - live.length;
	return [`${live.length} ${live.length === 1 ? 'chat' : 'chats'}${archived ? ` (+${archived} archived)` : ''}`, ...lines];
}
