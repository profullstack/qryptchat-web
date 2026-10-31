#!/usr/bin/env node

/**
 * Backwards-compatible headless agent CLI.
 *
 * The former WebSocket service was retired when qrypt.chat moved to REST +
 * server-sent events. Keep the old command name and local identity file, but
 * use the same authenticated, encrypted API as `qc` so existing agents keep
 * working without a dead `/ws` connection.
 */

import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { QcClient } from '../src/cli/api.js';
import { ephemeralKeypair } from '../src/cli/crypto.js';
import { joinAsAgent } from '../src/cli/agent.js';
import { unlockSession } from '../src/cli/config.js';

const API_URL = (process.env.QRYPTCHAT_API_URL || process.env.QC_URL || 'https://qrypt.chat').replace(/\/+$/, '');
const CONFIG_DIR = join(homedir(), '.qryptchat');
const AGENT_FILE = join(CONFIG_DIR, 'agent.json');

function saveAgent(agent) {
	if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
	writeFileSync(AGENT_FILE, JSON.stringify(agent, null, 2), { mode: 0o600 });
}

function loadAgent() {
	try {
		return existsSync(AGENT_FILE) ? JSON.parse(readFileSync(AGENT_FILE, 'utf8')) : null;
	} catch {
		return null;
	}
}

function parseArgs(argv) {
	const positional = [];
	const flags = {};
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (!arg.startsWith('--')) {
			positional.push(arg);
			continue;
		}
		const key = arg.slice(2);
		const next = argv[i + 1];
		if (next === undefined || next.startsWith('--')) flags[key] = true;
		else {
			flags[key] = next;
			i++;
		}
	}
	return { positional, flags };
}

function usernameFor(name) {
	const stem = String(name || 'agent')
		.toLowerCase()
		.replace(/[^a-z0-9_]+/g, '_')
		.replace(/^_+|_+$/g, '')
		.slice(0, 20) || 'agent';
	return `${stem.length >= 3 ? stem : `${stem}_agent`}_${randomBytes(3).toString('hex')}`.slice(0, 30);
}

