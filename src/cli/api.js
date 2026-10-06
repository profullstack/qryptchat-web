/**
 * The qc client: qrypt.chat's REST API with a Bearer token, end-to-end
 * encryption on the way out and decryption on the way in, and the SSE event
 * stream for live updates. Sessions refresh themselves (rotating refresh
 * tokens, POST /api/cli/token) and every refresh is written back to disk.
 */
import { baseUrl } from './config.js';
import { keyring } from './crypto.js';
import { foldMessages, reactionEnvelope, REACTION_TYPE } from '../lib/chat/reactions.js';
import { callSummary, CALL_TYPE } from '../lib/chat/calls.js';

export class QcError extends Error {
	constructor(message, status) {
		super(message);
		this.name = 'QcError';
		this.status = status;
	}
}

export class QcClient {
	/**
	 * @param {any} session as saved by `qc login`
	 * @param {{ save?: (session: any) => void, fetch?: typeof fetch, env?: NodeJS.ProcessEnv }} [options]
	 */
	constructor(session, options = {}) {
		this.session = session;
		this.base = baseUrl(session, options.env);
		// Re-seals the session (see config.unlockSession); a client without one keeps refreshes in memory only.
		this.save = options.save ?? (() => {});
		this.fetch = options.fetch ?? globalThis.fetch;
		this.ring = keyring(session.keys);
		this.refreshing = null;
	}

	get me() {
		return this.session.user;
	}

	async refresh() {
		this.refreshing ??= (async () => {
			const res = await this.fetch(`${this.base}/api/cli/token`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: this.session.refresh_token }),
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok) throw new QcError(body.error_description || 'Your session has ended. Run qc login.', 401);
			this.session = { ...this.session, ...body };
			this.save(this.session);
		})().finally(() => {
			this.refreshing = null;
		});
		return this.refreshing;
	}

	async token() {
		const expiresAt = Number(this.session.expires_at || 0) * 1000;
		if (expiresAt && expiresAt - Date.now() < 60_000) await this.refresh();
		return this.session.access_token;
	}

	async request(path, { method = 'GET', body, signal, retry = true } = {}) {
		const res = await this.fetch(`${this.base}${path}`, {
			method,
			signal,
			headers: {
				Authorization: `Bearer ${await this.token()}`,
				...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
			},
			body: body !== undefined ? JSON.stringify(body) : undefined,
		});
		if (res.status === 401 && retry) {
			await this.refresh();
			return this.request(path, { method, body, signal, retry: false });
		}
		const data = await res.json().catch(() => ({}));
		if (!res.ok) throw new QcError(data.error_description || data.error || `HTTP ${res.status}`, res.status);
		return data;
	}

	/** Conversations, newest activity first, each with a display title. */
	async conversations() {
		const { conversations = [] } = await this.request('/api/conversations/load', { method: 'POST', body: {} });
		return conversations.map((c) => ({ ...c, title: conversationTitle(c, this.me) }));
	}

	/** Decrypted messages, oldest first. */
	/**
	 * Decrypted messages, oldest first. Reactions (encrypted messages of their
	 * own) are folded into their targets as `reactions`, and replies carry a
	 * `replyTo` quote, exactly as the web app shows them.
	 */
	async messages(conversationId, { limit = 200, before } = {}) {
		const { messages = [], hasMore = false } = await this.request('/api/messages/load', {
			method: 'POST',
			body: { conversationId, limit, ...(before ? { before } : {}) },
		});
		const raw = [];
		for (const m of messages) {
			let content = m.encrypted_content ? await this.ring.decrypt(m.encrypted_content) : '';
			if (m.message_type === CALL_TYPE) {
				// The envelope holds the call's media key: show what happened, never the key.
				content = `${callSummary({ ...m, content }, this.me?.id)} · join on qrypt.chat`;
			} else if (m.message_type === 'file' || m.has_attachments) {
				content = `📎 ${content && content !== '[File attachment]' ? `${content} ` : ''}(attachment: open qrypt.chat to download)`;
			}
			raw.push({ ...m, content });
		}
		const out = foldMessages(raw, this.me?.id).map((m) => ({
			id: m.id,
			conversationId: m.conversation_id,
			senderId: m.sender_id,
			sender: m.sender?.display_name || m.sender?.username || 'unknown',
			username: m.sender?.username || '',
			mine: m.sender_id === this.me?.id,
			text: m.content,
			at: m.created_at,
			reactions: m.reactions.map(({ emoji, count, mine, names }) => ({ emoji, count, mine, names })),
			...(m.replyTo ? { replyTo: m.replyTo } : {}),
		}));
		return { messages: out, hasMore };
	}

	/** React to a message (one per person; remove=true withdraws it). Encrypted like any message. */
	async react(conversationId, messageId, emoji, remove = false) {
		return this.send(conversationId, reactionEnvelope(messageId, emoji, remove), { messageType: REACTION_TYPE });
	}

	/**
	 * Encrypt the text once per participant (their public key, ML-KEM-1024) and
	 * send every copy. The server stores ciphertext only.
	 */
	async send(conversationId, text, { replyTo, messageType = 'text' } = {}) {
		const { participants = [] } = await this.request(`/api/chat/conversations/${encodeURIComponent(conversationId)}/participants`);
		const userIds = participants.map((p) => p.user_id);
		if (!userIds.length) throw new QcError('This conversation has no participants');
		const { public_keys: keys = {} } = await this.request('/api/crypto/public-keys', { method: 'POST', body: { user_ids: userIds } });
		const encryptedContents = {};
		const missing = [];
		for (const id of userIds) {
			if (!keys[id]) {
				missing.push(id);
				continue;
			}
			encryptedContents[id] = await this.ring.encrypt(text, keys[id]);
		}
		if (!Object.keys(encryptedContents).length) throw new QcError('No participant has a public key yet');
		const { message } = await this.request('/api/messages/send', {
			method: 'POST',
			body: { conversationId, encryptedContents, messageType, ...(replyTo ? { replyToId: replyTo } : {}) },
		});
		return { message, skipped: missing.length };
	}

	typing(conversationId, on) {
		return this.request(`/api/typing/${on ? 'start' : 'stop'}`, { method: 'POST', body: { conversationId } }).catch(() => {});
	}

	/**
	 * Follow the SSE stream until signal aborts, reconnecting with backoff.
	 * onEvent({ type, data }); onStatus('live' | 'connecting' | 'offline').
	 */
	async events(onEvent, { signal, onStatus = () => {} } = {}) {
		let delay = 1000;
		while (!signal?.aborted) {
			onStatus('connecting');
			try {
				const res = await this.fetch(`${this.base}/api/events`, {
					headers: { Authorization: `Bearer ${await this.token()}`, Accept: 'text/event-stream' },
					signal,
				});
				if (res.status === 401) {
					await this.refresh();
					continue;
				}
				if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
				onStatus('live');
				delay = 1000;
				await readSse(res.body, onEvent);
			} catch (err) {
				if (signal?.aborted) break;
				if (err instanceof QcError && err.status === 401) throw err;
			}
			if (signal?.aborted) break;
			onStatus('offline');
			await sleep(delay, signal);
			delay = Math.min(delay * 2, 30_000);
		}
	}
}

