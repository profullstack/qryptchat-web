/**
 * `qc`: qrypt.chat in the terminal, on hqtui.
 *
 *   ┌ Chats ──────┐┌ alice ─────────────── 2 people · ML-KEM-1024 ┐
 *   │▸ alice     2││ ── Tue 6 Oct ──                              │
 *   │  team chat  ││ alice  14:02                                 │
 *   │             ││   shipped it 🚀                              │
 *   │             ││ you  14:03                                   │
 *   │             ││   🔥                                         │
 *   │             ││ alice is typing…                             │
 *   │             ││ ▏Message                                     │
 *   └─────────────┘└──────────────────────────────────────────────┘
 *    ENTER send  CTRL+E emoji  TAB chats  PGUP scroll      ● live
 *
 * The view is a pure function of one state object (render() below), so tests
 * draw the real layout with renderToText. The controller (runTui) owns the
 * network: conversations, decrypted messages, sending, and the SSE stream.
 */
import { createApp, createImageStore, drawIcon, drawRichText, editText, emojify, insertText, stringWidth, truncate, widgets, wrap } from '@profullstack/hqtui';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { configDir } from './config.js';

const SIDEBAR = 30;

export function initialState(me) {
	return {
		me,
		conversations: [],
		selected: 0,
		activeId: null,
		messages: {},
		unread: {},
		typing: {},
		focus: 'compose',
		field: { value: '', cursor: 0 },
		picker: null,
		recent: [],
		scrollBack: 0,
		status: 'connecting',
		notice: '',
		loading: true,
	};
}

const pad2 = (n) => String(n).padStart(2, '0');
const timeOf = (iso) => {
	const d = new Date(iso);
	return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};
const dayOf = (iso) => new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

/** A stable colour per sender, so a busy group stays readable. */
function nameColor(theme, key) {
	const palette = [theme.accent, theme.info, theme.success, theme.warning, theme.secondary, theme.primary];
	let h = 0;
	for (const ch of key) h = (h * 31 + ch.codePointAt(0)) >>> 0;
	return palette[h % palette.length];
}

/** The transcript as display lines for a given width, oldest first. */
export function transcriptLines(messages, width, theme) {
	const lines = [];
	let day = '';
	let last = null;
	for (const m of messages) {
		const d = dayOf(m.at);
		if (d !== day) {
			day = d;
			const label = ` ${d} `;
			const side = Math.max(2, Math.floor((width - stringWidth(label)) / 2));
			lines.push({ text: `${'─'.repeat(side)}${label}${'─'.repeat(Math.max(0, width - side - stringWidth(label)))}`, fg: theme.border });
			last = null;
		}
		const sameRun = last && last.senderId === m.senderId && new Date(m.at) - new Date(last.at) < 5 * 60 * 1000;
		if (!sameRun) {
			lines.push({
				spans: [
					{ text: m.mine ? 'you' : m.sender, fg: m.mine ? theme.primary : nameColor(theme, m.senderId || m.sender), bold: true },
					{ text: `  ${timeOf(m.at)}`, fg: theme.muted },
				],
			});
		}
		if (m.replyTo) {
			const who = m.replyTo.name ? `${m.replyTo.name}: ` : '';
			lines.push({ text: truncate(`  ┃ ${who}${m.replyTo.snippet}`, width), fg: theme.muted });
		}
		for (const part of String(m.text ?? '').split('\n')) {
			for (const line of wrap(part, Math.max(4, width - 2))) lines.push({ text: `  ${line}`, fg: theme.foreground });
		}
		if (m.reactions?.length) {
			const summary = m.reactions.map((r) => `${r.emoji}${r.count > 1 ? ` ${r.count}` : ''}`).join('  ');
			lines.push({ text: truncate(`  ${summary}`, width), fg: m.reactions.some((r) => r.mine) ? theme.accent : theme.muted });
		}
		last = m;
	}
	return lines;
}

function drawTranscript(surface, state) {
	const theme = surface.theme;
	const messages = state.messages[state.activeId] || [];
	if (!state.activeId) {
		surface.text(1, 1, state.loading ? 'Loading your chats…' : 'Pick a chat on the left.', { fg: theme.muted });
		return;
	}
	if (!messages.length) {
		surface.text(1, 1, 'No messages yet. Say hello 👋', { fg: theme.muted });
		return;
	}
	const lines = transcriptLines(messages, surface.width, theme);
	const start = Math.max(0, lines.length - surface.height - state.scrollBack);
	// Newest at the bottom, just above the composer, like every chat app.
	const top = Math.max(0, surface.height - (lines.length - start));
	for (let y = top; y < surface.height; y++) {
		const line = lines[start + y - top];
		if (!line) break;
		// Emoji draw as our OpenEmoji artwork on terminals that show images (HD).
		if (line.spans) {
			let x = 0;
			for (const span of line.spans) x += drawRichText(surface, x, y, span.text, { fg: span.fg, attrs: span.bold ? 1 : 0 }, state.images);
		} else {
			drawRichText(surface, 0, y, truncate(line.text, surface.width), { fg: line.fg }, state.images);
		}
	}
	if (state.scrollBack > 0) {
		const hint = ` ↓ ${state.scrollBack} more `;
		surface.text(Math.max(0, surface.width - stringWidth(hint)), surface.height - 1, hint, { fg: theme.background, bg: theme.accent });
	}
}

