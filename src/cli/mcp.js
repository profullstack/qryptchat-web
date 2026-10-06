/**
 * `qc mcp`: qrypt.chat as an MCP server over stdio (JSON-RPC 2.0, one message
 * per line). Encryption and decryption happen here, on the machine that holds
 * the keys; the server only ever sees ciphertext.
 */
import { createInterface } from 'node:readline';
import { findChat } from './commands.js';

const TOOLS = [
	{
		name: 'list_chats',
		description: 'List your qrypt.chat conversations (id, title, participant count), most recent first.',
		inputSchema: { type: 'object', properties: {}, additionalProperties: false },
	},
	{
		name: 'read_chat',
		description: 'Read the latest decrypted messages of a conversation.',
		inputSchema: {
			type: 'object',
			properties: {
				chat: { type: 'string', description: 'Conversation id or part of its name' },
				limit: { type: 'number', description: 'How many of the latest messages (default 20, max 100)' },
			},
			required: ['chat'],
			additionalProperties: false,
		},
	},
	{
		name: 'send_message',
		description: 'Send an end-to-end encrypted message (ML-KEM-1024) to a conversation.',
		inputSchema: {
			type: 'object',
			properties: {
				chat: { type: 'string', description: 'Conversation id or part of its name' },
				text: { type: 'string', description: 'The message' },
				reply_to: { type: 'string', description: 'Optional: id of the message this replies to (from read_chat)' },
			},
			required: ['chat', 'text'],
			additionalProperties: false,
		},
	},
	{
		name: 'react_to_message',
		description: 'React to a message with an emoji (Signal-style: one reaction per person; a new one replaces yours). End-to-end encrypted.',
		inputSchema: {
			type: 'object',
			properties: {
				chat: { type: 'string', description: 'Conversation id or part of its name' },
				message_id: { type: 'string', description: 'The message id, from read_chat' },
				emoji: { type: 'string', description: 'The emoji, e.g. ❤️' },
				remove: { type: 'boolean', description: 'Withdraw this reaction instead' },
			},
			required: ['chat', 'message_id', 'emoji'],
			additionalProperties: false,
		},
	},
];

export async function callTool(client, name, args = {}) {
	if (name === 'list_chats') {
		const chats = await client.conversations();
		return chats.map((c) => ({ id: c.id, title: c.title, participants: c.participants?.length ?? 0, updated_at: c.updated_at }));
	}
	if (name === 'read_chat') {
		const chat = findChat(await client.conversations(), args.chat);
		const { messages } = await client.messages(chat.id, { limit: 100 });
		const limit = Math.min(100, Math.max(1, Number(args.limit) || 20));
		return {
			chat: { id: chat.id, title: chat.title },
			messages: messages.slice(-limit).map(({ id, sender, mine, text, at, reactions, replyTo }) => ({
				id,
				from: mine ? 'me' : sender,
				text,
				at,
				...(reactions?.length ? { reactions: reactions.map(({ emoji, count, mine: m }) => ({ emoji, count, mine: m })) } : {}),
				...(replyTo ? { reply_to: { id: replyTo.id, from: replyTo.name, text: replyTo.snippet } } : {}),
			})),
		};
	}
	if (name === 'send_message') {
		if (!args.text || typeof args.text !== 'string') throw new Error('text is required');
		const chat = findChat(await client.conversations(), args.chat);
		const { message, skipped } = await client.send(chat.id, args.text, { replyTo: typeof args.reply_to === 'string' ? args.reply_to : undefined });
		return { sent: true, id: message?.id, chat: chat.title, skipped };
	}
	if (name === 'react_to_message') {
		if (!args.emoji || typeof args.emoji !== 'string') throw new Error('emoji is required');
		const chat = findChat(await client.conversations(), args.chat);
		await client.react(chat.id, String(args.message_id), args.emoji, !!args.remove);
		return { reacted: !args.remove, emoji: args.emoji, chat: chat.title };
	}
	throw new Error(`Unknown tool ${name}`);
}

export async function handle(client, msg, { version }) {
	const { id, method, params } = msg;
	switch (method) {
		case 'initialize':
			return {
				protocolVersion: params?.protocolVersion ?? '2025-06-18',
				capabilities: { tools: {} },
				serverInfo: { name: 'qc', title: 'qrypt.chat', version },
			};
		case 'ping':
			return {};
		case 'tools/list':
			return { tools: TOOLS };
		case 'tools/call':
			try {
				const result = await callTool(client, params?.name, params?.arguments);
				return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }], structuredContent: result };
			} catch (err) {
				return { content: [{ type: 'text', text: err.message }], isError: true };
			}
		default:
			if (id === undefined) return undefined; // a notification
			throw Object.assign(new Error(`Method not found: ${method}`), { code: -32601 });
	}
}

export function serveMcp(client, { version = '0.0.0', input = process.stdin, output = process.stdout } = {}) {
	// stdout is the protocol; nothing else may write there.
	for (const m of ['log', 'info', 'debug']) console[m] = (...a) => process.stderr.write(`${a.join(' ')}\n`);
	const write = (obj) => output.write(`${JSON.stringify(obj)}\n`);
	const rl = createInterface({ input });
	rl.on('line', async (line) => {
		if (!line.trim()) return;
		let msg;
		try {
			msg = JSON.parse(line);
		} catch {
			write({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
			return;
		}
		try {
			const result = await handle(client, msg, { version });
			if (msg.id !== undefined && result !== undefined) write({ jsonrpc: '2.0', id: msg.id, result });
		} catch (err) {
			if (msg.id !== undefined) write({ jsonrpc: '2.0', id: msg.id, error: { code: err.code ?? -32603, message: err.message } });
		}
	});
	return new Promise((resolve) => rl.on('close', resolve));
}
