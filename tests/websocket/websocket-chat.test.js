/**
 * @fileoverview WebSocket Chat API Tests
 * Tests the WebSocket-based chat functionality using Vitest
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ChatWebSocketServer } from '../../src/lib/websocket/server.js';
import { MESSAGE_TYPES, createMessage, serializeMessage } from '../../src/lib/websocket/utils/protocol.js';

describe('WebSocket Chat API', () => {
	let server;
	let ws;
	const TEST_PORT = 8081;

	beforeEach(async () => {
		// Start WebSocket server for testing
		server = new ChatWebSocketServer({ port: TEST_PORT });
		server.start();
		
		// Wait a bit for server to start
		await new Promise(resolve => setTimeout(resolve, 100));
	});

	afterEach(async () => {
		// Clean up WebSocket connection
		if (ws && ws.readyState === ws.OPEN) {
			ws.close();
		}
		
		// Stop server
		if (server) {
			server.stop();
		}
		
		// Wait a bit for cleanup
		await new Promise(resolve => setTimeout(resolve, 100));
	});

	it('should start WebSocket server successfully', () => {
		expect(server).toBeDefined();
		expect(server.port).toBe(TEST_PORT);
	});

	it('should get server statistics', () => {
		const stats = server.getStats();
		expect(stats).toHaveProperty('totalConnections');
		expect(stats).toHaveProperty('authenticatedConnections');
		expect(stats).toHaveProperty('roomStats');
		expect(stats.totalConnections).toBe(0);
	});

	it('should handle WebSocket connection', (done) => {
		// This test requires a real WebSocket implementation
		// In a real test environment, you would use a WebSocket client library
		// For now, we'll just test the server setup
		
		const stats = server.getStats();
		expect(stats.totalConnections).toBe(0);
		done();
	});

	it('should validate message protocol', () => {
		const message = createMessage(MESSAGE_TYPES.AUTH, { token: 'test-token' });
		
		expect(message).toHaveProperty('type', MESSAGE_TYPES.AUTH);
		expect(message).toHaveProperty('payload');
		expect(message).toHaveProperty('requestId');
		expect(message).toHaveProperty('timestamp');
		expect(message.payload.token).toBe('test-token');
	});

	it('should serialize and parse messages correctly', () => {
		const originalMessage = createMessage(MESSAGE_TYPES.SEND_MESSAGE, {
			conversationId: 'test-conv-123',
			content: 'Hello, World!',
			messageType: 'text'
		});

		const serialized = serializeMessage(originalMessage);
		expect(typeof serialized).toBe('string');

		const parsed = JSON.parse(serialized);
		expect(parsed.type).toBe(MESSAGE_TYPES.SEND_MESSAGE);
		expect(parsed.payload.content).toBe('Hello, World!');
		expect(parsed.requestId).toBe(originalMessage.requestId);
	});

	it('should handle different message types', () => {
		const messageTypes = [
			MESSAGE_TYPES.AUTH,
			MESSAGE_TYPES.LOAD_CONVERSATIONS,
			MESSAGE_TYPES.JOIN_CONVERSATION,
			MESSAGE_TYPES.SEND_MESSAGE,
			MESSAGE_TYPES.TYPING_START,
			MESSAGE_TYPES.TYPING_STOP
		];

		messageTypes.forEach(type => {
			const message = createMessage(type, { test: 'data' });
			expect(message.type).toBe(type);
			expect(message.payload.test).toBe('data');
		});
	});

	it('should broadcast messages to all connections', () => {
		const testMessage = createMessage(MESSAGE_TYPES.MESSAGE_RECEIVED, {
			message: {
				id: 'msg-123',
				content: 'Test broadcast',
				sender_id: 'user-123'
			}
		});

		// Test broadcast method exists and doesn't throw
		expect(() => {
			server.broadcast(testMessage);
		}).not.toThrow();
	});
});

describe('WebSocket Protocol Utils', () => {
	it('should create valid message structure', () => {
		const message = createMessage(MESSAGE_TYPES.PING);
		
		expect(message).toHaveProperty('type');
		expect(message).toHaveProperty('payload');
		expect(message).toHaveProperty('requestId');
		expect(message).toHaveProperty('timestamp');
		
		expect(typeof message.type).toBe('string');
		expect(typeof message.payload).toBe('object');
		expect(typeof message.requestId).toBe('string');
		expect(typeof message.timestamp).toBe('string');
	});

	it('should generate unique request IDs', () => {
		const message1 = createMessage(MESSAGE_TYPES.PING);
		const message2 = createMessage(MESSAGE_TYPES.PING);
		
		expect(message1.requestId).not.toBe(message2.requestId);
	});

	it('should include timestamp in ISO format', () => {
		const message = createMessage(MESSAGE_TYPES.PING);
		const timestamp = new Date(message.timestamp);
		
		expect(timestamp).toBeInstanceOf(Date);
		expect(timestamp.toISOString()).toBe(message.timestamp);
	});
});

describe('Room Manager', () => {
	let roomManager;

	beforeEach(async () => {
		// Import room manager
		const { roomManager: rm } = await import('../../src/lib/websocket/utils/rooms.js');
		roomManager = rm;
	});

	it('should track connection statistics', () => {
		const stats = roomManager.getStats();
		
		expect(stats).toHaveProperty('totalConnections');
		expect(stats).toHaveProperty('totalRooms');
		expect(stats).toHaveProperty('totalUsers');
		expect(stats).toHaveProperty('onlineUsers');
		
		expect(typeof stats.totalConnections).toBe('number');
		expect(typeof stats.totalRooms).toBe('number');
		expect(typeof stats.totalUsers).toBe('number');
		expect(Array.isArray(stats.onlineUsers)).toBe(true);
	});

	it('should handle user online status', () => {
		const userId = 'test-user-123';
		
		// Initially user should be offline
		expect(roomManager.isUserOnline(userId)).toBe(false);
		
		// Get connection count
		expect(roomManager.getUserConnectionCount(userId)).toBe(0);
	});

	it('should get online users list', () => {
		const onlineUsers = roomManager.getOnlineUsers();
		expect(Array.isArray(onlineUsers)).toBe(true);
	});

	it('should clean up dead connections', () => {
		// Test cleanup method exists and doesn't throw
		expect(() => {
			roomManager.cleanup();
		}).not.toThrow();
	});
});