/** Draw the whole screen for a state. Pure: callbacks are passed in. */
export function render({ ui, width, height, theme }, state, on = {}) {
	const active = state.conversations.find((c) => c.id === state.activeId);
	const typingNames = Object.values(state.typing[state.activeId] || {}).map((t) => t.name);

	ui.row({ size: 1 }, (bar) => {
		bar.draw((s) => {
			const t = s.theme;
			s.fillRect(0, 0, s.width, 1, { bg: t.surface ?? t.background });
			const brand = { fg: t.background, bg: t.primary, attrs: 1 };
			let x = s.text(0, 0, ' ', brand);
			x += drawIcon(s, x, 0, 'lock', state.images, '🔒', brand);
			x += s.text(x, 0, ' qrypt.chat ', brand);
			x += s.text(x, 0, `  @${state.me?.username ?? '?'}`, { fg: t.foreground, bg: t.surface ?? t.background });
			if (state.notice) s.text(x + 2, 0, truncate(state.notice, Math.max(0, s.width - x - 16)), { fg: t.warning, bg: t.surface ?? t.background });
			const live = { live: ['●', 'live', t.success], connecting: ['◌', 'connecting', t.warning], offline: ['○', 'offline', t.danger] }[state.status] ?? ['○', state.status, t.muted];
			const label = `${live[0]} ${live[1]} `;
			s.text(s.width - stringWidth(label), 0, label, { fg: live[2], bg: t.surface ?? t.background });
		});
	});

	ui.row({ size: 'fill' }, (row) => {
		const listWidth = Math.min(SIDEBAR, Math.max(18, Math.floor(width * 0.3)));
		row.panel({ title: 'Chats', size: listWidth, borderColor: state.focus === 'list' ? theme?.borderFocused : undefined }, (p) => {
			// hqtui's list declares a badge but does not draw it, so the unread
			// count is laid out here: name on the left, ●N flush right.
			const inner = Math.max(4, listWidth - 5); // borders, padding, scrollbar
			p.list({
				items: state.conversations.map((c) => {
					const unread = state.unread[c.id] || 0;
					const tag = unread ? ` ●${unread > 99 ? '99+' : unread}` : '';
					const name = truncate(c.title, inner - stringWidth(tag));
					return {
						label: `${name}${' '.repeat(Math.max(0, inner - stringWidth(name) - stringWidth(tag)))}${tag}`,
						color: unread ? theme?.accent : undefined,
					};
				}),
				selected: state.selected,
				followSelection: true,
				scrollbar: true,
				// One click opens a chat: no select-then-double-click.
				onSelectRow: (i) => on.open?.(i),
				onActivateRow: (i) => on.open?.(i),
			});
		});
		const people = active?.participants?.length ?? 0;
		row.panel(
			{
				title: active?.title ?? 'qc',
				subtitle: active ? `${people} ${people === 1 ? 'person' : 'people'} · ML-KEM-1024` : 'end-to-end encrypted',
				borderColor: state.focus === 'compose' ? theme?.borderFocused : undefined,
			},
			(p) => {
				p.draw((s) => {
					drawTranscript(s, state);
					p.ctx.hit({ rect: s.hitRect(), onScroll: (delta) => on.scroll?.(-delta) });
				}, { size: 'fill' });
				p.label(typingNames.length ? `${typingNames.join(', ')} ${typingNames.length === 1 ? 'is' : 'are'} typing…` : ' ', { size: 1 });
				p.textInput({
					value: state.field.value,
					cursor: state.field.cursor,
					placeholder: active ? `Message ${active.title}  (Ctrl+E emoji, :rocket: works too)` : 'Pick a chat first',
					focused: state.focus === 'compose' && !state.picker,
					size: 1,
				});
			},
		);
	});

	ui.statusBar({
		items: [
			{ key: 'Enter', label: state.focus === 'list' ? 'open' : 'send' },
			{ key: 'Ctrl+E', label: 'emoji' },
			{ key: 'Tab', label: state.focus === 'list' ? 'compose' : 'chats' },
			{ key: 'PgUp', label: 'scroll' },
			{ key: 'Ctrl+C', label: 'quit' },
		],
		size: 1,
	});

	if (state.picker) {
		const size = widgets.emojiPickerSize(10, 7);
		ui.emojiPicker({
			state: state.picker,
			recent: state.recent,
			x: Math.min(Math.max(0, width - size.width - 1), Math.min(SIDEBAR, Math.floor(width * 0.3)) + 1),
			y: Math.max(0, height - size.height - 3),
			onChange: (s) => on.pickerChange?.(s),
			onPick: (e) => on.pick?.(e),
			onClose: () => on.pickerClose?.(),
		});
	}
}

