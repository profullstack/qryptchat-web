#!/usr/bin/env node

/**
 * @fileoverview QryptChat headless agent CLI
 * A non-interactive CLI for bots/agents and terminal power users. No TUI.
 *
 * Commands:
 *   register --invite <token> [--username <name>] [--display <name>]
 *   whoami
 *   conversations
 *   send <conversationId> <text...>
 *   listen [--json]
 *
 * Reuses MESSAGE_TYPES + the WS auth handshake from bin/qryptchat-cli.js and
 * the ML-KEM keypair generation from src/lib/crypto/ml-kem.js.
 *
 * Env:
 *   QRYPTCHAT_API_URL          (default http://localhost:5173)
 *   QRYPTCHAT_WS_URL           (default ws://localhost:8080)
 *   NEXT_PUBLIC_SUPABASE_URL   (required for `register`)
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY (required for `register`)
 */

import WebSocket from 'ws';
import { randomUUID } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// --- Configuration ---

const API_URL = process.env.QRYPTCHAT_API_URL || 'http://localhost:5173';
const WS_URL = process.env.QRYPTCHAT_WS_URL || 'ws://localhost:8080';
const CONFIG_DIR = join(homedir(), '.qryptchat');
const AGENT_FILE = join(CONFIG_DIR, 'agent.json');

// --- Message protocol (mirrors src/lib/websocket/utils/protocol.js) ---

const MESSAGE_TYPES = {
	AUTH: 'auth',
	AUTH_SUCCESS: 'auth_success',
	AUTH_ERROR: 'auth_error',
	LOAD_CONVERSATIONS: 'load_conversations',
	CONVERSATIONS_LOADED: 'conversations_loaded',
	JOIN_CONVERSATION: 'join_conversation',
	CONVERSATION_JOINED: 'conversation_joined',
	LEAVE_CONVERSATION: 'leave_conversation',
	SEND_MESSAGE: 'send_message',
	MESSAGE_SENT: 'message_sent',
	MESSAGE_RECEIVED: 'message_received',
	LOAD_MESSAGES: 'load_messages',
	MESSAGES_LOADED: 'messages_loaded',
	TYPING_START: 'typing_start',
	TYPING_STOP: 'typing_stop',
	TYPING_UPDATE: 'typing_update',
	USER_ONLINE: 'user_online',
	USER_OFFLINE: 'user_offline',
	PING: 'ping',
	PONG: 'pong',
	ERROR: 'error'
};

function createMessage(type, payload = {}) {
	return JSON.stringify({
		type,
		payload,
		requestId: randomUUID(),
		timestamp: new Date().toISOString()
	});
}

// --- Identity persistence (~/.qryptchat/agent.json, mode 0600) ---

function saveAgent(agent) {
	if (!existsSync(CONFIG_DIR)) {
		mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
	}
	writeFileSync(AGENT_FILE, JSON.stringify(agent, null, 2), { mode: 0o600 });
}

function loadAgent() {
	try {
		if (existsSync(AGENT_FILE)) {
			return JSON.parse(readFileSync(AGENT_FILE, 'utf-8'));
		}
	} catch {
		// ignore corrupt agent file
	}
	return null;
}

function requireAgent() {
	const agent = loadAgent();
	const token = agent?.session?.access_token;
	if (!agent || !token) {
		fail('Not registered. Run `qryptchat-agent register --invite <token>` first.');
	}
	return agent;
}

// --- Output helpers ---

function printJSON(obj) {
	process.stdout.write(JSON.stringify(obj, null, 2) + '\n');
}

function printNDJSON(obj) {
	process.stdout.write(JSON.stringify(obj) + '\n');
}

function fail(msg, code = 1) {
	process.stderr.write(`${msg}\n`);
	process.exit(code);
}

// --- Arg parsing ---

/**
 * Split argv into positional args + flags.
 * Flags: --key value, or --bool (no value when next token is another flag/absent).
 */
function parseArgs(argv, booleanFlags = []) {
	const positional = [];
	const flags = {};
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg.startsWith('--')) {
			const key = arg.slice(2);
			if (booleanFlags.includes(key)) {
				flags[key] = true;
			} else {
				const next = argv[i + 1];
				if (next === undefined || next.startsWith('--')) {
					flags[key] = true;
				} else {
					flags[key] = next;
					i++;
				}
			}
		} else {
			positional.push(arg);
		}
	}
	return { positional, flags };
}

// --- WebSocket connect + auth ---

/**
 * Connect to the WS server, authenticate with the saved access_token, and
 * resolve once AUTH_SUCCESS is received. Inbound messages are delivered to
 * onMessage. PING is auto-answered with PONG.
 * @param {string} accessToken
 * @param {(msg: object, ws: WebSocket) => void} onMessage
 * @returns {Promise<WebSocket>}
 */
