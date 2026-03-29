#!/usr/bin/env node

/**
 * @fileoverview QryptChat CLI/TUI interface
 * Terminal UI for QryptChat that connects to the same WebSocket server as the web app.
 * Supports login with phone+PIN, listing conversations, sending/receiving messages,
 * and unread indicators.
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const blessed = require('blessed');

import WebSocket from 'ws';
import { randomUUID } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import readline from 'readline';

// --- Configuration ---

const DEFAULT_API_URL = process.env.QRYPTCHAT_API_URL || 'http://localhost:5173';
const DEFAULT_WS_URL = process.env.QRYPTCHAT_WS_URL || 'ws://localhost:8080';
const CONFIG_DIR = join(homedir(), '.qryptchat');
const SESSION_FILE = join(CONFIG_DIR, 'session.json');

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

// --- Session persistence ---

function saveSession(session) {
	if (!existsSync(CONFIG_DIR)) {
		mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
	}
	writeFileSync(SESSION_FILE, JSON.stringify(session, null, 2), { mode: 0o600 });
}

function loadSession() {
	try {
		if (existsSync(SESSION_FILE)) {
			return JSON.parse(readFileSync(SESSION_FILE, 'utf-8'));
		}
	} catch {
		// ignore corrupt session
	}
	return null;
}

// --- HTTP helpers ---

async function apiPost(path, body, token = null) {
	const headers = { 'Content-Type': 'application/json' };
	if (token) headers['Authorization'] = `Bearer ${token}`;

	const res = await fetch(`${DEFAULT_API_URL}${path}`, {
		method: 'POST',
		headers,
		body: JSON.stringify(body)
	});
	return res.json();
}

// --- Plain-text login (before TUI starts) ---

function promptLine(query) {
	const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
	return new Promise(resolve => rl.question(query, ans => { rl.close(); resolve(ans.trim()); }));
}

async function loginFlow() {
	// Check for saved session
	const saved = loadSession();
	if (saved?.access_token && saved?.user) {
		console.log(`Resuming session as ${saved.user.username || saved.user.phoneNumber}...`);
		return saved;
	}

	console.log('\n  QryptChat CLI Login\n');

	const phoneNumber = await promptLine('  Phone number (E.164, e.g. +12025551234): ');
	if (!/^\+[1-9]\d{1,14}$/.test(phoneNumber)) {
		console.error('  Invalid phone number format.');
		process.exit(1);
	}

	console.log('  Sending verification code...');
	const sendResult = await apiPost('/api/auth/send-sms', { phoneNumber });
	if (!sendResult.success) {
		console.error(`  Failed: ${sendResult.error}`);
		process.exit(1);
	}
	console.log('  Verification code sent!');

	const verificationCode = await promptLine('  Enter 6-digit code: ');

	console.log('  Verifying...');
	let verifyResult = await apiPost('/api/auth/verify-sms', { phoneNumber, verificationCode });

	if (verifyResult.requiresUsername) {
		const username = await promptLine('  Choose a username: ');
		const token = verifyResult.session?.access_token;
		verifyResult = await apiPost('/api/auth/verify-sms', {
			phoneNumber,
			username,
			useSession: true
		}, token);
	}

	if (!verifyResult.success) {
		console.error(`  Verification failed: ${verifyResult.error}`);
		process.exit(1);
	}

	const session = {
		access_token: verifyResult.session?.access_token,
		user: verifyResult.user
	};
	saveSession(session);
	console.log(`  Logged in as ${session.user.username}!`);
	return session;
}

// --- TUI Application ---

class QryptChatTUI {
	constructor(session) {
		this.session = session;
		this.ws = null;
		this.conversations = [];
		this.currentConversation = null;
		this.messages = [];
		this.unreadCounts = new Map(); // conversationId -> count
		this.pendingCallbacks = new Map(); // requestId -> callback

		this.screen = null;
		this.conversationList = null;
		this.messageBox = null;
		this.inputBox = null;
		this.statusBar = null;
	}

	// --- WebSocket ---

	connectWebSocket() {
		return new Promise((resolve, reject) => {
			const url = `${DEFAULT_WS_URL}?token=${encodeURIComponent(this.session.access_token)}`;
			this.ws = new WebSocket(url);

			this.ws.on('open', () => {
				this.send(MESSAGE_TYPES.AUTH, { token: this.session.access_token });
			});

			this.ws.on('message', (data) => {
				try {
					const msg = JSON.parse(data.toString());
					this.handleMessage(msg);
					if (msg.type === MESSAGE_TYPES.AUTH_SUCCESS) resolve();
					if (msg.type === MESSAGE_TYPES.AUTH_ERROR) reject(new Error(msg.payload?.error || 'Auth failed'));
				} catch {
					// ignore malformed messages
				}
			});

			this.ws.on('close', () => {
				this.setStatus('{red-fg}Disconnected{/red-fg} — press q to quit');
			});

			this.ws.on('error', (err) => {
				reject(err);
			});

			// Timeout after 10s
			setTimeout(() => reject(new Error('WebSocket connection timeout')), 10000);
		});
	}

	send(type, payload = {}) {
		if (this.ws?.readyState === WebSocket.OPEN) {
			this.ws.send(createMessage(type, payload));
		}
	}

	handleMessage(msg) {
		switch (msg.type) {
			case MESSAGE_TYPES.CONVERSATIONS_LOADED:
				this.onConversationsLoaded(msg.payload);
				break;
			case MESSAGE_TYPES.MESSAGES_LOADED:
				this.onMessagesLoaded(msg.payload);
				break;
			case MESSAGE_TYPES.MESSAGE_RECEIVED:
				this.onMessageReceived(msg.payload);
				break;
			case MESSAGE_TYPES.MESSAGE_SENT:
				this.onMessageSent(msg.payload);
				break;
			case MESSAGE_TYPES.CONVERSATION_JOINED:
				this.setStatus(`Joined conversation`);
				break;
			case MESSAGE_TYPES.PING:
				this.ws.send(JSON.stringify({
					type: MESSAGE_TYPES.PONG,
					payload: {},
					requestId: msg.requestId,
					timestamp: new Date().toISOString()
				}));
				break;
			case MESSAGE_TYPES.ERROR:
				this.setStatus(`{red-fg}Error: ${msg.payload?.error || 'Unknown'}{/red-fg}`);
				break;
		}
	}

	// --- Conversation list ---

	onConversationsLoaded(payload) {
		this.conversations = payload.conversations || [];
		this.renderConversationList();
		this.setStatus(`${this.conversations.length} conversation(s) loaded`);
	}

	renderConversationList() {
		if (!this.conversationList) return;
		const items = this.conversations.map(c => {
			const name = c.name || c.participants?.map(p => p.display_name || p.username).join(', ') || 'Unnamed';
			const unread = this.unreadCounts.get(c.id) || 0;
			const indicator = unread > 0 ? ` {red-fg}(${unread}){/red-fg}` : '';
			return `${name}${indicator}`;
		});
		this.conversationList.setItems(items.length ? items : ['  No conversations']);
		this.screen.render();
	}

	// --- Messages ---

	onMessagesLoaded(payload) {
		this.messages = (payload.messages || []).reverse(); // oldest first
		this.renderMessages();
	}

	onMessageReceived(payload) {
		const message = payload.message || payload;
		if (this.currentConversation && message.conversation_id === this.currentConversation.id) {
			this.messages.push(message);
			this.renderMessages();
		} else {
			// Unread for a different conversation
			const cid = message.conversation_id;
			this.unreadCounts.set(cid, (this.unreadCounts.get(cid) || 0) + 1);
			this.renderConversationList();
		}
	}

	onMessageSent(payload) {
		// The server will broadcast MESSAGE_RECEIVED to us, so no need to duplicate
		this.setStatus('Message sent');
	}

	renderMessages() {
		if (!this.messageBox) return;
		const lines = this.messages.map(m => {
			const sender = m.sender?.display_name || m.sender?.username || 'Unknown';
			const time = m.created_at ? new Date(m.created_at).toLocaleTimeString() : '';
			// Messages are encrypted, show what we can (content may be base64/encrypted)
			let content = m.content || m.encrypted_content || '[encrypted]';
			// Try to decode if it looks like base64 JSON
			if (typeof content === 'string' && content !== '[encrypted]') {
				try {
					const decoded = JSON.parse(Buffer.from(content, 'base64').toString());
					content = decoded.text || decoded.content || content;
				} catch {
					// keep original
				}
			}
			return `{bold}${sender}{/bold} {gray-fg}${time}{/gray-fg}\n  ${content}`;
		});
		this.messageBox.setContent(lines.join('\n') || '  No messages yet');
		this.messageBox.setScrollPerc(100);
		this.screen.render();
	}

	// --- TUI setup ---

	buildUI() {
		this.screen = blessed.screen({
			smartCSR: true,
			title: 'QryptChat',
			tags: true
		});

		// Status bar at top
		this.statusBar = blessed.box({
			parent: this.screen,
			top: 0,
			left: 0,
			width: '100%',
			height: 1,
			tags: true,
			style: { bg: 'blue', fg: 'white' },
			content: ` QryptChat — ${this.session.user.username || this.session.user.phoneNumber}`
		});

		// Conversation list (left panel)
		this.conversationList = blessed.list({
			parent: this.screen,
			label: ' Conversations ',
			top: 1,
			left: 0,
			width: '30%',
			height: '100%-2',
			border: { type: 'line' },
			tags: true,
			keys: true,
			vi: true,
			mouse: true,
			scrollable: true,
			style: {
				border: { fg: 'cyan' },
				selected: { bg: 'cyan', fg: 'black' },
				item: { fg: 'white' }
			}
		});

		// Messages panel (right)
		this.messageBox = blessed.box({
			parent: this.screen,
			label: ' Messages ',
			top: 1,
			left: '30%',
			width: '70%',
			height: '100%-4',
			border: { type: 'line' },
			tags: true,
			scrollable: true,
			alwaysScroll: true,
			keys: true,
			vi: true,
			mouse: true,
			style: {
				border: { fg: 'green' },
				fg: 'white'
			}
		});

		// Input box (bottom right)
		this.inputBox = blessed.textbox({
			parent: this.screen,
			label: ' Type message (Enter to send) ',
			bottom: 0,
			left: '30%',
			width: '70%',
			height: 3,
			border: { type: 'line' },
			tags: true,
			keys: true,
			mouse: true,
			inputOnFocus: true,
			style: {
				border: { fg: 'yellow' },
				fg: 'white'
			}
		});

		// Key bindings
		this.screen.key(['q', 'C-c'], () => {
			this.cleanup();
			process.exit(0);
		});

		this.screen.key(['tab'], () => {
			if (this.screen.focused === this.conversationList) {
				this.inputBox.focus();
			} else {
				this.conversationList.focus();
			}
			this.screen.render();
		});

		// Select conversation
		this.conversationList.on('select', (item, index) => {
			if (index >= 0 && index < this.conversations.length) {
				this.selectConversation(this.conversations[index]);
			}
		});

		// Send message on submit
		this.inputBox.on('submit', (value) => {
			if (value && value.trim() && this.currentConversation) {
				this.sendChatMessage(value.trim());
			}
			this.inputBox.clearValue();
			this.inputBox.focus();
			this.screen.render();
		});

		// Cancel returns focus to list
		this.inputBox.on('cancel', () => {
			this.conversationList.focus();
			this.screen.render();
		});

		this.conversationList.focus();
		this.screen.render();
	}

	selectConversation(conversation) {
		// Leave previous conversation
		if (this.currentConversation) {
			this.send(MESSAGE_TYPES.LEAVE_CONVERSATION, {
				conversationId: this.currentConversation.id
			});
		}

		this.currentConversation = conversation;
		this.messages = [];
		this.unreadCounts.delete(conversation.id);
		this.renderConversationList();

		const name = conversation.name || 'Conversation';
		this.messageBox.setLabel(` ${name} `);
		this.messageBox.setContent('  Loading messages...');
		this.screen.render();

		// Join and load messages
		this.send(MESSAGE_TYPES.JOIN_CONVERSATION, {
			conversationId: conversation.id
		});
		this.send(MESSAGE_TYPES.LOAD_MESSAGES, {
			conversationId: conversation.id,
			limit: 50
		});
	}

	sendChatMessage(text) {
		if (!this.currentConversation) return;

		// For the CLI, we send plaintext — the server-side handles storage.
		// Note: Full E2E encryption would require the crypto libraries from the web app.
		// This CLI sends a simplified message format.
		this.send(MESSAGE_TYPES.SEND_MESSAGE, {
			conversationId: this.currentConversation.id,
			content: text,
			messageType: 'text'
		});
	}

	setStatus(text) {
		if (this.statusBar) {
			this.statusBar.setContent(` QryptChat — ${this.session.user.username || ''} | ${text}`);
			this.screen.render();
		}
	}

	cleanup() {
		if (this.ws) {
			this.ws.close();
		}
		if (this.screen) {
			this.screen.destroy();
		}
	}

	async run() {
		this.buildUI();
		this.setStatus('Connecting...');

		try {
			await this.connectWebSocket();
			this.setStatus('Connected');
			this.send(MESSAGE_TYPES.LOAD_CONVERSATIONS, {});
		} catch (err) {
			this.setStatus(`{red-fg}Connection failed: ${err.message}{/red-fg}`);
		}
	}
}

// --- Main ---

async function main() {
	try {
		const session = await loginFlow();
		const tui = new QryptChatTUI(session);
		await tui.run();
	} catch (err) {
		console.error(`Fatal error: ${err.message}`);
		process.exit(1);
	}
}

main();
