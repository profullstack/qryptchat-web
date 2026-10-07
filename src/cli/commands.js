/**
 * qc's commands. Bare `qc` is the full-screen client; everything else is for
 * scripts and agents and prints plain text (or JSON with --json).
 */
import { QcClient } from './api.js';
import { clearSession, loadSession, sessionPath, unlockSession } from './config.js';
import { login } from './login.js';
import { joinAsAgent } from './agent.js';
import { em, fail, info, mark, ok, warn, who } from './style.js';
import { notify } from './notify.js';
export { exitWhenFlushed } from './exit.js';

/** An error as qc prints it: the error icon and the message. */
export const errorLine = (err) => `qc: ${fail(err?.message ?? String(err))}`;

export const HELP = `qc: qrypt.chat in your terminal (end-to-end encrypted, ML-KEM-1024)

Usage:
  qc                      open the chat client (signs you in first if needed)
  qc fonts install|status|remove   our OpenEmoji colour font as the terminal's emoji font
  qc agent join <link>    join as an AI agent from an invite (makes its own keys) [--name --username]
  qc login [--oob]        sign in through your browser; --oob to paste a code (SSH)
  qc logout               forget this terminal's session and keys
  qc update [--check]     update qc to the latest release (--check only says whether there is one)
  qc whoami               who this terminal is signed in as
  qc profile [--emoji 🔭] [--pronouns she/her] [--website URL] [--bio TEXT]
                          show or set your public profile (an empty value clears it);
                          --openprofile prints it as OpenProfile.md
  qc chats                list your chats
  qc read <chat> [-n 20]  print the last messages of a chat
  qc send <chat> <text>   send a message (text "-" reads stdin; --reply <message-id> to reply)
  qc react <chat> <message-id> <emoji> [--remove]   react to a message
  qc listen               print new messages as they arrive (NDJSON with --json; --notify alerts with it)
  qc mcp                  run as an MCP server on stdio (list_chats, read_chat, send_message)

<chat> is a chat id or part of its name. Options: --json, --url <server> (or QC_URL).
Keys and tokens are sealed (ChaCha20-Poly1305) in ${'$'}QC_HOME or ~/.config/qc; the key is in your
OS keychain, or comes from a passphrase (QC_PASSPHRASE for scripts and qc mcp).
HD: emoji and icons are drawn as our OpenEmoji/OpenIcon images in Kitty, Ghostty, WezTerm and iTerm2.
Over SSH or in tmux (set -g allow-passthrough on) say which: QC_HD=1 (Kitty/Ghostty) or
QC_HD=wezterm (WezTerm/iTerm2). QC_HD=0 turns it off. Mosh carries only text, so behind mosh
emoji stay characters: for images use ssh or WezTerm's multiplexer (wezterm connect).
New messages raise a terminal notification (OSC 9, Kitty OSC 99) and a bell, naming the chat
but never the text; in tmux set -g allow-passthrough on. QC_NOTIFY=bell rings only, QC_NOTIFY=0 is quiet.`;

export function parseArgs(argv) {
	const args = { _: [], flags: {} };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === '--') {
			args._.push(...argv.slice(i + 1));
			break;
		}
		if (a.startsWith('--')) {
			const [k, v] = a.slice(2).split('=', 2);
			if (v !== undefined) args.flags[k] = v;
			else if (['url', 'n', 'limit', 'reply', 'emoji', 'pronouns', 'website', 'bio', 'name', 'username'].includes(k) && argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) args.flags[k] = argv[++i];
			else args.flags[k] = true;
		} else if (a === '-n' && argv[i + 1] !== undefined) {
			args.flags.n = argv[++i];
		} else if (a === '-h') {
			args.flags.help = true;
		} else if (a === '-v') {
			args.flags.version = true;
		} else {
			args._.push(a);
		}
	}
	return args;
}

/** Match a chat by id, exact name, then a unique name fragment. */
export function findChat(chats, query) {
	const q = String(query).toLowerCase();
	const byId = chats.find((c) => c.id === query);
	if (byId) return byId;
	const exact = chats.filter((c) => c.title.toLowerCase() === q);
	if (exact.length === 1) return exact[0];
	const some = chats.filter((c) => c.title.toLowerCase().includes(q));
	if (some.length === 1) return some[0];
	if (some.length > 1) throw new Error(`"${query}" matches ${some.length} chats: ${some.map((c) => c.title).join(', ')}`);
	throw new Error(`No chat matches "${query}". Try qc chats.`);
}

async function client(flags, { interactive = false } = {}) {
	if (flags.url) process.env.QC_URL = flags.url;
	// The session on disk is sealed: unlocking may ask for the passphrase (or read QC_PASSPHRASE / the keychain).
	let opened = await unlockSession();
	if (!opened) {
		if (!interactive) throw new Error('Not signed in. Run qc login.');
		opened = await login({ oob: !!flags.oob });
	}
	return new QcClient(opened.session, { save: opened.save });
}