function inviteToken(input) {
	const text = String(input || '').trim();
	if (!text) throw new Error('Provide the agent invite URL or token.');
	if (!/^https?:\/\//i.test(text)) return text;
	const url = new URL(text);
	return url.hash.replace(/^#/, '') || url.searchParams.get('token') || '';
}

function toQcSession(agent) {
	const keys1024 = agent.keys?.keys1024 || {
		publicKey: agent.publicKey,
		privateKey: agent.privateKey,
	};
	const user = agent.user || {
		id: agent.userId,
		username: agent.username,
		display_name: agent.displayName || agent.username,
	};
	if (!agent.session?.access_token || !user.id || !keys1024.publicKey || !keys1024.privateKey) {
		throw new Error('Agent identity is incomplete. Run `qryptchat-agent join <agent invite>` to make a current agent identity.');
	}
	return {
		base: API_URL,
		...agent.session,
		user,
		keys: { ...(agent.keys || {}), keys1024 },
	};
}

async function createAgentClient() {
	const env = { ...process.env, QC_URL: API_URL };
	const unlocked = await unlockSession(env);
	if (unlocked?.session) {
		return new QcClient(unlocked.session, { env, save: unlocked.save });
	}

	const agent = agentOrFail();
	const session = toQcSession(agent);
	const client = new QcClient(session, {
		env,
		save: (next) => {
			agent.session = {
				access_token: next.access_token,
				refresh_token: next.refresh_token,
				expires_at: next.expires_at,
			};
			agent.user = next.user;
			agent.userId = next.user?.id || agent.userId;
			agent.username = next.user?.username || agent.username;
			saveAgent(agent);
		},
	});

	// Older agent registrations use Supabase refresh tokens instead of qc's
	// PKCE token. Keep those existing identities alive while they migrate.
	const refreshQcSession = client.refresh.bind(client);
	client.refresh = async () => {
		try {
			return await refreshQcSession();
		} catch (qcError) {
			const supabaseUrl = agent.supabase?.url || process.env.NEXT_PUBLIC_SUPABASE_URL;
			const anonKey = agent.supabase?.anonKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
			if (!supabaseUrl || !anonKey || !client.session.refresh_token) throw qcError;
			const response = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/auth/v1/token?grant_type=refresh_token`, {
				method: 'POST',
				headers: { apikey: anonKey, 'Content-Type': 'application/json' },
				body: JSON.stringify({ refresh_token: client.session.refresh_token }),
			});
			const body = await response.json().catch(() => ({}));
			if (!response.ok || !body.access_token) throw qcError;
			client.session = {
				...client.session,
				access_token: body.access_token,
				refresh_token: body.refresh_token || client.session.refresh_token,
				expires_at: body.expires_at || Math.floor(Date.now() / 1000) + (body.expires_in || 3600),
			};
			client.save(client.session);
		};
	};
	return client;
}

function agentOrFail() {
	const agent = loadAgent();
	if (!agent) throw new Error('Not registered. Run `qryptchat-agent join <agent invite>` first.');
	return agent;
}

function printJSON(value) {
	process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function fail(message, code = 1) {
	process.stderr.write(`${message}\n`);
	process.exitCode = code;
}

async function cmdRegister(argv) {
	const { flags } = parseArgs(argv);
	const token = flags.invite;
	if (!token) throw new Error('register requires --invite <anonymous invite token>. For agent identities use `join <agent invite>`.');
	const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
	const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
	if (!supabaseUrl || !anonKey) throw new Error('NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required for legacy register.');

	const { createClient } = await import('@supabase/supabase-js');
	const supabase = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
	const { data, error } = await supabase.auth.signInAnonymously();
	if (error || !data?.session?.access_token) throw new Error(`Anonymous sign-in failed: ${error?.message || 'no session returned'}`);

	const keys1024 = await ephemeralKeypair();
	const response = await fetch(`${API_URL}/api/auth/register-anon`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` },
		body: JSON.stringify({
			inviteToken: token,
			username: flags.username || usernameFor(flags.display || 'agent'),
			displayName: flags.display || flags.name,
			publicKey: keys1024.publicKey,
		}),
	});
	const body = await response.json().catch(() => ({}));
	if (!response.ok || !body.user) throw new Error(body.error || `Registration failed (HTTP ${response.status})`);
	const agent = {
		session: {
			access_token: data.session.access_token,
			refresh_token: data.session.refresh_token,
			expires_at: data.session.expires_at,
		},
		keys: { keys1024 },
		publicKey: keys1024.publicKey,
		privateKey: keys1024.privateKey,
		user: body.user,
		userId: body.user.id,
		username: body.user.username,
		supabase: { url: supabaseUrl, anonKey },
	};
	saveAgent(agent);
	printJSON(body.user);
}

async function cmdJoin(argv) {
	const { positional, flags } = parseArgs(argv);
	const input = flags.invite || positional[0];
	const token = inviteToken(input);
	const inviteUrl = /^https?:\/\//i.test(String(input || '')) ? input : `${API_URL}/agents/join#${encodeURIComponent(token)}`;
	const result = await joinAsAgent(inviteUrl, {
		name: flags.name,
		username: flags.username || usernameFor(flags.name),
		env: process.env,
	});
	printJSON({ user: result.session.user, operator: result.operator, conversation_id: result.conversationId, savedIn: 'qc secure session vault' });
}

async function cmdWhoami() {
	const client = await createAgentClient();
	printJSON({ userId: client.me?.id, username: client.me?.username, display_name: client.me?.display_name, hasSession: Boolean(client.session?.access_token) });
}

async function cmdConversations() {
	const client = await createAgentClient();
	printJSON(await client.conversations());
}

async function cmdSend(argv) {
	const { positional } = parseArgs(argv);
	const conversationId = positional[0];
	const text = positional.slice(1).join(' ');
	if (!conversationId || !text) throw new Error('send requires <conversationId> <text...>');
	const client = await createAgentClient();
	const result = await client.send(conversationId, text);
	printJSON({ success: true, conversationId, messageId: result.message?.id, skipped: result.skipped || 0 });
}

async function cmdListen(argv) {
	const { flags } = parseArgs(argv);
	const jsonMode = Boolean(flags.json);
	const client = await createAgentClient();
	const chats = await client.conversations();
	const titles = new Map(chats.map((chat) => [chat.id, chat.title]));
	for (const chat of chats) await client.messages(chat.id, { limit: 1 }).catch(() => {});
	const seen = new Set();
	const abort = new AbortController();
	const emit = (event) => process.stdout.write(`${JSON.stringify(event)}\n`);
	const shutdown = () => abort.abort();
	process.once('SIGINT', shutdown);
	process.once('SIGTERM', shutdown);
	if (!jsonMode) process.stderr.write('Listening to qrypt.chat over SSE. Press Ctrl-C to exit.\n');
	try {
		await client.events(async ({ type, data }) => {
			if (type !== 'NEW_MESSAGE' || !data?.message?.conversation_id) {
				if (jsonMode && type !== 'CONNECTED') emit({ type, payload: data });
				return;
			}
			const conversationId = data.message.conversation_id;
			const { messages } = await client.messages(conversationId, { limit: 100 });
			const message = messages.find((item) => item.id === data.message.id);
			if (!message || seen.has(message.id)) return;
			seen.add(message.id);
			const event = {
				type: 'message_received',
				payload: {
					id: message.id,
					conversation_id: conversationId,
					conversation_title: titles.get(conversationId) || conversationId,
					sender: message.sender,
					sender_id: message.senderId,
					mine: message.mine,
					content: message.text,
					created_at: message.at,
				},
			};
			if (jsonMode) emit(event);
			else process.stdout.write(`[${event.payload.conversation_title}] ${event.payload.sender}: ${event.payload.content}\n`);
		}, { signal: abort.signal, onStatus: (status) => { if (!jsonMode) process.stderr.write(`qryptchat-agent: ${status}\n`); } });
	} finally {
		process.removeListener('SIGINT', shutdown);
		process.removeListener('SIGTERM', shutdown);
	}
}

const USAGE = `qryptchat-agent — headless qrypt.chat agent CLI (REST + SSE)

COMMANDS
  join <agent invite> [--name NAME] [--username NAME]
  register --invite <anonymous invite> [--username NAME] [--display NAME]  (legacy)
  whoami
  conversations
  send <conversationId> <text...>
  listen [--json]
  help

ENVIRONMENT
  QRYPTCHAT_API_URL   API base URL (default https://qrypt.chat)
  QC_URL              Alias for QRYPTCHAT_API_URL
  NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are only needed by legacy register.
`;

async function main() {
	const [, , command, ...argv] = process.argv;
	try {
		switch (command) {
			case 'help':
			case '--help':
			case '-h':
			case undefined:
				process.stdout.write(USAGE);
				break;
			case 'register': await cmdRegister(argv); break;
			case 'join': await cmdJoin(argv); break;
			case 'whoami': await cmdWhoami(); break;
			case 'conversations': await cmdConversations(); break;
			case 'send': await cmdSend(argv); break;
			case 'listen': await cmdListen(argv); break;
			default: throw new Error(`Unknown command: ${command}\n\n${USAGE}`);
		}
	} catch (error) {
		fail(error?.message || String(error));
	}
}

await main();