const recentFile = () => join(configDir(), 'recent-emoji.json');
function loadRecent() {
	try {
		const list = JSON.parse(readFileSync(recentFile(), 'utf8'));
		return Array.isArray(list) ? list.filter((c) => typeof c === 'string').slice(0, 30) : [];
	} catch {
		return [];
	}
}
function saveRecent(list) {
	try {
		writeFileSync(recentFile(), JSON.stringify(list), { mode: 0o600 });
	} catch {
		// recents are a convenience
	}
}

/** Run the full-screen client until Ctrl+C. */
const KEY_MISMATCH = "Keys don't match your account, so messages can't decrypt. Run qc login and approve from a browser that can read your chats.";

export async function runTui(client, { initialChat } = {}) {
	const state = initialState(client.me);
	state.recent = loadRecent();
	const abort = new AbortController();
	const app = await createApp({ quitKeys: ['ctrl+c'], focusNavigation: false });
	const redraw = () => app.invalidate();
	// HD: our OpenEmoji/OpenIcon PNGs as real images where the terminal can show
	// them. Kitty/Ghostty are detected; over SSH or in tmux say so with QC_HD=1
	// (or HQTUI_IMAGES=1). Everywhere else the characters are drawn as before.
	const env = process.env.QC_HD && !process.env.HQTUI_IMAGES ? { ...process.env, HQTUI_IMAGES: process.env.QC_HD } : process.env;
	state.images = createImageStore({ write: (seq) => app.terminal.write(seq), onReady: redraw, env });
	const note = (msg, { sticky = false } = {}) => {
		state.notice = msg;
		redraw();
		if (msg && !sticky) setTimeout(() => {
			if (state.notice === msg) {
				state.notice = '';
				redraw();
			}
		}, 6000);
	};

	// A stray console line would tear the screen; the crypto is already muted.
	for (const m of ['log', 'info', 'warn', 'error', 'debug']) console[m] = () => {};

	async function loadMessages(id) {
		try {
			const { messages } = await client.messages(id, { limit: 100 });
			state.messages[id] = messages;
			redraw();
		} catch (err) {
			note(`Could not load messages: ${err.message}`);
		}
	}

	let keysChecked = false;

	async function loadConversations() {
		try {
			const before = state.activeId;
			state.conversations = await client.conversations();
			state.loading = false;
			if (!state.activeId && state.conversations.length) {
				const want = initialChat ? state.conversations.findIndex((c) => c.id === initialChat || c.title.toLowerCase().includes(String(initialChat).toLowerCase())) : 0;
				openAt(Math.max(0, want));
			} else {
				state.selected = Math.max(0, state.conversations.findIndex((c) => c.id === before));
			}
			// The events stream joins every chat's live room itself, so unread
			// counts arrive without loading each chat (which tripped the rate limit).
			redraw();
			if (!keysChecked) {
				keysChecked = true;
				if ((await client.keyCheck()) === 'mismatch') note(KEY_MISMATCH, { sticky: true });
			}
		} catch (err) {
			state.loading = false;
			note(err.status === 401 ? 'Session ended: run qc login' : `Could not load chats: ${err.message}`);
		}
	}

	function openAt(i) {
		const c = state.conversations[i];
		if (!c) return;
		state.selected = i;
		state.activeId = c.id;
		state.unread[c.id] = 0;
		state.scrollBack = 0;
		if (!state.messages[c.id]) loadMessages(c.id);
		redraw();
	}

	let typingSent = 0;
	function typed() {
		if (!state.activeId) return;
		const now = Date.now();
		if (now - typingSent > 3000) {
			typingSent = now;
			client.typing(state.activeId, true);
		}
	}

	async function send() {
		const text = emojify(state.field.value.trim(), { mode: 'emoji' });
		if (!text || !state.activeId) return;
		const id = state.activeId;
		state.field = { value: '', cursor: 0 };
		state.scrollBack = 0;
		const pending = { id: `pending-${Date.now()}`, senderId: client.me?.id, sender: 'you', mine: true, text, at: new Date().toISOString() };
		state.messages[id] = [...(state.messages[id] || []), pending];
		redraw();
		try {
			const { skipped } = await client.send(id, text);
			if (skipped) note(`${skipped} participant(s) have no key yet and will not see this`);
			client.typing(id, false);
			typingSent = 0;
			await loadMessages(id);
		} catch (err) {
			state.messages[id] = (state.messages[id] || []).filter((m) => m !== pending);
			state.field = { value: text, cursor: text.length };
			note(`Not sent: ${err.message}`);
		}
	}

	const handlers = {
		select: (i) => {
			state.selected = i;
			redraw();
		},
		open: (i) => {
			openAt(i);
			state.focus = 'compose';
		},
		scroll: (delta) => {
			state.scrollBack = Math.max(0, state.scrollBack + delta * 3);
			redraw();
		},
		pickerChange: (s) => {
			state.picker = s;
			redraw();
		},
		pick: (e) => {
			state.field = insertText(state.field, e.char);
			state.recent = [e.char, ...state.recent.filter((c) => c !== e.char)].slice(0, 30);
			saveRecent(state.recent);
			state.picker = null;
			typed();
			redraw();
		},
		pickerClose: () => {
			state.picker = null;
			redraw();
		},
	};

	app.on('key', (event) => {
		if (state.picker) return; // the picker's own key handler has it
		if (event.key === 'ctrl+e') {
			state.picker = widgets.createEmojiPicker(state.recent);
		} else if (event.key === 'tab' || event.key === 'shift+tab' || (event.key === 'escape' && state.focus === 'compose')) {
			state.focus = state.focus === 'list' ? 'compose' : 'list';
		} else if (event.key === 'pageup') {
			handlers.scroll(4);
		} else if (event.key === 'pagedown') {
			handlers.scroll(-4);
		} else if (event.key === 'ctrl+n' || event.key === 'alt+down') {
			openAt(Math.min(state.conversations.length - 1, state.selected + 1));
		} else if (event.key === 'ctrl+p' || event.key === 'alt+up') {
			openAt(Math.max(0, state.selected - 1));
		} else if (event.key === 'ctrl+r') {
			loadConversations();
			if (state.activeId) loadMessages(state.activeId);
		} else if (state.focus === 'list') {
			if (event.key === 'up' || event.key === 'k') state.selected = Math.max(0, state.selected - 1);
			else if (event.key === 'down' || event.key === 'j') state.selected = Math.min(state.conversations.length - 1, state.selected + 1);
			else if (event.key === 'enter' || event.key === 'right' || event.key === 'l') handlers.open(state.selected);
		} else if (event.key === 'enter') {
			send();
		} else if (event.key === 'up' && !state.field.value) {
			handlers.scroll(1);
		} else if (event.key === 'down' && !state.field.value) {
			handlers.scroll(-1);
		} else {
			const next = editText(state.field, event);
			if (next) {
				if (next.value !== state.field.value) typed();
				state.field = next;
			}
		}
		redraw();
	});
	app.on('paste', (event) => {
		if (state.picker || state.focus !== 'compose') return;
		state.field = insertText(state.field, event.text);
		redraw();
	});
	app.on('exit', () => {
		state.images?.clear();
		abort.abort();
	});

	app.render((args) => render(args, state, handlers));

	loadConversations();
	client
		.events(
			({ type, data }) => {
				if (type === 'NEW_MESSAGE') {
					const id = data?.message?.conversation_id;
					if (!id) return;
					if (id === state.activeId) loadMessages(id);
					else {
						if (data.message.sender_id !== client.me?.id) state.unread[id] = (state.unread[id] || 0) + 1;
						delete state.messages[id];
					}
					// Float the chat with news to the top.
					const i = state.conversations.findIndex((c) => c.id === id);
					if (i > 0) {
						const [c] = state.conversations.splice(i, 1);
						state.conversations.unshift(c);
						state.selected = state.conversations.findIndex((x) => x.id === state.activeId);
					}
					if (i === -1) loadConversations();
					if (data.message.sender_id !== client.me?.id) delete (state.typing[id] || {})[data.message.sender_id];
				} else if (type === 'USER_TYPING' && data?.conversationId) {
					const room = (state.typing[data.conversationId] ||= {});
					if (data.isTyping) {
						room[data.userId] = { name: data.displayName || data.username || 'someone', until: Date.now() + 6000 };
						setTimeout(() => {
							if (room[data.userId]?.until <= Date.now()) {
								delete room[data.userId];
								redraw();
							}
						}, 6100);
					} else delete room[data.userId];
				} else if (type === 'CONVERSATION_CREATED') {
					loadConversations();
				}
				redraw();
			},
			{
				signal: abort.signal,
				onStatus: (s) => {
					state.status = s;
					redraw();
				},
			},
		)
		.catch((err) => note(err.message));

	await app.start();
	abort.abort();
}
