/**
 * @fileoverview SSE Connection Manager
 * Manages Server-Sent Events connections for real-time updates
 */

/**
 * SSE Connection Manager
 * Handles SSE connections, user presence, and message broadcasting
 */
class SSEManager {
	constructor() {
		// Map of user_id -> Set of SSE response objects
		this.userConnections = new Map();
		// Map of conversation_id -> Set of user_ids
		this.conversationRooms = new Map();
		// Map of response object -> user_id (for cleanup)
		this.connectionUsers = new Map();
		// Keep-alive interval
		this.keepAliveInterval = null;
	}

	/**
	 * Add a new SSE connection for a user
	 * @param {Object} response - SvelteKit response object
	 * @param {string} userId - User ID
	 */
	addConnection(response, userId) {
		if (!this.userConnections.has(userId)) {
			this.userConnections.set(userId, new Set());
		}
		this.userConnections.get(userId).add(response);
		this.connectionUsers.set(response, userId);

		console.log(`📡 [SSE] User ${userId} connected. Total connections: ${this.userConnections.get(userId).size}`);
	}

	/**
	 * Remove an SSE connection
	 * @param {Object} response - SvelteKit response object
	 */
	removeConnection(response) {
		const userId = this.connectionUsers.get(response);
		if (!userId) return;

		const userConns = this.userConnections.get(userId);
		if (userConns) {
			userConns.delete(response);
			if (userConns.size === 0) {
				this.userConnections.delete(userId);
				console.log(`📡 [SSE] User ${userId} fully disconnected`);
			} else {
				console.log(`📡 [SSE] User ${userId} connection removed. Remaining: ${userConns.size}`);
			}
		}

		this.connectionUsers.delete(response);

		// Remove from all rooms
		for (const [conversationId, users] of this.conversationRooms.entries()) {
			users.delete(userId);
			if (users.size === 0) {
				this.conversationRooms.delete(conversationId);
			}
		}
	}

	/**
	 * Join a user to a conversation room
	 * @param {string} userId - User ID
	 * @param {string} conversationId - Conversation ID
	 */
	joinRoom(userId, conversationId) {
		if (!this.conversationRooms.has(conversationId)) {
			this.conversationRooms.set(conversationId, new Set());
		}
		this.conversationRooms.get(conversationId).add(userId);
		console.log(`🏠 [SSE] User ${userId} joined room ${conversationId}`);
	}

	/**
	 * Remove a user from a conversation room
	 * @param {string} userId - User ID
	 * @param {string} conversationId - Conversation ID
	 */
	leaveRoom(userId, conversationId) {
		const room = this.conversationRooms.get(conversationId);
		if (room) {
			room.delete(userId);
			if (room.size === 0) {
				this.conversationRooms.delete(conversationId);
			}
			console.log(`🏠 [SSE] User ${userId} left room ${conversationId}`);
		}
	}

	/**
	 * Send an SSE event to a specific user
	 * @param {string} userId - User ID
	 * @param {string} eventType - Event type
	 * @param {Object} data - Event data
	 */
	sendToUser(userId, eventType, data) {
		const connections = this.userConnections.get(userId);
		if (!connections || connections.size === 0) {
			console.log(`📡 [SSE] No connections for user ${userId}`);
			return;
		}

		const eventData = this.formatSSEMessage(eventType, data);
		let sentCount = 0;
		const deadConnections = [];

		for (const response of connections) {
			try {
				response.write(eventData);
				sentCount++;
			} catch (error) {
				console.error(`📡 [SSE] Failed to send to user ${userId}:`, error.message);
				deadConnections.push(response);
			}
		}

		// Clean up dead connections
		for (const deadConn of deadConnections) {
			this.removeConnection(deadConn);
		}

		console.log(`📡 [SSE] Sent ${eventType} to user ${userId} (${sentCount}/${connections.size} connections)`);
	}

