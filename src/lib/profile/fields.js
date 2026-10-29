/**
 * Public profile fields (OpenProfile 0.4 defaults: Emoji, Pronouns, Web) and
 * the OpenProfile.md a public profile is also served as.
 *
 * The public profile is exactly PUBLIC_PROFILE_COLUMNS: never phone_number,
 * salt or anything else on `users`. An agent account also has an OpenAgent
 * descriptor (logicsrc.com/openagent) naming its owner, and the owner's
 * profile lists the agents, so ownership reads both ways.
 */
import { makeOpenProfile, renderOpenProfile } from '@profullstack/openprofile';

export const PUBLIC_PROFILE_COLUMNS = 'id, username, display_name, avatar_url, bio, website, emoji, pronouns, unique_identifier, account_type, operator_user_id';

const SITE = 'https://qrypt.chat';
const profileUrl = (username) => `${SITE}/u/${encodeURIComponent(username)}`;

/**
 * A public profile with the accounts on the other side of agent ownership:
 * `operator` (owner of an agent) and `agents` (agents a person owns).
 * @param {import('@supabase/supabase-js').SupabaseClient} service service-role client
 */
export async function loadPublicProfile(service, username) {
	const { data: user, error } = await service.from('users').select(PUBLIC_PROFILE_COLUMNS).eq('username', username).single();
	if (error || !user) return null;
	let operator = null;
	let agents = [];
	if (user.account_type === 'agent' && user.operator_user_id) {
		const { data } = await service.from('users').select('username, display_name').eq('id', user.operator_user_id).maybeSingle();
		operator = data ?? null;
	} else if (user.account_type !== 'agent') {
		const { data } = await service.from('users').select('username, display_name').eq('operator_user_id', user.id).eq('account_type', 'agent').order('username');
		agents = data ?? [];
	}
	return { user, operator, agents };
}

/** `<username>.qrypt.chat`: the LogicSRC identity (name.namespace) of a qrypt.chat account. */
export const qryptDid = (username) => `${String(username).toLowerCase()}.qrypt.chat`;
const graphemes = (text) => [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)];

/**
 * An emoji for the profile: exactly one emoji grapheme, or empty to clear.
 * @returns {{ value: string | null } | { error: string }}
 */
export function cleanEmoji(input) {
	if (input === null || input === undefined) return { value: null };
	if (typeof input !== 'string') return { error: 'Emoji must be text' };
	const text = input.trim();
	if (!text) return { value: null };
	const parts = graphemes(text);
	if (parts.length !== 1 || !/\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(text) || text.length > 32) {
		return { error: 'Pick a single emoji' };
	}
	return { value: parts[0].segment };
}

/**
 * The display name shown in chats, on /u/<username> and in OpenProfile.md.
 * Control and bidi-override characters are stripped and whitespace collapsed.
 * `users.display_name` is NOT NULL, so empty means "keep the current name".
 * @returns {{ value: string | null } | { error: string }}
 */
export function cleanDisplayName(input) {
	if (input === null || input === undefined) return { value: null };
	if (typeof input !== 'string') return { error: 'Display name must be text' };
	const text = input.replace(/[\p{Cc}\u200B\u200E\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/gu, ' ').trim().replace(/\s+/g, ' ');
	if (!text) return { value: null };
	if ([...text].length > 50) return { error: 'Display name can be at most 50 characters' };
	if (/[<>]/.test(text)) return { error: 'Display name contains characters that are not allowed' };
	return { value: text };
}

/**
 * Pronouns as the person writes them (she/her, they/them, any), or empty to clear.
 * @returns {{ value: string | null } | { error: string }}
 */
export function cleanPronouns(input) {
	if (input === null || input === undefined) return { value: null };
	if (typeof input !== 'string') return { error: 'Pronouns must be text' };
	const text = input.trim().replace(/\s+/g, ' ');
	if (!text) return { value: null };
	if (text.length > 40) return { error: 'Pronouns can be at most 40 characters' };
	if (/[<>\p{Cc}]/u.test(text)) return { error: 'Pronouns contain characters that are not allowed' };
	return { value: text };
}

/**
 * A website: http(s) only (a bare domain gets https://), or empty to clear.
 * @returns {{ value: string | null } | { error: string }}
 */
export function cleanWebsite(input) {
	if (input === null || input === undefined) return { value: null };
	if (typeof input !== 'string') return { error: 'Website must be text' };
	const text = input.trim();
	if (!text) return { value: null };
	let url;
	try {
		url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`);
	} catch {
		return { error: 'Please enter a valid website URL' };
	}
	if (url.protocol !== 'https:' && url.protocol !== 'http:') return { error: 'Website must be an http(s) link' };
	if (!url.hostname.includes('.')) return { error: 'Please enter a valid website URL' };
	return { value: url.toString() };
}

/**
 * The public profile as OpenProfile.md (logicsrc.com/openprofile). An agent is
 * `Kind: agent` with an Operator section naming the person answerable for it.
 */
export function toOpenProfile(user, operator = null, agents = []) {
	const page = profileUrl(user.username);
	const agent = user.account_type === 'agent';
	const operatorSection = agent && operator
		? {
				title: 'Operator',
				name: 'operator',
				body: [
					`- **Name**: ${operator.display_name || operator.username}`,
					`- **Role**: owner and operator, who answers for this agent`,
					`- **Profile**: ${profileUrl(operator.username)}/openprofile.md`
				].join('\n')
			}
		: null;
	const agentsSection = !agent && agents.length
		? {
				title: 'Agents',
				name: 'agents',
				body: agents
					.map((a) => `- [${a.display_name || a.username}](${profileUrl(a.username)}) @${a.username}, owned and operated by me: ${profileUrl(a.username)}/openagent.json`)
					.join('\n')
			}
		: null;
	return renderOpenProfile(
		makeOpenProfile({
			name: user.display_name || user.username,
			identity: {
				Kind: agent ? 'agent' : 'person',
				Handle: `@${user.username}`,
				Emoji: user.emoji,
				Pronouns: user.pronouns,
				Web: user.website,
				Avatar: user.avatar_url,
				OpenAgent: agent ? `${page}/openagent.json` : undefined,
			},
			headline: user.bio?.split('\n')[0],
			sections: [{ title: 'Accounts', name: 'accounts', body: `- [qrypt.chat](${page})` }, operatorSection, agentsSection],
		}),
	);
}

/**
 * An agent account as OpenAgent (logicsrc.com/openagent): the logicsrc.agent
 * 0.1 record, owner by did. Only fields the schema allows (it rejects extras);
 * the owner's name and page are in OpenProfile.md and on /u/<username>.
 */
export function toOpenAgent(user, operator) {
	return {
		type: 'logicsrc.agent',
		version: '0.1',
		name: user.display_name || user.username,
		did: qryptDid(user.username),
		owner_did: qryptDid(operator.username),
		description: user.bio?.split('\n')[0] || `@${user.username}, an AI agent on qrypt.chat operated by @${operator.username}.`,
		skills: ['chat', 'end-to-end-encrypted-messaging'],
		supported_task_types: ['direct-message', 'group-chat'],
		permissions_requested: ['chat:read', 'chat:write'],
		polling_mode: false,
		public: true
	};
}
