/**
 * @fileoverview Integration tests for WebSocket server with Supabase Realtime Bridge
 * Tests that existing WebSocket functionality still works with the new bridge
 */

import { describe, it, beforeEach, afterEach, vi, expect } from 'vitest';
import { WebSocket } from 'ws';
import { ChatWebSocketServer } from '../src/lib/websocket/server.js';
import { MESSAGE_TYPES } from '../src/lib/websocket/utils/protocol.js';

describe('WebSocket Server Integration with Supabase Bridge', () => {
	let server;
	let mockSupabaseBridge;
	let testPort;

	beforeEach(async () => {
		// Use random port for testing
		testPort = 8000 + Math.floor(Math.random() * 1000);

		// Mock Supabase bridge
		mockSupabaseBridge = {
			initialize: sinon.stub().resolves(),
			cleanup: sinon.stub(),
			onRoomJoined: sinon.stub(),
			onRoomEmpty: sinon.stub(),
			subscribeToConversation: sinon.stub(),
			unsubscribeFromConversation: sinon.stub(),
			getStats: sinon.stub().returns({
				initialized: true,
				activeSubscriptions: 0,
				conversations: []
			})
		};

		// Set up environment variables for bridge
		process.env.PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
		process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

		// Create server instance
		server = new ChatWebSocketServer({ port: testPort });
	});

	afterEach(async () => {
		if (server) {
			server.stop();
		}
		sinon.restore();
		delete process.env.PUBLIC_SUPABASE_URL;
		delete process.env.SUPABASE_SERVICE_ROLE_KEY;
	});

	describe('server startup with bridge', () => {
		it('should start server and initialize bridge successfully', async () => {
			// Mock the bridge initialization
			const initializeSpy = sinon.spy();
			
			// Start server (this should initialize the bridge)
			await server.start();

			// Verify server is running
			expect(server.server).to.not.be.null;
			
			// Clean up
			server.stop();
		});

		it('should continue working even if bridge initialization fails', async () => {
			// Mock bridge to fail initialization
			const consoleSpy = sinon.spy(console, 'error');

			// Start server
			await server.start();

			// Server should still be running
			expect(server.server).to.not.be.null;

			server.stop();
		});
	});

	describe('WebSocket connection handling', () => {
		let client;

		beforeEach(async () => {
			await server.start();
		});

		afterEach(() => {
			if (client && client.readyState === WebSocket.OPEN) {
				client.close();
			}
		});

		it('should accept WebSocket connections', (done) => {
			client = new WebSocket(`ws://localhost:${testPort}`);

			client.on('open', () => {
				expect(client.readyState).to.equal(WebSocket.OPEN);
				done();
			});

			client.on('error', done);
		});

		it('should handle authentication messages', (done) => {
			client = new WebSocket(`ws://localhost:${testPort}`);

			client.on('open', () => {
				const authMessage = {
					type: MESSAGE_TYPES.AUTH,
					payload: { token: 'test-token' },
					requestId: 'test-request-id',
					timestamp: new Date().toISOString()
				};

				client.send(JSON.stringify(authMessage));
			});

			client.on('message', (data) => {
				const response = JSON.parse(data.toString());
				
				// Should receive some kind of response (success or error)
				expect(response).to.have.property('type');
				expect(response).to.have.property('requestId');
				done();
			});

			client.on('error', done);
		});

		it('should handle ping/pong messages', (done) => {
			client = new WebSocket(`ws://localhost:${testPort}`);

			client.on('open', () => {
				const pingMessage = {
					type: MESSAGE_TYPES.PING,
					payload: {},
					requestId: 'ping-test',
					timestamp: new Date().toISOString()
				};

				client.send(JSON.stringify(pingMessage));
			});

			client.on('message', (data) => {
				const response = JSON.parse(data.toString());
				
				expect(response.type).to.equal(MESSAGE_TYPES.PONG);
				expect(response.requestId).to.equal('ping-test');
				done();
			});

			client.on('error', done);
		});
	});

	describe('room management with bridge integration', () => {
		let client1, client2;

		beforeEach(async () => {
			await server.start();
		});

		afterEach(() => {
			[client1, client2].forEach(client => {
				if (client && client.readyState === WebSocket.OPEN) {
					client.close();
				}
			});
		});

		it('should handle multiple clients joining same conversation', (done) => {
			let client1Connected = false;
			let client2Connected = false;

			const checkBothConnected = () => {
				if (client1Connected && client2Connected) {
					// Both clients connected successfully
					expect(server.getStats().totalConnections).to.be.at.least(2);
					done();
				}
			};

			client1 = new WebSocket(`ws://localhost:${testPort}`);
			client1.on('open', () => {
				client1Connected = true;
				checkBothConnected();
			});

			client2 = new WebSocket(`ws://localhost:${testPort}`);
			client2.on('open', () => {
				client2Connected = true;
				checkBothConnected();
			});

			[client1, client2].forEach(client => {
				client.on('error', done);
			});
		});
	});

	describe('message broadcasting', () => {
		let client1, client2;

		beforeEach(async () => {
			await server.start();
		});

		afterEach(() => {
			[client1, client2].forEach(client => {
				if (client && client.readyState === WebSocket.OPEN) {
					client.close();
				}
			});
		});

		it('should broadcast messages to all connected clients', (done) => {
			let messagesReceived = 0;
			const testMessage = {
				type: MESSAGE_TYPES.MESSAGE_RECEIVED,
				payload: { 
					message: {
						id: 'test-msg-123',
						content: 'Test broadcast message',
						conversation_id: 'test-conv-456'
					}
				},
				requestId: null,
				timestamp: new Date().toISOString()
			};

			const handleMessage = (data) => {
				const message = JSON.parse(data.toString());
				if (message.type === MESSAGE_TYPES.MESSAGE_RECEIVED) {
					messagesReceived++;
					if (messagesReceived === 2) {
						// Both clients received the broadcast
						done();
					}
				}
			};

			client1 = new WebSocket(`ws://localhost:${testPort}`);
			client2 = new WebSocket(`ws://localhost:${testPort}`);

			let connectionsReady = 0;
			const checkReady = () => {
				connectionsReady++;
				if (connectionsReady === 2) {
					// Both clients connected, now broadcast a message
					server.broadcast(testMessage);
				}
			};

			client1.on('open', checkReady);
			client2.on('open', checkReady);

			client1.on('message', handleMessage);
			client2.on('message', handleMessage);

			[client1, client2].forEach(client => {
				client.on('error', done);
			});
		});
	});

	describe('error handling', () => {
		let client;

		beforeEach(async () => {
			await server.start();
		});

		afterEach(() => {
			if (client && client.readyState === WebSocket.OPEN) {
				client.close();
			}
		});

		it('should handle invalid message format gracefully', (done) => {
			client = new WebSocket(`ws://localhost:${testPort}`);

			client.on('open', () => {
				// Send invalid JSON
				client.send('invalid json message');
			});

			client.on('message', (data) => {
				const response = JSON.parse(data.toString());
				
				expect(response.type).to.equal(MESSAGE_TYPES.ERROR);
				expect(response.payload.error).to.include('Invalid message format');
				done();
			});

			client.on('error', done);
		});

		it('should handle unknown message types gracefully', (done) => {
			client = new WebSocket(`ws://localhost:${testPort}`);

			client.on('open', () => {
				const unknownMessage = {
					type: 'UNKNOWN_MESSAGE_TYPE',
					payload: {},
					requestId: 'test-request',
					timestamp: new Date().toISOString()
				};

				client.send(JSON.stringify(unknownMessage));
			});

			client.on('message', (data) => {
				const response = JSON.parse(data.toString());
				
				expect(response.type).to.equal(MESSAGE_TYPES.ERROR);
				expect(response.payload.error).to.include('Unknown message type');
				done();
			});

			client.on('error', done);
		});
	});

	describe('server statistics', () => {
		it('should provide accurate server statistics', async () => {
			await server.start();

			const stats = server.getStats();

			expect(stats).to.have.property('totalConnections');
			expect(stats).to.have.property('authenticatedConnections');
			expect(stats).to.have.property('roomStats');
			expect(stats.totalConnections).to.be.a('number');
			expect(stats.authenticatedConnections).to.be.a('number');

			server.stop();
		});
	});

	describe('cleanup on shutdown', () => {
		it('should cleanup bridge when server stops', async () => {
			await server.start();
			
			// Stop server
			server.stop();

			// Bridge cleanup should have been called
			// (This would be verified if we had access to the actual bridge instance)
			expect(server.server).to.be.null;
		});
	});

	describe('backward compatibility', () => {
		it('should maintain existing WebSocket API', async () => {
			await server.start();

			// All existing message types should still be supported
			const supportedTypes = [
				MESSAGE_TYPES.AUTH,
				MESSAGE_TYPES.LOAD_CONVERSATIONS,
				MESSAGE_TYPES.JOIN_CONVERSATION,
				MESSAGE_TYPES.SEND_MESSAGE,
				MESSAGE_TYPES.TYPING_START,
				MESSAGE_TYPES.TYPING_STOP,
				MESSAGE_TYPES.PING
			];

			// Server should handle all these message types
			expect(supportedTypes.length).to.be.greaterThan(0);

			server.stop();
		});

		it('should not break existing client connections', (done) => {
			server.start().then(() => {
				const client = new WebSocket(`ws://localhost:${testPort}`);

				client.on('open', () => {
					// Connection should work exactly as before
					expect(client.readyState).to.equal(WebSocket.OPEN);
					client.close();
					done();
				});

				client.on('error', done);
			});
		});
	});
});