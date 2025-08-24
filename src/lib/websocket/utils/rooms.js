/**
 * @fileoverview WebSocket room management utilities
 * Handles conversation rooms, user presence, and message broadcasting
 */

/**
 * Room manager for WebSocket connections
 */
export class RoomManager {
	constructor() {
		// Map of conversation_id -> Set of WebSocket connections
		this.rooms = new Map();
		// Map of user_id -> Set of WebSocket connections
		this.userConnections = new Map();
		// Map of WebSocket -> user_id
		this.connectionUsers = new Map();
	}

	/**
	 * Add a user connection to the manager
	 * @param {WebSocket} ws - WebSocket connection
	 * @param {string} userId - User ID
	 */
	addUserConnection(ws, userId) {
		// Store user for this connection
		this.connectionUsers.set(ws, userId);

		// Add connection to user's connection set
		if (!this.userConnections.has(userId)) {
			this.userConnections.set(userId, new Set());
		}
		this.userConnections.get(userId).add(ws);
	}

	/**
	 * Remove a user connection from the manager
	 * @param {WebSocket} ws - WebSocket connection
	 */
	removeUserConnection(ws) {
		const userId = this.connectionUsers.get(ws);
		if (!userId) return;

		// Remove from user connections
		const userConns = this.userConnections.get(userId);
		if (userConns) {
			userConns.delete(ws);
			if (userConns.size === 0) {
				this.userConnections.delete(userId);
			}
		}

		// Remove from all rooms
		for (const [roomId, connections] of this.rooms.entries()) {
			connections.delete(ws);
			if (connections.size === 0) {
				this.rooms.delete(roomId);
			}
		}

		// Remove connection mapping
		this.connectionUsers.delete(ws);
	}

	/**
	 * Join a user to a conversation room
	 * @param {WebSocket} ws - WebSocket connection
	 * @param {string} conversationId - Conversation ID
	 * @param {string} userId - User ID (for debugging)
	 */
	joinRoom(ws, conversationId, userId = 'unknown') {
		console.log('🏠 [ROOM] User joining room:', {
			conversationId,
			userId,
			existingRoom: this.rooms.has(conversationId),
			currentRoomSize: this.rooms.get(conversationId)?.size || 0
		});
		
		if (!this.rooms.has(conversationId)) {
			this.rooms.set(conversationId, new Set());
		}
		this.rooms.get(conversationId).add(ws);
		
		console.log('🏠 [ROOM] After join:', {
			conversationId,
			userId,
			newRoomSize: this.rooms.get(conversationId).size,
			totalRooms: this.rooms.size,
			roomUsers: this.getRoomUsers(conversationId)
		});
	}

	/**
	 * Remove a user from a conversation room
	 * @param {WebSocket} ws - WebSocket connection
	 * @param {string} conversationId - Conversation ID
	 */
	leaveRoom(ws, conversationId) {
		const room = this.rooms.get(conversationId);
		if (room) {
			room.delete(ws);
			if (room.size === 0) {
				this.rooms.delete(conversationId);
			}
		}
	}