/** Parse `event: X\ndata: {...}\n\n` frames from a byte stream. */
export async function readSse(body, onEvent) {
	const decoder = new TextDecoder();
	let buffer = '';
	for await (const chunk of body) {
		buffer += decoder.decode(chunk, { stream: true });
		let at;
		while ((at = buffer.indexOf('\n\n')) !== -1) {
			const frame = buffer.slice(0, at);
			buffer = buffer.slice(at + 2);
			let type = 'message';
			const data = [];
			for (const line of frame.split('\n')) {
				if (line.startsWith('event:')) type = line.slice(6).trim();
				else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
			}
			if (!data.length) continue;
			let parsed;
			try {
				parsed = JSON.parse(data.join('\n'));
			} catch {
				parsed = data.join('\n');
			}
			onEvent({ type, data: parsed?.payload ?? parsed?.data ?? parsed });
		}
	}
}

function sleep(ms, signal) {
	return new Promise((resolve) => {
		const t = setTimeout(resolve, ms);
		signal?.addEventListener('abort', () => {
			clearTimeout(t);
			resolve();
		});
	});
}

/** A conversation's name, or the other participants' names for a direct chat. */
export function conversationTitle(c, me) {
	if (c.name) return c.name;
	const others = (c.participants || [])
		.filter((p) => p.user_id !== me?.id)
		.map((p) => p.user?.display_name || p.user?.username)
		.filter(Boolean);
	return others.length ? others.join(', ') : 'Just you';
}
