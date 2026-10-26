/**
 * @mentions, completed like x.com and IRC: type `@` and optionally the start
 * of a name, then Tab. Tab again cycles through the other matches (Shift+Tab
 * goes back). Shared by the web composer (PWA and desktop), the qc TUI, and
 * `qc send` / the MCP send_message tool, which expand an `@partial` that
 * matches exactly one person.
 *
 *   @         everyone in the chat but you
 *   @ali      alice, alina, ...  (username first, then display name)
 *
 * Candidates come from the chat's participants
 * (/api/chat/conversations/[id]/participants), so completion costs no request
 * and offers nobody the user could not already see in /names.
 */

/** Characters a name can hold after the @ (usernames and Moshpit names like chovy.hacker). */
const NAME_CHAR = /[\p{L}\p{N}_.-]/u;
/** What may sit just before the @: start, space, or opening punctuation (never a@b.com). */
const BEFORE_AT = /[\s([{"'“‘]/u;

/** The people you can mention in a chat: everyone with a username but you, A-Z. */
export function mentionCandidates(participants, selfId) {
	const seen = new Set();
	const out = [];
	for (const p of participants || []) {
		const u = p.user || p;
		const id = p.user_id ?? u.id;
		if (!u.username || (selfId && id === selfId) || seen.has(u.username.toLowerCase())) continue;
		seen.add(u.username.toLowerCase());
		out.push({ id, username: u.username, name: u.display_name || '', agent: u.account_type === 'agent' });
	}
	return out.sort((a, b) => a.username.localeCompare(b.username, undefined, { sensitivity: 'base' }));
}

/**
 * The @mention being typed at the cursor: `start` is the @, `end` the end of
 * the name (past the cursor when it sits mid-word), `query` what is typed
 * between the @ and the cursor. Null when the cursor is not in one.
 */
export function mentionAt(value, cursor = value.length) {
	let i = cursor;
	while (i > 0 && NAME_CHAR.test(value[i - 1])) i--;
	if (value[i - 1] !== '@') return null;
	const start = i - 1;
	if (start > 0 && !BEFORE_AT.test(value[start - 1])) return null;
	let end = cursor;
	while (end < value.length && NAME_CHAR.test(value[end])) end++;
	return { start, end, query: value.slice(i, cursor) };
}

/**
 * Candidates for a partial name, best first: username prefix, display-name
 * word prefix, then anywhere in the username (unless `anywhere` is false).
 */
export function matchMentions(candidates, query = '', { anywhere = true } = {}) {
	const q = query.toLowerCase();
	if (!q) return [...candidates];
	const rank = (c) => {
		const u = c.username.toLowerCase();
		if (u === q) return 0;
		if (u.startsWith(q)) return 1;
		if (c.name && c.name.toLowerCase().split(/\s+/).some((w) => w.startsWith(q))) return 2;
		if (anywhere && u.includes(q)) return 3;
		return -1;
	};
	return candidates
		.map((c) => ({ c, r: rank(c) }))
		.filter((x) => x.r >= 0)
		.sort((a, b) => a.r - b.r)
		.map((x) => x.c);
}

/** Put `@username ` in place of the mention at [start, end); one space after, never two. */
export function insertMention(value, { start, end }, username) {
	const after = value.slice(end);
	const space = after.startsWith(' ') ? '' : ' ';
	const next = `${value.slice(0, start)}@${username}${space}${after}`;
	return { value: next, cursor: start + username.length + 2 };
}

/**
 * Tab in a composer. Returns { value, cursor, cycle } or null (no mention at
 * the cursor, or nobody matches: let Tab do its usual job).
 *
 * Pass the previous result's `cycle` back: when the field still holds what the
 * last Tab put there, the next Tab moves to the next match (dir -1 for
 * Shift+Tab), the way IRC clients cycle nicks.
 */
export function completeMention(value, cursor, candidates, cycle = null, dir = 1) {
	if (cycle && cycle.value === value && cycle.cursor === cursor && cycle.matches.length) {
		const n = cycle.matches.length;
		const index = (cycle.index + dir + n) % n;
		const at = { start: cycle.start, end: cycle.start + cycle.matches[cycle.index].username.length + 1 };
		const done = insertMention(value, at, cycle.matches[index].username);
		return { ...done, cycle: { ...cycle, index, value: done.value, cursor: done.cursor } };
	}
	const at = mentionAt(value, cursor);
	if (!at) return null;
	const matches = matchMentions(candidates, at.query);
	if (!matches.length) return null;
	const index = dir < 0 ? matches.length - 1 : 0;
	const done = insertMention(value, at, matches[index].username);
	return { ...done, cycle: { start: at.start, query: at.query, matches, index, value: done.value, cursor: done.cursor } };
}

/**
 * For text sent without a composer (qc send, MCP send_message): each
 * `@partial` that matches exactly one person becomes `@username`. Ambiguous
 * and unknown ones are left as typed and reported, so nothing is guessed.
 */
export function expandMentions(text, candidates) {
	const mentions = [];
	const ambiguous = [];
	const unknown = [];
	const out = String(text).replace(/(^|[\s([{"'“‘])@([\p{L}\p{N}_.-]+)/gu, (whole, before, raw) => {
		// "@ali." at the end of a sentence: the dot is punctuation, not the name.
		const query = raw.replace(/[.-]+$/, '');
		const tail = raw.slice(query.length);
		if (!query) return whole;
		const exact = candidates.find((c) => c.username.toLowerCase() === query.toLowerCase());
		// Prefixes only: a stray substring match is too loose to rewrite someone's text.
		const pick = exact ? [exact] : matchMentions(candidates, query, { anywhere: false });
		if (pick.length === 1) {
			if (!mentions.includes(pick[0].username)) mentions.push(pick[0].username);
			return `${before}@${pick[0].username}${tail}`;
		}
		if (pick.length > 1) ambiguous.push({ query, matches: pick.map((c) => c.username) });
		else unknown.push(query);
		return whole;
	});
	return { text: out, mentions, ambiguous, unknown };
}

/** One line of suggestions for a terminal: `@ali → alice  alina  (Tab)`. */
export function mentionHint(matches, query, index = -1, max = 6) {
	if (!matches.length) return `@${query}: nobody here by that name`;
	const shown = matches.slice(0, max).map((c, i) => (i === index ? `[${c.username}]` : c.username));
	const more = matches.length > max ? `  +${matches.length - max}` : '';
	return `@${query} → ${shown.join('  ')}${more}  (Tab)`;
}
