/**
 * Replies and reactions, Signal-style, on top of end-to-end encrypted messages.
 *
 * A reaction is its own message (message_type 'reaction') whose ENCRYPTED body
 * is a small envelope: { v: 1, type: 'reaction', target, emoji, remove }.
 * The server learns that someone reacted, never to what or with which emoji.
 * One reaction per person per message: a new emoji replaces theirs, `remove`
 * withdraws it.
 *
 * A reply is an ordinary message with reply_to_id set; the quote is drawn from
 * the reader's own decrypted copy of the original, so no quoted text is ever
 * stored a second time.
 */

export const REACTION_TYPE = 'reaction';
export const QUICK_REACTIONS = ['❤️', '👍', '😂', '😮', '😢', '🙏'];
const MAX_EMOJI_LENGTH = 32;

/** The encrypted body of a reaction message. */
export function reactionEnvelope(targetId, emoji, remove = false) {
	return JSON.stringify({ v: 1, type: REACTION_TYPE, target: String(targetId), emoji: String(emoji), remove: !!remove });
}

/** A reaction envelope from decrypted content, or null if it is not a valid one. */
export function parseReaction(content) {
	try {
		const d = JSON.parse(content);
		if (d?.type !== REACTION_TYPE || typeof d.target !== 'string' || typeof d.emoji !== 'string') return null;
		if (!d.emoji || d.emoji.length > MAX_EMOJI_LENGTH) return null;
		return { target: d.target, emoji: d.emoji, remove: !!d.remove };
	} catch {
		return null;
	}
}

const senderName = (m) => m?.sender?.display_name || m?.sender?.username || 'Someone';

/** A one-line preview of a message for a reply quote. */
export function snippet(m, max = 90) {
	if (!m) return '';
	if (m.message_type === 'file' || m.has_attachments) return '📎 Attachment';
	const text = String(m.content ?? '').replace(/\s+/g, ' ').trim();
	return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * Fold a conversation's decrypted messages (oldest first) for display:
 * reactions disappear into their targets as [{ emoji, count, mine, names }],
 * and replies gain { replyTo: { id, name, snippet, missing } }.
 */
export function foldMessages(messages, myUserId) {
	const visible = [];
	const byId = new Map();
	const picks = new Map(); // targetId -> Map(senderId -> { emoji, name, at })

	for (const m of messages) {
		if (m.message_type === REACTION_TYPE) {
			const r = parseReaction(m.content);
			if (!r) continue;
			const forTarget = picks.get(r.target) ?? new Map();
			const current = forTarget.get(m.sender_id);
			if (r.remove) {
				if (current && current.emoji === r.emoji) forTarget.delete(m.sender_id);
			} else {
				forTarget.set(m.sender_id, { emoji: r.emoji, name: senderName(m), at: m.created_at });
			}
			picks.set(r.target, forTarget);
			continue;
		}
		visible.push(m);
		byId.set(m.id, m);
	}

	return visible.map((m) => {
		const out = { ...m, reactions: [] };
		const forTarget = picks.get(m.id);
		if (forTarget?.size) {
			const groups = new Map();
			for (const [senderId, p] of forTarget) {
				const g = groups.get(p.emoji) ?? { emoji: p.emoji, count: 0, mine: false, names: [], first: p.at };
				g.count += 1;
				g.names.push(senderId === myUserId ? 'You' : p.name);
				if (senderId === myUserId) g.mine = true;
				if (p.at < g.first) g.first = p.at;
				groups.set(p.emoji, g);
			}
			out.reactions = [...groups.values()].sort((a, b) => b.count - a.count || String(a.first).localeCompare(String(b.first)));
		}
		if (m.reply_to_id) {
			const target = byId.get(m.reply_to_id);
			out.replyTo = target
				? { id: target.id, name: target.sender_id === myUserId ? 'You' : senderName(target), snippet: snippet(target), missing: false }
				: { id: m.reply_to_id, name: '', snippet: 'Original message not loaded', missing: true };
		}
		return out;
	});
}

/** My current reaction on a message, from its folded reactions. */
export function myReaction(folded) {
	return folded?.reactions?.find((r) => r.mine)?.emoji ?? null;
}
