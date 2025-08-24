/**
 * @fileoverview Tests for chat store functionality
 * Tests conversation management, message handling, and real-time updates
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { get } from 'svelte/store';
import { chat } from '../../src/lib/stores/chat.js';

// Mock Supabase client
const mockSupabase = {
	from: vi.fn(),
	rpc: vi.fn(),
	channel: vi.fn(),
	removeChannel: vi.fn()
};

const mockQuery = {
	select: vi.fn().mockReturnThis(),
	eq: vi.fn().mockReturnThis(),
	insert: vi.fn().mockReturnThis(),
	update: vi.fn().mockReturnThis(),
	upsert: vi.fn().mockReturnThis(),
	single: vi.fn(),
	order: vi.fn().mockReturnThis(),
	limit: vi.fn().mockReturnThis(),
	lt: vi.fn().mockReturnThis(),
	is: vi.fn().mockReturnThis()
};

const mockChannel = {
	on: vi.fn().mockReturnThis(),
	subscribe: vi.fn().mockReturnThis(),
	unsubscribe: vi.fn()
};

// Mock user data
const mockUser = {
	id: 'user-123',
	username: 'testuser',
	displayName: 'Test User'
};

describe('Chat Store', () => {
	beforeEach(() => {
		// Reset mocks
		vi.clearAllMocks();
		
		// Setup default mock returns
		mockSupabase.from.mockReturnValue(mockQuery);
		mockSupabase.rpc.mockResolvedValue({ data: [], error: null });
		mockSupabase.channel.mockReturnValue(mockChannel);
		
		mockQuery.single.mockResolvedValue({ data: null, error: null });
		mockQuery.select.mockReturnValue(mockQuery);
	});

	afterEach(() => {
		// Clean up any subscriptions
		chat.cleanup();
	});

	describe('Initialization', () => {
		it('should initialize with empty state', () => {
			const state = get(chat);
			
			expect(state.conversations).toEqual([]);
			expect(state.groups).toEqual([]);
			expect(state.activeConversation).toBeNull();
			expect(state.messages).toEqual([]);
			expect(state.loading).toBe(false);
			expect(state.typingUsers).toEqual([]);
		});
	});

	describe('Conversations Management', () => {
		it('should load user conversations', async () => {
			const mockConversations = [
				{
					conversation_id: 'conv-1',
					conversation_type: 'direct',
					conversation_name: 'John Doe',
					unread_count: 2
				},
				{
					conversation_id: 'conv-2',
					conversation_type: 'group',
					conversation_name: 'Team Chat',
					unread_count: 0
				}
			];

			mockSupabase.rpc.mockResolvedValueOnce({
				data: mockConversations,
				error: null
			});

			await chat.loadConversations(mockUser.id);

			const state = get(chat);
			expect(state.conversations).toEqual(mockConversations);
			expect(state.loading).toBe(false);
		});

		it('should handle conversation loading errors', async () => {
			const mockError = new Error('Database error');
			mockSupabase.rpc.mockResolvedValueOnce({
				data: null,
				error: mockError
			});

			await chat.loadConversations(mockUser.id);

			const state = get(chat);
			expect(state.conversations).toEqual([]);
			expect(state.error).toBe('Failed to load conversations');
		});

		it('should set active conversation', async () => {
			const conversationId = 'conv-123';
			const mockMessages = [
				{
					id: 'msg-1',
					encrypted_content: 'Hello',
					sender_id: 'user-456',
					created_at: '2024-01-01T10:00:00Z'
				}
			];

			mockQuery.single.mockResolvedValueOnce({
				data: mockMessages,
				error: null
			});

			await chat.setActiveConversation(conversationId, mockUser.id);

			const state = get(chat);
			expect(state.activeConversation).toBe(conversationId);
			expect(state.messages).toEqual(mockMessages);
		});
	});

	describe('Groups Management', () => {
		it('should load user groups', async () => {
			const mockGroups = [
				{
					group_id: 'group-1',
					group_name: 'Development Team',
					room_count: 3,
					member_count: 5
				}
			];

			mockSupabase.rpc.mockResolvedValueOnce({
				data: mockGroups,
				error: null
			});

			await chat.loadGroups(mockUser.id);

			const state = get(chat);
			expect(state.groups).toEqual(mockGroups);
		});

		it('should create a new group', async () => {
			const groupData = {
				name: 'New Team',
				description: 'A new team group',
				isPublic: false
			};

			const mockResult = {
				group_id: 'group-new',
				room_id: 'room-general',
				invite_code: 'ABC12345'
			};

			mockSupabase.rpc.mockResolvedValueOnce({
				data: [mockResult],
				error: null
			});

			const result = await chat.createGroup(groupData, mockUser.id);

			expect(result.success).toBe(true);
			expect(result.data).toEqual(mockResult);
		});

		it('should join group by invite code', async () => {
			const inviteCode = 'ABC12345';
			const mockResult = {
				success: true,
				group_id: 'group-123',
				message: 'Successfully joined group'
			};

			mockSupabase.rpc.mockResolvedValueOnce({
				data: [mockResult],
				error: null
			});

			const result = await chat.joinGroupByInvite(inviteCode, mockUser.id);

			expect(result.success).toBe(true);
			expect(result.data).toEqual(mockResult);
		});
	});

	describe('Message Management', () => {
		it('should send a message', async () => {
			const messageData = {
				conversation_id: 'conv-123',
				encrypted_content: 'Hello World',
				message_type: 'text'
			};

			const mockMessage = {
				id: 'msg-new',
				...messageData,
				sender_id: mockUser.id,
				created_at: '2024-01-01T10:00:00Z'
			};

			mockQuery.single.mockResolvedValueOnce({
				data: mockMessage,
				error: null
			});

			const result = await chat.sendMessage(messageData, mockUser.id);

			expect(result.success).toBe(true);
			expect(result.data).toEqual(mockMessage);
		});

		it('should load more messages', async () => {
			const conversationId = 'conv-123';
			const beforeMessageId = 'msg-100';
			
			const mockOlderMessages = [
				{
					id: 'msg-50',
					encrypted_content: 'Older message',
					created_at: '2024-01-01T09:00:00Z'
				}
			];

			// Set initial state
			chat.setMessages([
				{
					id: 'msg-100',
					encrypted_content: 'Current message',
					created_at: '2024-01-01T10:00:00Z'
				}
			]);

			mockQuery.single.mockResolvedValueOnce({
				data: mockOlderMessages,
				error: null
			});

			await chat.loadMoreMessages(conversationId, beforeMessageId);

			const state = get(chat);
			expect(state.messages).toHaveLength(2);
			expect(state.messages[0]).toEqual(mockOlderMessages[0]);
		});

		it('should mark messages as read', async () => {
			const messageIds = ['msg-1', 'msg-2'];

			mockQuery.single.mockResolvedValue({
				data: { success: true },
				error: null
			});

			await chat.markMessagesAsRead(messageIds, mockUser.id);

			expect(mockSupabase.from).toHaveBeenCalledWith('message_status');
			expect(mockQuery.upsert).toHaveBeenCalled();
		});
	});

	describe('Real-time Updates', () => {
		it('should subscribe to conversation updates', () => {
			const conversationId = 'conv-123';
			const callbacks = {
				onNewMessage: vi.fn(),
				onTypingChange: vi.fn()
			};

			chat.subscribeToConversation(conversationId, callbacks);

			expect(mockSupabase.channel).toHaveBeenCalledWith(`conversation:${conversationId}`);
			expect(mockChannel.on).toHaveBeenCalled();
			expect(mockChannel.subscribe).toHaveBeenCalled();
		});

		it('should handle new message from real-time', () => {
			const newMessage = {
				id: 'msg-new',
				encrypted_content: 'Real-time message',
				sender_id: 'user-456',
				created_at: '2024-01-01T10:30:00Z'
			};

			// Set initial messages
			chat.setMessages([
				{
					id: 'msg-1',
					encrypted_content: 'Existing message',
					created_at: '2024-01-01T10:00:00Z'
				}
			]);

			chat.handleNewMessage(newMessage);

			const state = get(chat);
			expect(state.messages).toHaveLength(2);
			expect(state.messages[1]).toEqual(newMessage);
		});

		it('should update typing indicators', () => {
			const typingData = {
				user_id: 'user-456',
				is_typing: true,
				conversation_id: 'conv-123'
			};

			chat.handleTypingChange(typingData);

			const state = get(chat);
			expect(state.typingUsers).toContain('user-456');
		});

		it('should remove typing indicators when user stops typing', () => {
			// Set initial typing state
			chat.handleTypingChange({
				user_id: 'user-456',
				is_typing: true,
				conversation_id: 'conv-123'
			});

			// User stops typing
			chat.handleTypingChange({
				user_id: 'user-456',
				is_typing: false,
				conversation_id: 'conv-123'
			});

			const state = get(chat);
			expect(state.typingUsers).not.toContain('user-456');
		});
	});

	describe('Search and Filtering', () => {
		it('should search conversations', () => {
			const conversations = [
				{ conversation_name: 'John Doe', conversation_type: 'direct' },
				{ conversation_name: 'Team Chat', conversation_type: 'group' },
				{ conversation_name: 'Jane Smith', conversation_type: 'direct' }
			];

			chat.setConversations(conversations);

			const results = chat.searchConversations('john');
			expect(results).toHaveLength(1);
			expect(results[0].conversation_name).toBe('John Doe');
		});

		it('should filter conversations by type', () => {
			const conversations = [
				{ conversation_name: 'John Doe', conversation_type: 'direct' },
				{ conversation_name: 'Team Chat', conversation_type: 'group' },
				{ conversation_name: 'Jane Smith', conversation_type: 'direct' }
			];

			chat.setConversations(conversations);

			const directChats = chat.filterConversationsByType('direct');
			expect(directChats).toHaveLength(2);

			const groupChats = chat.filterConversationsByType('group');
			expect(groupChats).toHaveLength(1);
		});
	});

	describe('Error Handling', () => {
		it('should handle network errors gracefully', async () => {
			mockSupabase.rpc.mockRejectedValueOnce(new Error('Network error'));

			await chat.loadConversations(mockUser.id);

			const state = get(chat);
			expect(state.error).toBe('Failed to load conversations');
			expect(state.loading).toBe(false);
		});

		it('should clear errors when operations succeed', async () => {
			// Set initial error state
			chat.setError('Previous error');

			mockSupabase.rpc.mockResolvedValueOnce({
				data: [],
				error: null
			});

			await chat.loadConversations(mockUser.id);

			const state = get(chat);
			expect(state.error).toBeNull();
		});
	});
});