function connectAndAuth(accessToken, onMessage) {
	return new Promise((resolve, reject) => {
		const url = `${WS_URL}?token=${encodeURIComponent(accessToken)}`;
		const ws = new WebSocket(url);
		let authed = false;

		const timeout = setTimeout(() => {
			if (!authed) {
				ws.close();
				reject(new Error('WebSocket connection/auth timeout'));
			}
		}, 10000);

		ws.on('open', () => {
			ws.send(createMessage(MESSAGE_TYPES.AUTH, { token: accessToken }));
		});

		ws.on('message', (data) => {
			let msg;
			try {
				msg = JSON.parse(data.toString());
			} catch {
				return; // ignore malformed
			}

			// Always answer PING with PONG.
			if (msg.type === MESSAGE_TYPES.PING) {
				ws.send(JSON.stringify({
					type: MESSAGE_TYPES.PONG,
					payload: {},
					requestId: msg.requestId,
					timestamp: new Date().toISOString()
				}));
				return;
			}

			if (msg.type === MESSAGE_TYPES.AUTH_SUCCESS) {
				authed = true;
				clearTimeout(timeout);
				resolve(ws);
				return;
			}
			if (msg.type === MESSAGE_TYPES.AUTH_ERROR) {
				clearTimeout(timeout);
				reject(new Error(msg.payload?.error || 'Authentication failed'));
				return;
			}

			if (onMessage) onMessage(msg, ws);
		});

		ws.on('error', (err) => {
			clearTimeout(timeout);
			reject(err);
		});

		ws.on('close', () => {
			if (!authed) {
				clearTimeout(timeout);
				reject(new Error('WebSocket closed before authentication'));
			}
		});
	});
}

// --- Commands ---

