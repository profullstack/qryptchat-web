/**
 * @fileoverview SSE Manager Unit Tests
 * Tests the SSE connection manager functionality
 * 
 * Test Framework: Mocha
 * Assertion Library: Chai
 */

import { expect } from 'chai';
import { describe, it, before, after, beforeEach, afterEach } from 'mocha';
import { sseManager } from '../src/lib/api/sse-manager.js';

describe('SSE Manager Unit Tests', () => {
	let mockResponse1;
	let mockResponse2;
	const testUserId1 = 'user-123';
	const testUserId2 = 'user-456';
	const testConversationId = 'conv-789';

	beforeEach(() => {
		// Create mock SSE response objects
		mockResponse1 = {
			write: (data) => {
				mockResponse1.lastWrite = data;
			},
			close: () => {
				mockResponse1.closed = true;
			},
			lastWrite: null,
			closed: false
		};

		mockResponse2 = {
			write: (data) => {
				mockResponse2.lastWrite = data;
			},
			close: () => {
				mockResponse2.closed = true;
			},
			lastWrite: null,
			closed: false
		};

		// Clean up manager state
		sseManager.cleanup();
	});

	afterEach(() => {
		sseManager.cleanup();
	});

	describe('Connection Management', () => {
		it('should add a user connection', () => {
			sseManager.addConnection(mockResponse1, testUserId1);
			
			const stats = sseManager.getStats();
			expect(stats.totalUsers).to.equal(1);
			expect(stats.totalConnections).to.equal(1);
		});

		it('should support multiple connections per user', () => {
			sseManager.addConnection(mockResponse1, testUserId1);
			sseManager.addConnection(mockResponse2, testUserId1);
			
			const stats = sseManager.getStats();
			expect(stats.totalUsers).to.equal(1);
			expect(stats.totalConnections).to.equal(2);
		});

		it('should remove a user connection', () => {
			sseManager.addConnection(mockResponse1, testUserId1);
			sseManager.removeConnection(mockResponse1);
			
			const stats = sseManager.getStats();
			expect(stats.totalUsers).to.equal(0);
			expect(stats.totalConnections).to.equal(0);
		});

		it('should handle removing non-existent connection gracefully', () => {
			expect(() => {
				sseManager.removeConnection(mockResponse1);
			}).to.not.throw();
		});

		it('should track multiple users', () => {
			sseManager.addConnection(mockResponse1, testUserId1);
			sseManager.addConnection(mockResponse2, testUserId2);
			
			const stats = sseManager.getStats();
			expect(stats.totalUsers).to.equal(2);
			expect(stats.totalConnections).to.equal(2);
		});
	});

	describe('Room Management', () => {
		beforeEach(() => {
			sseManager.addConnection(mockResponse1, testUserId1);
			sseManager.addConnection(mockResponse2, testUserId2);
		});

		it('should join a user to a room', () => {
			sseManager.joinRoom(testUserId1, testConversationId);
			
			const stats = sseManager.getStats();
			expect(stats.totalRooms).to.equal(1);
			expect(stats.rooms[0].roomId).to.equal(testConversationId);
			expect(stats.rooms[0].userCount).to.equal(1);
		});

		it('should support multiple users in a room', () => {
			sseManager.joinRoom(testUserId1, testConversationId);
			sseManager.joinRoom(testUserId2, testConversationId);
			
			const stats = sseManager.getStats();
			expect(stats.totalRooms).to.equal(1);
			expect(stats.rooms[0].userCount).to.equal(2);
		});

		it('should remove a user from a room', () => {
			sseManager.joinRoom(testUserId1, testConversationId);
			sseManager.joinRoom(testUserId2, testConversationId);
			sseManager.leaveRoom(testUserId1, testConversationId);
			
			const stats = sseManager.getStats();
			expect(stats.rooms[0].userCount).to.equal(1);
		});

		it('should remove empty rooms', () => {
			sseManager.joinRoom(testUserId1, testConversationId);
			sseManager.leaveRoom(testUserId1, testConversationId);
			
			const stats = sseManager.getStats();
			expect(stats.totalRooms).to.equal(0);
		});

		it('should handle leaving non-existent room gracefully', () => {
			expect(() => {
				sseManager.leaveRoom(testUserId1, 'non-existent-room');
			}).to.not.throw();
		});
	});

	describe('Message Sending', () => {
		beforeEach(() => {
			sseManager.addConnection(mockResponse1, testUserId1);
		});

		it('should send message to specific user', () => {
			sseManager.sendToUser(testUserId1, 'TEST_EVENT', { message: 'Hello' });
			
			expect(mockResponse1.lastWrite).to.be.a('string');
			expect(mockResponse1.lastWrite).to.include('event: TEST_EVENT');
			expect(mockResponse1.lastWrite).to.include('Hello');
		});

		it('should handle sending to non-existent user gracefully', () => {
			expect(() => {
				sseManager.sendToUser('non-existent-user', 'TEST_EVENT', {});
			}).to.not.throw();
		});

		it('should format SSE messages correctly', () => {
			const formatted = sseManager.formatSSEMessage('TEST_EVENT', { test: 'data' });
			
			expect(formatted).to.include('event: TEST_EVENT\n');
			expect(formatted).to.include('data: ');
			expect(formatted).to.include('"test":"data"');
			expect(formatted).to.match(/\n\n$/); // Should end with double newline
		});
	});

	describe('Room Broadcasting', () => {
		beforeEach(() => {
			sseManager.addConnection(mockResponse1, testUserId1);
			sseManager.addConnection(mockResponse2, testUserId2);
			sseManager.joinRoom(testUserId1, testConversationId);
			sseManager.joinRoom(testUserId2, testConversationId);
		});

		it('should broadcast to all users in a room', () => {
			sseManager.broadcastToRoom(testConversationId, 'TEST_EVENT', { message: 'Broadcast' });
			
			expect(mockResponse1.lastWrite).to.include('Broadcast');
			expect(mockResponse2.lastWrite).to.include('Broadcast');
		});

		it('should exclude specified user from broadcast', () => {
			sseManager.broadcastToRoom(testConversationId, 'TEST_EVENT', { message: 'Broadcast' }, testUserId1);
			
			expect(mockResponse1.lastWrite).to.be.null;
			expect(mockResponse2.lastWrite).to.include('Broadcast');
		});

		it('should handle broadcasting to empty room gracefully', () => {
			expect(() => {
				sseManager.broadcastToRoom('empty-room', 'TEST_EVENT', {});
			}).to.not.throw();
		});

		it('should broadcast to all users with multiple connections', () => {
			const mockResponse3 = {
				write: (data) => { mockResponse3.lastWrite = data; },
				lastWrite: null
			};
			
			sseManager.addConnection(mockResponse3, testUserId1);
			sseManager.broadcastToRoom(testConversationId, 'TEST_EVENT', { message: 'Multi' });
			
			expect(mockResponse1.lastWrite).to.include('Multi');
			expect(mockResponse3.lastWrite).to.include('Multi');
		});
	});

	describe('Global Broadcasting', () => {
		beforeEach(() => {
			sseManager.addConnection(mockResponse1, testUserId1);
			sseManager.addConnection(mockResponse2, testUserId2);
		});

		it('should broadcast to all connected users', () => {
			sseManager.broadcastToAll('GLOBAL_EVENT', { message: 'Everyone' });
			
			expect(mockResponse1.lastWrite).to.include('Everyone');
			expect(mockResponse2.lastWrite).to.include('Everyone');
		});
	});

	describe('Keep-Alive', () => {
		beforeEach(() => {
			sseManager.addConnection(mockResponse1, testUserId1);
		});

		it('should send keep-alive to all connections', () => {
			sseManager.sendKeepAlive();
			
			expect(mockResponse1.lastWrite).to.include(': keep-alive');
		});

		it('should start keep-alive interval', (done) => {
			sseManager.startKeepAlive(100); // 100ms for testing
			
			setTimeout(() => {
				expect(mockResponse1.lastWrite).to.include(': keep-alive');
				sseManager.stopKeepAlive();
				done();
			}, 150);
		});

		it('should stop keep-alive interval', (done) => {
			sseManager.startKeepAlive(100);
			sseManager.stopKeepAlive();
			
			mockResponse1.lastWrite = null;
			
			setTimeout(() => {
				expect(mockResponse1.lastWrite).to.be.null;
				done();
			}, 150);
		});
	});

	describe('Statistics', () => {
		it('should provide accurate connection statistics', () => {
			sseManager.addConnection(mockResponse1, testUserId1);
			sseManager.addConnection(mockResponse2, testUserId2);
			sseManager.joinRoom(testUserId1, testConversationId);
			
			const stats = sseManager.getStats();
			
			expect(stats).to.have.property('totalUsers');
			expect(stats).to.have.property('totalConnections');
			expect(stats).to.have.property('totalRooms');
			expect(stats).to.have.property('users');
			expect(stats).to.have.property('rooms');
			
			expect(stats.totalUsers).to.equal(2);
			expect(stats.totalConnections).to.equal(2);
			expect(stats.totalRooms).to.equal(1);
			expect(stats.users).to.be.an('array').with.lengthOf(2);
			expect(stats.rooms).to.be.an('array').with.lengthOf(1);
		});
	});

	describe('Cleanup', () => {
		it('should clean up all connections and rooms', () => {
			sseManager.addConnection(mockResponse1, testUserId1);
			sseManager.addConnection(mockResponse2, testUserId2);
			sseManager.joinRoom(testUserId1, testConversationId);
			
			sseManager.cleanup();
			
			const stats = sseManager.getStats();
			expect(stats.totalUsers).to.equal(0);
			expect(stats.totalConnections).to.equal(0);
			expect(stats.totalRooms).to.equal(0);
		});
	});

	describe('Error Handling', () => {
		it('should handle write errors gracefully', () => {
			const errorResponse = {
				write: () => {
					throw new Error('Write failed');
				}
			};
			
			sseManager.addConnection(errorResponse, testUserId1);
			
			expect(() => {
				sseManager.sendToUser(testUserId1, 'TEST_EVENT', {});
			}).to.not.throw();
		});

		it('should remove dead connections on write error', () => {
			const errorResponse = {
				write: () => {
					throw new Error('Write failed');
				}
			};
			
			sseManager.addConnection(errorResponse, testUserId1);
			sseManager.sendToUser(testUserId1, 'TEST_EVENT', {});
			
			const stats = sseManager.getStats();
			expect(stats.totalConnections).to.equal(0);
		});
	});
});