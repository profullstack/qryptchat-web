/**
 * Public profile fields (OpenProfile 0.4 defaults: Emoji, Pronouns, Web) and
 * the OpenProfile.md a public profile is also served as.
 *
 * The public profile is exactly PUBLIC_PROFILE_COLUMNS: never phone_number,
 * salt or anything else on `users`.
 */
import { makeOpenProfile, renderOpenProfile } from '@profullstack/openprofile';

export const PUBLIC_PROFILE_COLUMNS = 'id, username, display_name, avatar_url, bio, website, emoji, pronouns, unique_identifier';

const SITE = 'https://qrypt.chat';
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

/** The public profile as OpenProfile.md (logicsrc.com/openprofile). */
export function toOpenProfile(user) {
	const page = `${SITE}/u/${encodeURIComponent(user.username)}`;
	return renderOpenProfile(
		makeOpenProfile({
			name: user.display_name || user.username,
			identity: {
				Kind: 'person',
				Handle: `@${user.username}`,
				Emoji: user.emoji,
				Pronouns: user.pronouns,
				Web: user.website,
				Avatar: user.avatar_url,
			},
			headline: user.bio?.split('\n')[0],
			sections: [{ title: 'Accounts', name: 'accounts', body: `- [qrypt.chat](${page})` }],
		}),
	);
}
