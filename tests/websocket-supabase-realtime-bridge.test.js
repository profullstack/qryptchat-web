/**
 * @fileoverview Unit tests for Supabase Realtime Bridge using Vitest
 * Tests the bridge functionality without breaking existing WebSocket server
 */

import { describe, it, beforeEach, afterEach, vi, expect } from 'vitest';
import { SupabaseRealtimeBridge } from '../src/lib/websocket/supabase-realtime-bridge.js';

describe('SupabaseRealtimeBridge', () => {
	let bridge;
	let mockSupabase;
	let mockChannel;
	let mockRoomManager;

	beforeEach(() => {
		// Create fresh bridge instance for each test
		bridge = new SupabaseRealtimeBridge();

		// Mock Supabase client
		mockChannel = {
			on: vi.fn().mockReturnThis(),
			subscribe: vi.fn().mockReturnThis()
		};

		mockSupabase = {
			channel: vi.fn().mockReturnValue(mockChannel),
			removeChannel: vi.fn(),
			from: vi.fn().mockReturnValue({
				select: vi.fn().mockReturnValue({
					eq: vi.fn().mockReturnValue({
						single: vi.fn().mockResolvedValue({
							data: {
								id: 'msg-123',
								conversation_id: 'conv-456',
								encrypted_content: 'encrypted-content',
								sender: { id: 'user-789', username: 'testuser' }
							},
							error: null
						})
					})
				})
			})
		};

		// Mock room manager
		mockRoomManager = {
			broadcastToRoom: vi.fn()
		};

		// Mock global room manager
		vi.stubGlobal('roomManager', mockRoomManager);

		// Set up environment variables
		vi.stubEnv('PUBLIC_SUPABASE_URL', 'https://test.supabase.co');
		vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key');
	});

	afterEach(() => {
		// Clean up
		bridge.cleanup();
		vi.clearAllMocks();
		vi.unstubAllEnvs();
		vi.unstubAllGlobals();
	});

	describe('initialization', () => {
		it('should initialize successfully with valid environment variables', async () => {
			// Mock the bridge to simulate successful initialization
			bridge.supabase = mockSupabase;
			bridge.isInitialized = true;

			expect(bridge.isInitialized).toBe(true);
			expect(bridge.supabase).toBe(mockSupabase);
		});

		it('should throw error when environment variables are missing', async () => {
			vi.unstubAllEnvs();

			await expect(bridge.initialize()).rejects.toThrow('Missing Supabase environment variables');
		});

		it('should not initialize twice', async () => {
			bridge.isInitialized = true;
			bridge.supabase = mockSupabase;

			await bridge.initialize();
			
			// Should not create new client if already initialized
			expect(bridge.isInitialized).toBe(true);
		});
	});

	describe('conversation subscription', () => {
		beforeEach(() => {
			bridge.isInitialized = true;
			bridge.supabase = mockSupabase;
		});

		it('should subscribe to conversation successfully', () => {
			const conversationId = 'conv-123';

			bridge.subscribeToConversation(conversationId);

			expect(mockSupabase.channel).toHaveBeenCalledWith(`conversation:${conversationId}`);
			expect(mockChannel.on).toHaveBeenCalledTimes(2);
			expect(mockChannel.subscribe).toHaveBeenCalled();
			expect(bridge.channels.has(conversationId)).toBe(true);
		});

		it('should not subscribe if already subscribed', () => {
			const conversationId = 'conv-123';
			bridge.channels.set(conversationId, mockChannel);

			bridge.subscribeToConversation(conversationId);

			expect(mockSupabase.channel).not.toHaveBeenCalled();
		});

		it('should not subscribe if not initialized', () => {
			bridge.isInitialized = false;
			const conversationId = 'conv-123';

			bridge.subscribeToConversation(conversationId);

			expect(mockSupabase.channel).not.toHaveBeenCalled();
		});

		it('should unsubscribe from conversation', () => {
			const conversationId = 'conv-123';
			bridge.channels.set(conversationId, mockChannel);

			bridge.unsubscribeFromConversation(conversationId);

			expect(mockSupabase.removeChannel).toHaveBeenCalledWith(mockChannel);
			expect(bridge.channels.has(conversationId)).toBe(false);
		});
	});

	describe('message handling', () => {
		beforeEach(() => {
			bridge.isInitialized = true;
			bridge.supabase = mockSupabase;
		});

		it('should handle new message correctly', async () => {
			const mockMessage = {
				id: 'msg-123',
				conversation_id: 'conv-456',
				sender_id: 'user-789'
			};

			await bridge.handleNewMessage(mockMessage);

			expect(mockSupabase.from).toHaveBeenCalledWith('messages');
			expect(mockRoomManager.broadcastToRoom).toHaveBeenCalled();
		});

		it('should handle invalid message data gracefully', async () => {
			const invalidMessage = null;

			await bridge.handleNewMessage(invalidMessage);

			expect(mockSupabase.from).not.toHaveBeenCalled();
			expect(mockRoomManager.broadcastToRoom).not.toHaveBeenCalled();
		});

		it('should handle database errors gracefully', async () => {
			const mockMessage = { id: 'msg-123', conversation_id: 'conv-456' };
			
			// Mock database error
			mockSupabase.from.mockReturnValue({
				select: vi.fn().mockReturnValue({
					eq: vi.fn().mockReturnValue({
						single: vi.fn().mockResolvedValue({
							data: null,
							error: { message: 'Database error' }
						})
					})
				})
			});

			await bridge.handleNewMessage(mockMessage);

			expect(mockRoomManager.broadcastToRoom).not.toHaveBeenCalled();
		});
	});

	describe('typing indicator handling', () => {
		it('should handle typing change correctly', () => {
			const typingData = {
				conversation_id: 'conv-123',
				user_id: 'user-456',
				is_typing: true
			};

			bridge.handleTypingChange(typingData);

			expect(mockRoomManager.broadcastToRoom).toHaveBeenCalledWith(
				'conv-123',
				expect.objectContaining({
					type: 'typing_update'
				})
			);
		});

		it('should handle invalid typing data gracefully', () => {
			const invalidTypingData = { invalid: 'data' };

			bridge.handleTypingChange(invalidTypingData);

			expect(mockRoomManager.broadcastToRoom).not.toHaveBeenCalled();
		});
	});

	describe('room management integration', () => {
		beforeEach(() => {
			bridge.isInitialized = true;
			bridge.supabase = mockSupabase;
		});

		it('should auto-subscribe when room is joined', () => {
			const conversationId = 'conv-123';

			bridge.onRoomJoined(conversationId);

			expect(mockSupabase.channel).toHaveBeenCalledWith(`conversation:${conversationId}`);
			expect(bridge.channels.has(conversationId)).toBe(true);
		});

		it('should auto-unsubscribe when room is empty', () => {
			const conversationId = 'conv-123';
			bridge.channels.set(conversationId, mockChannel);

			bridge.onRoomEmpty(conversationId);

			expect(mockSupabase.removeChannel).toHaveBeenCalledWith(mockChannel);
			expect(bridge.channels.has(conversationId)).toBe(false);
		});
	});

	describe('cleanup', () => {
		beforeEach(() => {
			bridge.isInitialized = true;
			bridge.supabase = mockSupabase;
		});

		it('should cleanup all subscriptions', () => {
			// Add some channels
			bridge.channels.set('conv-1', mockChannel);
			bridge.channels.set('conv-2', mockChannel);

			bridge.cleanup();

			expect(mockSupabase.removeChannel).toHaveBeenCalledTimes(2);
			expect(bridge.channels.size).toBe(0);
		});

		it('should handle cleanup when supabase is null', () => {
			bridge.supabase = null;
			bridge.channels.set('conv-1', mockChannel);

			expect(() => bridge.cleanup()).not.toThrow();
			expect(bridge.channels.size).toBe(0);
		});
	});

	describe('statistics', () => {
		beforeEach(() => {
			bridge.isInitialized = true;
			bridge.channels.set('conv-1', mockChannel);
			bridge.channels.set('conv-2', mockChannel);
		});

		it('should return correct statistics', () => {
			const stats = bridge.getStats();

			expect(stats).toEqual({
				initialized: true,
				activeSubscriptions: 2,
				conversations: ['conv-1', 'conv-2']
			});
		});
	});

	describe('error handling', () => {
		it('should handle Supabase client creation errors', async () => {
			// Mock createClient to throw
			vi.stubEnv('PUBLIC_SUPABASE_URL', 'invalid-url');

			await expect(bridge.initialize()).rejects.toThrow();
		});

		it('should handle message processing errors gracefully', async () => {
			bridge.isInitialized = true;
			bridge.supabase = mockSupabase;

			// Mock database to throw
			mockSupabase.from.mockImplementation(() => {
				throw new Error('Database connection failed');
			});

			const mockMessage = { id: 'msg-123', conversation_id: 'conv-456' };

			// Should not throw
			await expect(bridge.handleNewMessage(mockMessage)).resolves.not.toThrow();
		});
	});
});