/**
 * @fileoverview WebSocket server for QryptChat
 * Main WebSocket server that handles all chat operations through WebSocket connections
 */

import { WebSocketServer } from 'ws';
import { 
	MESSAGE_TYPES, 
	parseMessage, 
	serializeMessage, 
	createErrorResponse,
	createPongMessage
} from './utils/protocol.js';
import { roomManager } from './utils/rooms.js';
import { authenticateWebSocket } from './middleware/auth.js';
import { handleAuth, handleDisconnect } from './handlers/auth.js';
import { 
	handleLoadConversations, 
	handleJoinConversation, 
	handleLeaveConversation,
	handleCreateConversation 
} from './handlers/conversations.js';
import { 
	handleSendMessage, 
	handleLoadMessages, 
	handleLoadMoreMessages 
} from './handlers/messages.js';
import { 
	handleTypingStart, 
	handleTypingStop,
	cleanupTypingIndicators 
} from './handlers/typing.js';

/**
 * WebSocket server class
 */
export class ChatWebSocketServer {
	constructor(options = {}) {
		this.port = options.port || 8080;
		this.server = null;
		this.connections = new Map(); // WebSocket -> context mapping
		this.heartbeatInterval = null;
	}

	/**
	 * Start the WebSocket server
	 */
	start() {
		this.server = new WebSocketServer({ 
			port: this.port,
			perMessageDeflate: false
		});

		console.log(`WebSocket server starting on port ${this.port}`);

		this.server.on('connection', (ws, request) => {
			this.handleConnection(ws, request);
		});

		this.server.on('error', (error) => {
			console.error('WebSocket server error:', error);
		});

		// Start heartbeat interval
		this.startHeartbeat();

		console.log(`WebSocket server started on port ${this.port}`);
	}

	/**
	 * Stop the WebSocket server
	 */
	stop() {
		if (this.heartbeatInterval) {
			clearInterval(this.heartbeatInterval);
			this.heartbeatInterval = null;
		}

		if (this.server) {
			this.server.close();
			this.server = null;
		}

		console.log('WebSocket server stopped');
	}

	/**
	 * Handle new WebSocket connection
	 * @param {WebSocket} ws - WebSocket connection
	 * @param {Object} request - HTTP upgrade request
	 */
	async handleConnection(ws, request) {
		console.log('New WebSocket connection');

		// Create connection context
		const context = {
			authenticated: false,
			user: null,
			supabase: null,
			lastPing: Date.now()
		};

		this.connections.set(ws, context);

		// Set up message handler
		ws.on('message', (data) => {
			this.handleMessage(ws, data, context);
		});

		// Set up close handler
		ws.on('close', () => {
			this.handleClose(ws, context);
		});

		// Set up error handler
		ws.on('error', (error) => {
			console.error('WebSocket connection error:', error);
			this.handleClose(ws, context);
		});

		// Set up ping/pong for connection health
		ws.on('pong', () => {
			context.lastPing = Date.now();
		});

		// Try to authenticate from request headers/query params
		try {
			const authResult = await authenticateWebSocket(request);
			if (authResult.success) {
				context.authenticated = true;
				context.user = authResult.user;
				// Note: We'll set up supabase client when needed in handlers
				roomManager.addUserConnection(ws, authResult.user.id);
				console.log(`WebSocket authenticated for user: ${authResult.user.id}`);
			}
		} catch (error) {
			console.error('WebSocket authentication error:', error);
		}
	}