async function cmdRegister(argv) {
	const { flags } = parseArgs(argv);
	const inviteToken = flags.invite;
	if (!inviteToken) {
		fail('register requires --invite <token>');
	}

	const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
	const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
	if (!supabaseUrl || !supabaseAnonKey) {
		fail('NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required for register.');
	}

	// 1) Anonymous Supabase auth.
	const { createClient } = await import('@supabase/supabase-js');
	const supabase = createClient(supabaseUrl, supabaseAnonKey, {
		auth: { persistSession: false, autoRefreshToken: false }
	});

	const { data: authData, error: authError } = await supabase.auth.signInAnonymously();
	if (authError) {
		fail(`signInAnonymously failed: ${authError.message}`);
	}
	const session = authData?.session;
	if (!session?.access_token) {
		fail('signInAnonymously returned no session/access_token.');
	}

	// 2) Generate an ML-KEM-1024 keypair locally (reusing the app's module).
	const { MLKEMKeyExchange, MLKEMUtils } = await import('../src/lib/crypto/ml-kem.js');
	const mlkem = new MLKEMKeyExchange('ML_KEM_1024');
	const { publicKey, privateKey } = await mlkem.generateKeyPair();
	const publicKeyB64 = MLKEMUtils.toBase64(publicKey);
	const privateKeyB64 = MLKEMUtils.toBase64(privateKey);

	// 3) POST to /api/auth/register-anon with the anon Bearer token.
	const res = await fetch(`${API_URL}/api/auth/register-anon`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${session.access_token}`
		},
		body: JSON.stringify({
			inviteToken,
			username: flags.username,
			displayName: flags.display,
			publicKey: publicKeyB64
		})
	});

	let body;
	try {
		body = await res.json();
	} catch {
		fail(`register-anon returned non-JSON (HTTP ${res.status}).`);
	}

	if (!res.ok || !body?.success) {
		fail(`Registration failed (HTTP ${res.status}): ${body?.error || 'unknown error'}`);
	}

	const user = body.user;

	// 4) Persist identity (incl. private key) to ~/.qryptchat/agent.json (0600).
	saveAgent({
		session: {
			access_token: session.access_token,
			refresh_token: session.refresh_token,
			expires_at: session.expires_at
		},
		privateKey: privateKeyB64,
		publicKey: publicKeyB64,
		userId: user?.id,
		username: user?.username
	});

	printJSON(user);
}

function cmdWhoami() {
	const agent = loadAgent();
	if (!agent) {
		fail('Not registered. Run `qryptchat-agent register --invite <token>` first.');
	}
	// NEVER print the private key.
	printJSON({
		userId: agent.userId,
		username: agent.username,
		publicKey: agent.publicKey,
		hasSession: Boolean(agent.session?.access_token)
	});
}

async function cmdConversations() {
	const agent = requireAgent();
	const ws = await connectAndAuth(agent.session.access_token, (msg) => {
		if (msg.type === MESSAGE_TYPES.CONVERSATIONS_LOADED) {
			printJSON(msg.payload?.conversations || []);
			ws.close();
			process.exit(0);
		}
		if (msg.type === MESSAGE_TYPES.ERROR) {
			fail(`Server error: ${msg.payload?.error || 'unknown'}`);
		}
	});
	ws.send(createMessage(MESSAGE_TYPES.LOAD_CONVERSATIONS, {}));

	setTimeout(() => fail('Timed out waiting for conversations.'), 15000);
}

async function cmdSend(argv) {
	const { positional } = parseArgs(argv);
	const conversationId = positional[0];
	const text = positional.slice(1).join(' ');
	if (!conversationId || !text) {
		fail('send requires <conversationId> <text...>');
	}

	const agent = requireAgent();
	const ws = await connectAndAuth(agent.session.access_token, (msg) => {
		if (msg.type === MESSAGE_TYPES.MESSAGE_SENT) {
			printJSON(msg.payload || {});
			ws.close();
			process.exit(0);
		}
		if (msg.type === MESSAGE_TYPES.ERROR) {
			fail(`Server error: ${msg.payload?.error || 'unknown'}`);
		}
	});

	ws.send(createMessage(MESSAGE_TYPES.SEND_MESSAGE, {
		conversationId,
		content: text,
		messageType: 'text'
	}));

	setTimeout(() => fail('Timed out waiting for message_sent.'), 15000);
}

async function cmdListen(argv) {
	const { flags } = parseArgs(argv, ['json']);
	const jsonMode = Boolean(flags.json);

	const agent = requireAgent();

	const emit = (obj) => (jsonMode ? printNDJSON(obj) : printJSON(obj));

	const ws = await connectAndAuth(agent.session.access_token, (msg) => {
		// Stream all inbound events (PING/PONG handled in connectAndAuth).
		emit(msg);
	});

	if (!jsonMode) {
		process.stderr.write('Listening for events. Press Ctrl-C to exit.\n');
	}

	const shutdown = () => {
		try { ws.close(); } catch { /* noop */ }
		process.exit(0);
	};
	process.on('SIGINT', shutdown);
	process.on('SIGTERM', shutdown);

	ws.on('close', () => {
		if (!jsonMode) process.stderr.write('Connection closed.\n');
		process.exit(0);
	});
}

// --- Usage ---

const USAGE = `qryptchat-agent — headless agent CLI for qrypt.chat

USAGE
  qryptchat-agent <command> [options]

COMMANDS
  register --invite <token> [--username <name>] [--display <name>]
        signInAnonymously (Supabase) → generate ML-KEM-1024 keypair →
        POST /api/auth/register-anon → persist identity to
        ~/.qryptchat/agent.json (mode 0600). Prints the new user as JSON.

  whoami
        Print the saved identity as JSON (never the private key).

  conversations
        Connect WS, auth, load conversations, print the list as JSON, exit.

  send <conversationId> <text...>
        Connect WS, auth, send a message, print the result JSON, exit.

  listen [--json]
        Connect WS, auth, stream inbound events. With --json, emit one
        compact JSON object per line (NDJSON) to stdout — pipeable for agents.
        Handles PING→PONG. Exits cleanly on SIGINT.

  help, --help, -h
        Show this usage.

ENVIRONMENT
  QRYPTCHAT_API_URL              API base URL   (default http://localhost:5173)
  QRYPTCHAT_WS_URL               WS server URL  (default ws://localhost:8080)
  NEXT_PUBLIC_SUPABASE_URL       Supabase project URL   (required for register)
  NEXT_PUBLIC_SUPABASE_ANON_KEY  Supabase anon key      (required for register)

EXAMPLES
  qryptchat-agent register --invite qci1.xxx.yyy --username mybot
  qryptchat-agent conversations
  qryptchat-agent send 1234-uuid "hello from a bot"
  qryptchat-agent listen --json | jq -c 'select(.type=="message_received")'
`;

// --- Main ---

async function main() {
	const [, , command, ...rest] = process.argv;

	if (!command || command === 'help' || command === '--help' || command === '-h') {
		process.stdout.write(USAGE);
		process.exit(command ? 0 : 1);
	}

	try {
		switch (command) {
			case 'register':
				await cmdRegister(rest);
				break;
			case 'whoami':
				cmdWhoami();
				break;
			case 'conversations':
				await cmdConversations();
				break;
			case 'send':
				await cmdSend(rest);
				break;
			case 'listen':
				await cmdListen(rest);
				break;
			default:
				fail(`Unknown command: ${command}\nRun \`qryptchat-agent --help\` for usage.`);
		}
	} catch (err) {
		fail(`Error: ${err?.message || err}`);
	}
}

main();
