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

	/**
	 * A 401 means the access token is stale, unless another request already
	 * swapped it out while this one was in flight: then just retry with the new
	 * one. Refresh tokens rotate, so refreshing twice for one expiry burns a token.
	 */
	async reauth(usedToken) {
		if (this.session.access_token === usedToken) await this.refresh();
	}

	async request(path, { method = 'GET', body, signal, retry = true, throttled = 0 } = {}) {
		const used = await this.token();
		const res = await this.fetch(`${this.base}${path}`, {
			method,
			signal,
			headers: {
				Authorization: `Bearer ${used}`,
				...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
			},
			body: body !== undefined ? JSON.stringify(body) : undefined,
		});
		if (res.status === 401 && retry) {
			await this.reauth(used);
			return this.request(path, { method, body, signal, retry: false, throttled });
		}
		// Rate limited: wait as told (or back off) and try again a few times.
		if (res.status === 429 && throttled < 3) {
			await sleep(retryAfterMs(res, throttled), signal);
			return this.request(path, { method, body, signal, retry, throttled: throttled + 1 });
		}
		const data = await res.json().catch(() => ({}));
		if (!res.ok) throw new QcError(data.error_description || data.error || `HTTP ${res.status}`, res.status);
		return data;
	}

	/**
	 * Whether this terminal's keys are the account's current keys: 'ok',
	 * 'mismatch' (everything sent to you is encrypted to a key qc does not hold,
	 * so nothing will decrypt) or 'unknown' (no key on file, or the check failed).
	 */
	async keyCheck() {
		try {
			const me = this.me?.id;
			const mine = this.session.keys?.keys1024?.publicKey;
			if (!me || !mine) return 'unknown';
			const { public_keys: keys = {} } = await this.request('/api/crypto/public-keys', { method: 'POST', body: { user_ids: [me] } });
			if (!keys[me]) return 'unknown';
			return keys[me] === mine ? 'ok' : 'mismatch';
		} catch {
			return 'unknown';
		}
	}

	/**
	 * Make this terminal's public key the account's again: everyone encrypts to
	 * the published key, so only do this when these keys read your history
	 * (another device published a key qc does not hold).
	 */
	async publishKey() {
		const mine = this.session.keys?.keys1024?.publicKey;
		if (!mine) throw new QcError('This terminal holds no keys. Run qc login.');
		await this.request('/api/crypto/public-keys', { method: 'PUT', body: { public_key: mine, key_type: 'ML-KEM-1024' } });
		return this.keyCheck();
	}

	/** Your public profile (what qrypt.chat/u/<you> shows): display name, emoji, pronouns, website, bio. */
	async profile() {
		const { user } = await this.request('/api/profile');
		this.remember(user);
		return user;
	}

	/**
	 * Change profile fields: { displayName?, emoji?, pronouns?, website?, bio? }.
	 * A field left out is unchanged; an empty string clears it (an empty
	 * displayName keeps the current name).
	 */
	async updateProfile(fields) {
		const { user } = await this.request('/api/profile/update', { method: 'POST', body: fields });
		this.remember({ username: user.username, display_name: user.displayName });
		return user;
	}

	/** Your public profile as OpenProfile.md (logicsrc.com/openprofile). */
	async openProfile() {
		const { username } = await this.profile();
		const res = await this.fetch(`${this.base}/u/${encodeURIComponent(username)}/openprofile.md`);
		if (!res.ok) throw new QcError(`HTTP ${res.status}`, res.status);
		return res.text();
	}

	/** Keep the saved session's name current: the username and display name can change after qc login. */
	remember({ username, display_name } = {}) {
		const me = this.session.user ?? {};
		if (!username || (me.username === username && me.display_name === display_name)) return;
		this.session = { ...this.session, user: { ...me, username, display_name: display_name ?? me.display_name } };
		this.save(this.session);
	}

	/** Archive a chat for you (or bring it back with on = false); the others still see it. */
	async archive(conversationId, on = true) {
		return this.request(`/api/conversations/${on ? 'archive' : 'unarchive'}`, { method: 'POST', body: { conversationId } });
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
			emoji: m.sender?.emoji || '',
			pronouns: m.sender?.pronouns || '',
			username: m.sender?.username || '',
			mine: m.sender_id === this.me?.id,
			text: m.content,
			at: m.created_at,
			reactions: m.reactions.map(({ emoji, count, mine, names }) => ({ emoji, count, mine, names })),
			...(m.replyTo ? { replyTo: m.replyTo } : {}),
		}));
		return { messages: out, hasMore };
	}

	/** People on qrypt.chat matching a username, name or unique id (best first, never you). */
	async searchUsers(query) {
		const q = String(query ?? '').trim().replace(/^@/, '');
		if (!q) return [];
		const { users = [] } = await this.request(`/api/users/search?q=${encodeURIComponent(q)}`);
		return users;
	}

	/**
	 * Open a direct chat with one person, given their @username (or a name that
	 * matches only them). An existing chat between the two of you is reused.
	 * Returns the chat as conversations() lists it.
	 */
	async startDirect(who) {
		const user = pickUser(await this.searchUsers(who), who);
		const { conversation_id: id } = await this.request('/api/chat/conversations', {
			method: 'POST',
			body: { type: 'direct', participant_ids: [user.id] },
		});
		if (!id) throw new QcError(`Could not start a chat with @${user.username}`);
		const chat = (await this.conversations()).find((c) => c.id === id);
		return chat ?? { id, title: user.display_name || user.username, participants: [] };
	}

	/** Join a group from its invite link or code. Returns { conversation_id, joined }. */
	async joinGroup(code) {
		return this.request('/api/conversations/join', { method: 'POST', body: { code } });
	}

	/** A group's invite link (group admins): made if missing; reset replaces it, off turns it off. */
	async groupInvite(conversationId, { reset = false, off = false } = {}) {
		const path = `/api/chat/conversations/${encodeURIComponent(conversationId)}/invite`;
		if (off) return this.request(path, { method: 'DELETE' });
		return this.request(path, { method: 'POST', body: { reset } });
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
		let reauthed = false;
		while (!signal?.aborted) {
			onStatus('connecting');
			try {
				const used = await this.token();
				const res = await this.fetch(`${this.base}/api/events`, {
					headers: { Authorization: `Bearer ${used}`, Accept: 'text/event-stream' },
					signal,
				});
				if (res.status === 401) {
					// One refresh per rejection. If a fresh token is refused too, stop:
					// looping here would rotate refresh tokens until the session dies.
					if (reauthed) throw new QcError('The server refused this session. Run qc login.', 401);
					reauthed = true;
					await this.reauth(used);
					continue;
				}
				if (res.status === 429) {
					await sleep(retryAfterMs(res, 2), signal);
					continue;
				}
				if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
				onStatus('live');
				delay = 1000;
				reauthed = false;
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

/** How long a 429 says to wait: Retry-After seconds, else 2s, 4s, 8s ... */
export function retryAfterMs(res, attempt = 0) {
	const s = Number(res.headers?.get?.('retry-after'));
	return Number.isFinite(s) && s > 0 ? Math.min(s, 60) * 1000 : 2000 * 2 ** attempt;
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

/**
 * The one person `query` means among search results: an exact @username (or
 * unique id) first, else the only result. Anything else says who it could be.
 */
export function pickUser(users, query) {
	const q = String(query ?? '').trim().replace(/^@/, '').toLowerCase();
	const exact = users.filter((u) => u.username?.toLowerCase() === q || u.unique_identifier?.toLowerCase() === q);
	if (exact.length === 1) return exact[0];
	if (users.length === 1) return users[0];
	if (!users.length) throw new QcError(`Nobody on qrypt.chat matches "${query}"`, 404);
	const names = users.slice(0, 8).map((u) => `@${u.username}${u.display_name && u.display_name !== u.username ? ` (${u.display_name})` : ''}`);
	throw new QcError(`"${query}" matches ${users.length} people: ${names.join(', ')}${users.length > 8 ? ', …' : ''}. Use their @username.`, 409);
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