	/**
	 * Broadcast a message to all users in a conversation room
	 * @param {string} conversationId - Conversation ID
	 * @param {Object} message - Message to broadcast
	 * @param {WebSocket} [excludeWs] - WebSocket to exclude from broadcast
	 */
	broadcastToRoom(conversationId, message, excludeWs = null) {
		console.log('🏠 [BROADCAST] ==================== BROADCAST START ====================');
		console.log('🏠 [BROADCAST] Broadcasting to room:', {
			conversationId,
			messageType: message.type,
			hasExcludeWs: !!excludeWs,
			roomExists: this.rooms.has(conversationId)
		});

		const room = this.rooms.get(conversationId);
		if (!room) {
			console.log('🏠 [BROADCAST] ERROR: Room not found for conversation:', conversationId);
			console.log('🏠 [BROADCAST] Available rooms:', Array.from(this.rooms.keys()));
			return;
		}

		console.log('🏠 [BROADCAST] Room details:', {
			conversationId,
			roomSize: room.size,
			roomUsers: this.getRoomUsers(conversationId),
			totalRooms: this.rooms.size,
			totalConnections: this.getTotalConnections()
		});

		const messageStr = JSON.stringify(message);
		let broadcastCount = 0;
		let excludedCount = 0;
		let deadConnections = 0;
		let errors = 0;

		for (const ws of room) {
			const userId = this.connectionUsers.get(ws);
			console.log('🏠 [BROADCAST] Processing connection:', {
				userId: userId || 'unknown',
				isExcluded: ws === excludeWs,
				readyState: ws.readyState,
				isOpen: ws.readyState === ws.OPEN
			});

			if (ws === excludeWs) {
				excludedCount++;
				console.log('🏠 [BROADCAST] Excluding sender connection for user:', userId);
				continue;
			}

			if (ws.readyState !== ws.OPEN) {
				deadConnections++;
				console.log('🏠 [BROADCAST] Dead connection found for user:', userId, 'readyState:', ws.readyState);
				// Remove dead connection
				this.removeUserConnection(ws);
				continue;
			}

			try {
				ws.send(messageStr);
				broadcastCount++;
				console.log('🏠 [BROADCAST] ✅ Message sent successfully to user:', userId);
			} catch (error) {
				errors++;
				console.error('🏠 [BROADCAST] ❌ Failed to send message to user:', userId, error);
				// Remove dead connection
				this.removeUserConnection(ws);
			}
		}

		console.log('🏠 [BROADCAST] Broadcast summary:', {
			conversationId,
			totalConnections: room.size,
			broadcastCount,
			excludedCount,
			deadConnections,
			errors,
			messageType: message.type
		});
		console.log('🏠 [BROADCAST] ==================== BROADCAST END ====================');
	}

	/**
	 * Send a message to all connections of a specific user
	 * @param {string} userId - User ID
	 * @param {Object} message - Message to send
	 */
	sendToUser(userId, message) {
		const userConns = this.userConnections.get(userId);
		if (!userConns) return;

		const messageStr = JSON.stringify(message);
		for (const ws of userConns) {
			if (ws.readyState === ws.OPEN) {
				try {
					ws.send(messageStr);
				} catch (error) {
					console.error('Failed to send message to user WebSocket:', error);
					// Remove dead connection
					this.removeUserConnection(ws);
				}
			}
		}
	}

	/**
	 * Get all users in a conversation room
	 * @param {string} conversationId - Conversation ID
	 * @returns {string[]} Array of user IDs
	 */
	getRoomUsers(conversationId) {
		const room = this.rooms.get(conversationId);
		if (!room) return [];

		const users = new Set();
		for (const ws of room) {
			const userId = this.connectionUsers.get(ws);
			if (userId) {
				users.add(userId);
			}
		}
		return Array.from(users);
	}

	/**
	 * Check if a user is online (has active connections)
	 * @param {string} userId - User ID
	 * @returns {boolean} True if user is online
	 */
	isUserOnline(userId) {
		const userConns = this.userConnections.get(userId);
		return userConns && userConns.size > 0;
	}

	/**
	 * Get all online users
	 * @returns {string[]} Array of online user IDs
	 */
	getOnlineUsers() {
		return Array.from(this.userConnections.keys());
	}

	/**
	 * Get connection count for a user
	 * @param {string} userId - User ID
	 * @returns {number} Number of active connections
	 */
	getUserConnectionCount(userId) {
		const userConns = this.userConnections.get(userId);
		return userConns ? userConns.size : 0;
	}

	/**
	 * Get total number of active connections
	 * @returns {number} Total connection count
	 */
	getTotalConnections() {
		return this.connectionUsers.size;
	}

	/**
	 * Get room statistics
	 * @returns {Object} Room statistics
	 */
	getStats() {
		return {
			totalConnections: this.getTotalConnections(),
			totalRooms: this.rooms.size,
			totalUsers: this.userConnections.size,
			onlineUsers: this.getOnlineUsers()
		};
	}

	/**
	 * Clean up dead connections
	 */
	cleanup() {
		const deadConnections = [];

		// Find dead connections
		for (const [ws, userId] of this.connectionUsers.entries()) {
			if (ws.readyState !== ws.OPEN) {
				deadConnections.push(ws);
			}
		}

		// Remove dead connections
		for (const ws of deadConnections) {
			this.removeUserConnection(ws);
		}
	}
}

// Global room manager instance
export const roomManager = new RoomManager();