const stamp = (iso) => new Date(iso).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });

async function readStdin() {
	let text = '';
	for await (const chunk of process.stdin) text += chunk;
	return text;
}

export async function main(argv, { version = '0.0.0' } = {}) {
	const { _: [cmd, ...rest], flags } = parseArgs(argv);
	const out = (line) => process.stdout.write(`${line}\n`);
	const json = (value) => out(JSON.stringify(value, null, flags.json === 'compact' ? 0 : 2));

	if (flags.version) return out(`qc ${version}`);
	if (flags.help || cmd === 'help') return out(HELP);
	if (flags.url) process.env.QC_URL = flags.url;

	switch (cmd) {
		case undefined:
		case 'tui': {
			if (!process.stdout.isTTY) throw new Error('qc needs a terminal. For scripts use qc chats / read / send / listen.');
			const c = await client(flags, { interactive: true });
			const { runTui } = await import('./tui.js');
			return runTui(c, { initialChat: rest[0] });
		}
		case 'agent': {
			if (rest[0] !== 'join' || !rest[1]) throw new Error('Usage: qc agent join <invite link> [--name NAME] [--username NAME]');
			const { session, conversationId, operator } = await joinAsAgent(rest[1], {
				name: typeof flags.name === 'string' ? flags.name : undefined,
				username: typeof flags.username === 'string' ? flags.username : undefined,
			});
			if (flags.json) return json({ user: session.user, conversation_id: conversationId, operator });
			out(ok(`Joined qrypt.chat as ${who(session.user, { agent: true })}, operated by ${who(operator)}.`));
			out(`${mark('key')}Keys made here and sealed in ${sessionPath()}; only the public key left this machine.`);
			const chatName = operator?.display_name || operator?.username || '<chat>';
			out(`${mark('chat')}Your chat with ${chatName} is open. Try: qc listen   or   qc send "${chatName}" "hello"   or   qc mcp`);
			return;
		}
		case 'fonts': {
			// The OpenEmoji colour font as the terminal's emoji font, via hqtui.
			const { installEmojiFont, emojiFontStatus, removeEmojiFont } = await import('@profullstack/hqtui');
			const action = rest[0] || 'status';
			if (action === 'install') {
				const result = await installEmojiFont();
				for (const note of result.notes) out(info(note));
				if (result.snippets?.length) {
					out(`\n${mark('info')}Terminals that pick their own fonts need one line each:`);
					for (const sn of result.snippets) out(`  ${sn.terminal} (${sn.file}):\n    ${sn.snippet}`);
				}
				return out(`\n${ok('Installed OpenEmoji. Restart the terminal, then run: qc fonts status')}`);
			}
			if (action === 'status') {
				const st = await emojiFontStatus();
				out(`${st.installed ? ok('OpenEmoji installed') : warn('OpenEmoji not installed (qc fonts install)')}`);
				if (st.emojiFont !== undefined) out(`${mark('info')}Emoji font in use: ${st.emojiFont || 'none'}`);
				return out(st.active ? ok('Active: emoji draw as OpenEmoji') : warn('Not active yet (restart the terminal)'));
			}
			if (action === 'remove') {
				const done = await removeEmojiFont();
				return out(done.length ? ok('Removed the OpenEmoji font setup.') : info('Nothing to remove.'));
			}
			throw new Error('Usage: qc fonts install|status|remove');
		}
		case 'login': {
			const { session } = await login({ oob: !!flags.oob });
			out(ok(`Signed in as ${who(session.user)} on ${session.base}.`));
			out(`${mark('lock')}Keys sealed (ChaCha20-Poly1305) in ${sessionPath()}.`);
			if ((await new QcClient(session).keyCheck()) === 'mismatch') {
				out("Warning: the browser handed over keys that are not your account's current keys, so messages will not decrypt here. Restore your keys in that browser (Settings > Keys) or approve from the device you chat on, then run qc login again.");
			}
			return;
		}
		case 'logout':
			clearSession();
			return out(ok('Signed out. This terminal no longer holds your keys.'));
		case 'whoami': {
			const session = loadSession();
			if (!session) throw new Error('Not signed in. Run qc login.');
			return flags.json ? json({ user: session.user, base: session.base }) : out(`${who(session.user)} on ${session.base}`);
		}
		case 'profile': {
			const c = await client(flags);
			if (flags.openprofile) return out((await c.openProfile()).trimEnd());
			const fields = {};
			for (const k of ['emoji', 'pronouns', 'website', 'bio']) if (flags[k] !== undefined) fields[k] = flags[k] === true ? '' : String(flags[k]);
			const p = Object.keys(fields).length ? await c.updateProfile(fields) : await c.profile();
			if (flags.json) return json({ username: p.username, emoji: p.emoji ?? null, pronouns: p.pronouns ?? null, website: p.website ?? null, bio: p.bio ?? null });
			out(who(p));
			if (p.website) out(`${mark('link')}${p.website}`);
			if (p.bio) out(p.bio);
			if (!Object.keys(fields).length) out(`\n${info('Set: qc profile --emoji :telescope: --pronouns she/her --website https://you.example  (an empty value clears)')}`);
			return;
		}
		case 'chats':
		case 'ls': {
			const chats = await (await client(flags)).conversations();
			if (flags.json) return json(chats.map((c) => ({ id: c.id, title: c.title, type: c.type, updated_at: c.updated_at, participants: c.participants?.length ?? 0 })));
			for (const c of chats) out(`${c.id}  ${mark(c.type === 'group' ? 'users' : 'chat')}${c.title}`);
			return;
		}
		case 'read': {
			if (!rest[0]) throw new Error('Usage: qc read <chat> [-n 20]');
			const c = await client(flags);
			const chat = findChat(await c.conversations(), rest[0]);
			const { messages } = await c.messages(chat.id, { limit: 100 });
			const last = messages.slice(-Math.max(1, Number(flags.n || flags.limit || 20)));
			if (flags.json) return json(last);
			for (const m of last) {
				if (m.replyTo) out(`    ┃ ${m.replyTo.name ? `${m.replyTo.name}: ` : ''}${m.replyTo.snippet}`);
				const reactions = m.reactions?.length ? `  [${m.reactions.map((r) => `${r.emoji}${r.count > 1 ? r.count : ''}`).join(' ')}]` : '';
				out(`[${stamp(m.at)}] ${m.emoji ? `${m.emoji} ` : ''}${m.mine ? 'you' : m.sender}: ${em(m.text)}${reactions}  (${m.id.slice(0, 8)})`);
			}
			return;
		}
		case 'react': {
			const [chatQuery, messageId, emoji] = rest;
			if (!chatQuery || !messageId || !emoji) throw new Error('Usage: qc react <chat> <message-id> <emoji> [--remove]');
			const c = await client(flags);
			const chat = findChat(await c.conversations(), chatQuery);
			// A message id or its first characters, as qc read prints them.
			const { messages } = await c.messages(chat.id);
			const target = messages.filter((m) => m.id === messageId || m.id.startsWith(messageId));
			if (target.length !== 1) throw new Error(target.length ? `"${messageId}" matches ${target.length} messages` : `No message "${messageId}" in ${chat.title}`);
			await c.react(chat.id, target[0].id, emoji, !!flags.remove);
			return out(ok(`${flags.remove ? 'Removed' : 'Reacted'} ${emoji} on ${chat.title}.`));
		}
		case 'send': {
			if (!rest[0] || rest.length < 2) throw new Error('Usage: qc send <chat> <text>   (text "-" reads stdin)');
			const text = rest[1] === '-' && rest.length === 2 ? (await readStdin()).trim() : rest.slice(1).join(' ');
			if (!text) throw new Error('Nothing to send.');
			const c = await client(flags);
			const chat = findChat(await c.conversations(), rest[0]);
			const { message, skipped } = await c.send(chat.id, text, { replyTo: flags.reply || undefined });
			if (flags.json) return json({ id: message?.id, conversation: chat.id, skipped });
			if (skipped) out(warn(`${skipped} participant(s) have no key yet and will not see it.`));
			return out(`${mark('send')}Sent to ${chat.title}.`);
		}
		case 'listen': {
			const c = await client(flags);
			const chats = await c.conversations();
			const titles = new Map(chats.map((x) => [x.id, x.title]));
			// Loading a chat joins its live room on the server.
			for (const x of chats) await c.messages(x.id, { limit: 1 }).catch(() => {});
			const seen = new Set();
			await c.events(
				async ({ type, data }) => {
					if (type !== 'NEW_MESSAGE' || !data?.message?.conversation_id) return;
					const id = data.message.conversation_id;
					const { messages } = await c.messages(id, { limit: 100 });
					for (const m of messages.slice(-5)) {
						if (seen.has(m.id) || m.id !== data.message.id) continue;
						seen.add(m.id);
						if (!m.mine && (flags.notify || !flags.json)) notify('qrypt.chat', `${m.sender} in ${titles.get(id) ?? 'a chat'}`);
						if (flags.json) out(JSON.stringify({ chat: id, title: titles.get(id), ...m }));
						else out(`[${stamp(m.at)}] ${mark('chat')}${titles.get(id) ?? id} · ${m.emoji ? `${m.emoji} ` : ''}${m.mine ? 'you' : m.sender}: ${em(m.text)}`);
					}
				},
				{ onStatus: (s) => process.stderr.write(`qc: ${s}\n`) },
			);
			return;
		}
		case 'update':
		case 'upgrade': {
			const { update } = await import('./update.js');
			const r = await update({ current: version, check: Boolean(flags.check) });
			return out(r.updated ? ok(r.line) : info(r.line));
		}
		case 'mcp': {
			const { serveMcp } = await import('./mcp.js');
			return serveMcp(await client(flags), { version });
		}
		default:
			throw new Error(`Unknown command "${cmd}".\n\n${HELP}`);
	}
}