	/**
	 * Handle incoming WebSocket message
	 * @param {WebSocket} ws - WebSocket connection
	 * @param {Buffer} data - Raw message data
	 * @param {Object} context - Connection context
	 */
	async handleMessage(ws, data, context) {
		try {
			const message = parseMessage(data.toString());
			if (!message) {
				const errorResponse = createErrorResponse(
					null,
					'Invalid message format',
					'INVALID_MESSAGE'
				);
				ws.send(serializeMessage(errorResponse));
				return;
			}

			console.log(`Received message: ${message.type}`);

			// Handle different message types
			switch (message.type) {
				case MESSAGE_TYPES.AUTH:
					await handleAuth(ws, message, context);
					break;

				case MESSAGE_TYPES.LOAD_CONVERSATIONS:
					await handleLoadConversations(ws, message, context);
					break;

				case MESSAGE_TYPES.JOIN_CONVERSATION:
					await handleJoinConversation(ws, message, context);
					break;

				case MESSAGE_TYPES.LEAVE_CONVERSATION:
					await handleLeaveConversation(ws, message, context);
					break;

				case MESSAGE_TYPES.CREATE_CONVERSATION:
					await handleCreateConversation(ws, message, context);
					break;

				case MESSAGE_TYPES.SEND_MESSAGE:
					await handleSendMessage(ws, message, context);
					break;

				case MESSAGE_TYPES.LOAD_MESSAGES:
					await handleLoadMessages(ws, message, context);
					break;

				case MESSAGE_TYPES.LOAD_MORE_MESSAGES:
					await handleLoadMoreMessages(ws, message, context);
					break;

				case MESSAGE_TYPES.TYPING_START:
					await handleTypingStart(ws, message, context);
					break;

				case MESSAGE_TYPES.TYPING_STOP:
					await handleTypingStop(ws, message, context);
					break;

				case MESSAGE_TYPES.PING:
					const pongResponse = createPongMessage(message.requestId);
					ws.send(serializeMessage(pongResponse));
					context.lastPing = Date.now();
					break;

				default:
					const errorResponse = createErrorResponse(
						message.requestId,
						`Unknown message type: ${message.type}`,
						'UNKNOWN_MESSAGE_TYPE'
					);
					ws.send(serializeMessage(errorResponse));
					break;
			}

		} catch (error) {
			console.error('Error handling WebSocket message:', error);
			const errorResponse = createErrorResponse(
				null,
				'Internal server error',
				'SERVER_ERROR'
			);
			ws.send(serializeMessage(errorResponse));
		}
	}

	/**
	 * Handle WebSocket connection close
	 * @param {WebSocket} ws - WebSocket connection
	 * @param {Object} context - Connection context
	 */
	async handleClose(ws, context) {
		console.log('WebSocket connection closed');

		try {
			// Handle disconnection cleanup
			await handleDisconnect(ws, context);

			// Clean up typing indicators
			if (context.user && context.supabase) {
				await cleanupTypingIndicators(context.user.id, context.supabase);
			}

			// Remove from connections
			this.connections.delete(ws);

		} catch (error) {
			console.error('Error handling WebSocket close:', error);
		}
	}

	/**
	 * Start heartbeat to detect dead connections
	 */
	startHeartbeat() {
		this.heartbeatInterval = setInterval(() => {
			const now = Date.now();
			const timeout = 60000; // 60 seconds

			for (const [ws, context] of this.connections.entries()) {
				if (now - context.lastPing > timeout) {
					console.log('Terminating dead WebSocket connection');
					ws.terminate();
					this.connections.delete(ws);
				} else {
					// Send ping
					ws.ping();
				}
			}

			// Clean up room manager
			roomManager.cleanup();

		}, 30000); // Check every 30 seconds
	}

	/**
	 * Get server statistics
	 * @returns {Object} Server statistics
	 */
	getStats() {
		return {
			totalConnections: this.connections.size,
			authenticatedConnections: Array.from(this.connections.values())
				.filter(ctx => ctx.authenticated).length,
			roomStats: roomManager.getStats()
		};
	}

	/**
	 * Broadcast message to all connected clients
	 * @param {Object} message - Message to broadcast
	 */
	broadcast(message) {
		const messageStr = serializeMessage(message);
		for (const [ws] of this.connections.entries()) {
			if (ws.readyState === ws.OPEN) {
				try {
					ws.send(messageStr);
				} catch (error) {
					console.error('Error broadcasting message:', error);
				}
			}
		}
	}
}

// Global server instance
let serverInstance = null;

/**
 * Start the WebSocket server
 * @param {Object} options - Server options
 * @returns {ChatWebSocketServer} Server instance
 */
export function startWebSocketServer(options = {}) {
	if (serverInstance) {
		console.warn('WebSocket server already running');
		return serverInstance;
	}

	serverInstance = new ChatWebSocketServer(options);
	serverInstance.start();
	return serverInstance;
}

/**
 * Stop the WebSocket server
 */
export function stopWebSocketServer() {
	if (serverInstance) {
		serverInstance.stop();
		serverInstance = null;
	}
}

/**
 * Get the current server instance
 * @returns {ChatWebSocketServer|null} Server instance or null
 */
export function getWebSocketServer() {
	return serverInstance;
}