	/**
	 * Broadcast an event to all users in a conversation room
	 * @param {string} conversationId - Conversation ID
	 * @param {string} eventType - Event type
	 * @param {Object} data - Event data
	 * @param {string} [excludeUserId] - Optional user ID to exclude from broadcast
	 */
	broadcastToRoom(conversationId, eventType, data, excludeUserId = null) {
		const room = this.conversationRooms.get(conversationId);
		if (!room || room.size === 0) {
			console.log(`🏠 [SSE] No users in room ${conversationId}`);
			return;
		}

		let broadcastCount = 0;
		for (const userId of room) {
			if (userId !== excludeUserId) {
				this.sendToUser(userId, eventType, data);
				broadcastCount++;
			}
		}

		console.log(`🏠 [SSE] Broadcasted ${eventType} to room ${conversationId} (${broadcastCount} users)`);
	}

	/**
	 * Broadcast to all connected users
	 * @param {string} eventType - Event type
	 * @param {Object} data - Event data
	 */
	broadcastToAll(eventType, data) {
		const eventData = this.formatSSEMessage(eventType, data);
		let sentCount = 0;

		for (const [userId, connections] of this.userConnections.entries()) {
			for (const response of connections) {
				try {
					response.write(eventData);
					sentCount++;
				} catch (error) {
					console.error(`📡 [SSE] Failed to broadcast to user ${userId}:`, error.message);
				}
			}
		}

		console.log(`📡 [SSE] Broadcasted ${eventType} to all users (${sentCount} connections)`);
	}

	/**
	 * Format a message for SSE transmission
	 * @param {string} eventType - Event type
	 * @param {Object} data - Event data
	 * @returns {string} Formatted SSE message
	 */
	formatSSEMessage(eventType, data) {
		const message = {
			type: eventType,
			timestamp: new Date().toISOString(),
			data
		};
		return `event: ${eventType}\ndata: ${JSON.stringify(message)}\n\n`;
	}

	/**
	 * Send keep-alive ping to all connections
	 */
	sendKeepAlive() {
		const keepAliveData = `: keep-alive ${Date.now()}\n\n`;
		let sentCount = 0;
		const deadConnections = [];

		for (const [response, userId] of this.connectionUsers.entries()) {
			try {
				response.write(keepAliveData);
				sentCount++;
			} catch (error) {
				console.error(`📡 [SSE] Keep-alive failed for user ${userId}:`, error.message);
				deadConnections.push(response);
			}
		}

		// Clean up dead connections
		for (const deadConn of deadConnections) {
			this.removeConnection(deadConn);
		}

		if (sentCount > 0) {
			console.log(`💓 [SSE] Keep-alive sent to ${sentCount} connections`);
		}
	}

	/**
	 * Start keep-alive interval
	 * @param {number} interval - Interval in milliseconds (default: 30000)
	 */
	startKeepAlive(interval = 30000) {
		if (this.keepAliveInterval) {
			clearInterval(this.keepAliveInterval);
		}

		this.keepAliveInterval = setInterval(() => {
			this.sendKeepAlive();
		}, interval);

		console.log(`💓 [SSE] Keep-alive started (interval: ${interval}ms)`);
	}

	/**
	 * Stop keep-alive interval
	 */
	stopKeepAlive() {
		if (this.keepAliveInterval) {
			clearInterval(this.keepAliveInterval);
			this.keepAliveInterval = null;
			console.log(`💓 [SSE] Keep-alive stopped`);
		}
	}

	/**
	 * Get statistics about current connections
	 * @returns {Object} Connection statistics
	 */
	getStats() {
		const totalConnections = Array.from(this.userConnections.values())
			.reduce((sum, conns) => sum + conns.size, 0);

		return {
			totalUsers: this.userConnections.size,
			totalConnections,
			totalRooms: this.conversationRooms.size,
			users: Array.from(this.userConnections.entries()).map(([userId, conns]) => ({
				userId,
				connections: conns.size
			})),
			rooms: Array.from(this.conversationRooms.entries()).map(([roomId, users]) => ({
				roomId,
				userCount: users.size
			}))
		};
	}

	/**
	 * Clean up all connections
	 */
	cleanup() {
		this.stopKeepAlive();
		this.userConnections.clear();
		this.conversationRooms.clear();
		this.connectionUsers.clear();
		console.log(`🧹 [SSE] All connections cleaned up`);
	}
}

// Create singleton instance
export const sseManager = new SSEManager();