/**
 * qc's line-oriented output, dressed the way hqtui apps are: OpenIcon glyphs
 * from hqtui's icon() (nerd-font art, Unicode or ASCII fallbacks chosen for the
 * terminal) and emoji through OpenEmoji (`qc fonts install` makes the terminal
 * draw them as our artwork).
 */
import { emojify, icon } from '@profullstack/hqtui';

/** An icon followed by a space, or nothing when the set has no such icon. */
export const mark = (name) => {
	const glyph = icon(name);
	return glyph ? `${glyph} ` : '';
};

/** `:shortcode:` -> the OpenEmoji character; plain text passes through. */
export const em = (text) => emojify(String(text ?? ''), { mode: 'emoji' });

export const ok = (text) => `${mark('check-circle')}${em(text)}`;
export const info = (text) => `${mark('info')}${em(text)}`;
export const warn = (text) => `${mark('warning')}${em(text)}`;
export const fail = (text) => `${mark('error')}${em(text)}`;

/** A person or agent: their emoji (or a user/robot icon), name and handle. */
export function who(user, { agent = false } = {}) {
	if (!user) return '';
	const face = user.emoji ? `${user.emoji} ` : agent || user.account_type === 'agent' ? '🤖 ' : mark('user');
	const name = user.display_name || user.displayName || user.username || '';
	const handle = user.username && name !== user.username ? ` @${user.username}` : '';
	const pronouns = user.pronouns ? ` (${user.pronouns})` : '';
	return `${face}${name}${handle}${pronouns}`;
}
