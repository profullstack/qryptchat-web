/**
 * @fileoverview Chat store for managing conversations, messages, groups, and real-time updates
 * Handles Discord/Telegram-like chat functionality with groups, rooms, and direct messages
 */

import { writable, derived } from 'svelte/store';
import { browser } from '$app/environment';
import { createSupabaseClient } from '$lib/supabase.js';

/**
 * @typedef {Object} Conversation
 * @property {string} conversation_id
 * @property {'direct' | 'group' | 'room'} conversation_type
 * @property {string} conversation_name
 * @property {string|null} conversation_avatar_url
 * @property {string|null} group_id
 * @property {string|null} group_name
 * @property {number} participant_count
 * @property {string|null} latest_message_id
 * @property {string|null} latest_message_content
 * @property {string|null} latest_message_sender_id
 * @property {string|null} latest_message_sender_username
 * @property {string|null} latest_message_created_at
 * @property {number} unread_count
 */

/**
 * @typedef {Object} Group
 * @property {string} group_id
 * @property {string} group_name
 * @property {string|null} group_description
 * @property {string|null} group_avatar_url
 * @property {string} user_role
 * @property {number} room_count
 * @property {number} member_count
 * @property {string} latest_activity
 */

/**
 * @typedef {Object} Message
 * @property {string} id
 * @property {string} conversation_id
 * @property {string} sender_id
 * @property {string|null} reply_to_id
 * @property {'text' | 'image' | 'file' | 'system'} message_type
 * @property {string} encrypted_content
 * @property {string|null} content_hash
 * @property {Object} metadata
 * @property {string|null} edited_at
 * @property {string|null} deleted_at
 * @property {string} created_at
 * @property {Object|null} sender
 * @property {Object|null} reply_to
 */

/**
 * @typedef {Object} ChatState
 * @property {Conversation[]} conversations
 * @property {Group[]} groups
 * @property {string|null} activeConversation
 * @property {Message[]} messages
 * @property {boolean} loading
 * @property {string|null} error
 * @property {string[]} typingUsers
 * @property {Object} realtimeChannels
 */

// Create writable store
const chatState = writable(/** @type {ChatState} */ ({
	conversations: [],
	groups: [],
	activeConversation: null,
	messages: [],
	loading: false,
	error: null,
	typingUsers: [],
	realtimeChannels: {}
}));

/**
 * Chat store with methods for managing conversations, messages, and real-time updates
 */
function createChatStore() {
	const { subscribe, set, update } = chatState;

	// Get Supabase client
	const getSupabase = () => {
		if (!browser) return null;
		return createSupabaseClient();
	};

	return {
		subscribe,

		/**
		 * Load user conversations (direct chats, groups, and rooms)
		 * @param {string} userId
		 */
		async loadConversations(userId) {
			if (!browser) return;

			update(state => ({ ...state, loading: true, error: null }));

			try {
				const response = await fetch('/api/chat/conversations', {
					method: 'GET',
					credentials: 'include'
				});

				if (!response.ok) {
					throw new Error(`HTTP ${response.status}: ${response.statusText}`);
				}

				const { conversations } = await response.json();

				update(state => ({
					...state,
					conversations: conversations || [],
					loading: false,
					error: null
				}));
			} catch (error) {
				console.error('Failed to load conversations:', error);
				update(state => ({
					...state,
					conversations: [],
					loading: false,
					error: 'Failed to load conversations'
				}));
			}
		},

		/**
		 * Load user groups
		 * @param {string} userId
		 */
		async loadGroups(userId) {
			if (!browser) return;

			update(state => ({ ...state, loading: true, error: null }));

			try {
				const response = await fetch('/api/chat/groups', {
					method: 'GET',
					credentials: 'include'
				});

				if (!response.ok) {
					throw new Error(`HTTP ${response.status}: ${response.statusText}`);
				}

				const { groups } = await response.json();

				update(state => ({
					...state,
					groups: groups || [],
					loading: false,
					error: null
				}));
			} catch (error) {
				console.error('Failed to load groups:', error);
				update(state => ({
					...state,
					groups: [],
					loading: false,
					error: 'Failed to load groups'
				}));
			}
		},

		/**
		 * Set active conversation and load its messages
		 * @param {string} conversationId
		 * @param {string} userId
		 */
		async setActiveConversation(conversationId, userId) {
			if (!browser) return;

			update(state => ({ ...state, loading: true, error: null }));

			try {
				const supabase = getSupabase();
				if (!supabase) throw new Error('Supabase client not available');

				// Load messages for the conversation
				const { data, error } = await supabase
					.from('messages')
					.select(`
						*,
						sender:users!messages_sender_id_fkey(id, username, display_name, avatar_url),
						reply_to:messages!messages_reply_to_id_fkey(id, encrypted_content, sender_id)
					`)
					.eq('conversation_id', conversationId)
					.is('deleted_at', null)
					.order('created_at', { ascending: true })
					.limit(50);

				if (error) throw error;

				update(state => ({
					...state,
					activeConversation: conversationId,
					messages: data || [],
					loading: false,
					error: null,
					typingUsers: [] // Clear typing indicators when switching conversations
				}));

				// Mark messages as read
				if (data && data.length > 0) {
					const messageIds = data
						.filter(msg => msg.sender_id !== userId)
						.map(msg => msg.id);
					
					if (messageIds.length > 0) {
						await this.markMessagesAsRead(messageIds, userId);
					}
				}

			} catch (error) {
				console.error('Failed to set active conversation:', error);
				update(state => ({
					...state,
					loading: false,
					error: 'Failed to load conversation'
				}));
			}
		},

		/**
		 * Send a message to a conversation
		 * @param {Object} messageData
		 * @param {string} userId
		 * @returns {Promise<{success: boolean, data?: Message, error?: string}>}
		 */
		async sendMessage(messageData, userId) {
			if (!browser) return { success: false, error: 'Not in browser environment' };

			try {
				const supabase = getSupabase();
				if (!supabase) throw new Error('Supabase client not available');

				const { data, error } = await supabase
					.from('messages')
					.insert([{
						...messageData,
						sender_id: userId,
						created_at: new Date().toISOString()
					}])
					.select(`
						*,
						sender:users!messages_sender_id_fkey(id, username, display_name, avatar_url)
					`)
					.single();

				if (error) throw error;

				// Add message to local state immediately for optimistic updates
				update(state => ({
					...state,
					messages: [...state.messages, data]
				}));

				return { success: true, data };
			} catch (error) {
				console.error('Failed to send message:', error);
				return { success: false, error: 'Failed to send message' };
			}
		},

		/**
		 * Load more messages (pagination)
		 * @param {string} conversationId
		 * @param {string} beforeMessageId
		 */
		async loadMoreMessages(conversationId, beforeMessageId) {
			if (!browser) return;

			try {
				const supabase = getSupabase();
				if (!supabase) throw new Error('Supabase client not available');

				// Get the timestamp of the before message
				const { data: beforeMessage } = await supabase
					.from('messages')
					.select('created_at')
					.eq('id', beforeMessageId)
					.single();

				if (!beforeMessage) return;

				const { data, error } = await supabase
					.from('messages')
					.select(`
						*,
						sender:users!messages_sender_id_fkey(id, username, display_name, avatar_url),
						reply_to:messages!messages_reply_to_id_fkey(id, encrypted_content, sender_id)
					`)
					.eq('conversation_id', conversationId)
					.is('deleted_at', null)
					.lt('created_at', beforeMessage.created_at)
					.order('created_at', { ascending: false })
					.limit(50);

				if (error) throw error;

				// Prepend older messages to the beginning of the array
				update(state => ({
					...state,
					messages: [...(data || []).reverse(), ...state.messages]
				}));

			} catch (error) {
				console.error('Failed to load more messages:', error);
			}
		},

		/**
		 * Mark messages as read
		 * @param {string[]} messageIds
		 * @param {string} userId
		 */
		async markMessagesAsRead(messageIds, userId) {
			if (!browser || !messageIds.length) return;

			try {
				const supabase = getSupabase();
				if (!supabase) throw new Error('Supabase client not available');

				const readStatuses = messageIds.map(messageId => ({
					message_id: messageId,
					user_id: userId,
					status: 'read',
					timestamp: new Date().toISOString()
				}));

				await supabase
					.from('message_status')
					.upsert(readStatuses, { onConflict: 'message_id,user_id' });

			} catch (error) {
				console.error('Failed to mark messages as read:', error);
			}
		},

		/**
		 * Create a new group with default room
		 * @param {Object} groupData
		 * @param {string} userId
		 * @returns {Promise<{success: boolean, data?: any, error?: string}>}
		 */
		async createGroup(groupData, userId) {
			if (!browser) return { success: false, error: 'Not in browser environment' };

			try {
				const supabase = getSupabase();
				if (!supabase) throw new Error('Supabase client not available');

				const { data, error } = await supabase.rpc('create_group_with_default_room', {
					group_name: groupData.name,
					group_description: groupData.description || null,
					creator_id: userId,
					is_public_group: groupData.isPublic || false
				});

				if (error) throw error;

				// Reload groups to reflect the new group
				await this.loadGroups(userId);

				return { success: true, data: data[0] };
			} catch (error) {
				console.error('Failed to create group:', error);
				return { success: false, error: 'Failed to create group' };
			}
		},

		/**
		 * Join a group by invite code
		 * @param {string} inviteCode
		 * @param {string} userId
		 * @returns {Promise<{success: boolean, data?: any, error?: string}>}
		 */
		async joinGroupByInvite(inviteCode, userId) {
			if (!browser) return { success: false, error: 'Not in browser environment' };

			try {
				const supabase = getSupabase();
				if (!supabase) throw new Error('Supabase client not available');

				const { data, error } = await supabase.rpc('join_group_by_invite', {
					invite_code_param: inviteCode,
					user_id_param: userId
				});

				if (error) throw error;

				const result = data[0];
				if (!result.success) {
					return { success: false, error: result.message };
				}

				// Reload groups and conversations to reflect the new membership
				await Promise.all([
					this.loadGroups(userId),
					this.loadConversations(userId)
				]);

				return { success: true, data: result };
			} catch (error) {
				console.error('Failed to join group:', error);
				return { success: false, error: 'Failed to join group' };
			}
		},

		/**
		 * Create a direct conversation with another user
		 * @param {string} userId
		 * @param {string} otherUserId
		 * @returns {Promise<{success: boolean, data?: string, error?: string}>}
		 */
		async createDirectConversation(userId, otherUserId) {
			if (!browser) return { success: false, error: 'Not in browser environment' };

			try {
				const supabase = getSupabase();
				if (!supabase) throw new Error('Supabase client not available');

				const { data, error } = await supabase.rpc('create_direct_conversation', {
					user1_id: userId,
					user2_id: otherUserId
				});

				if (error) throw error;

				// Reload conversations to include the new one
				await this.loadConversations(userId);

				return { success: true, data };
			} catch (error) {
				console.error('Failed to create direct conversation:', error);
				return { success: false, error: 'Failed to create conversation' };
			}
		},

		/**
		 * Subscribe to real-time updates for a conversation
		 * @param {string} conversationId
		 * @param {Object} callbacks
		 */
		subscribeToConversation(conversationId, callbacks = {}) {
			if (!browser) return null;

			const supabase = getSupabase();
			if (!supabase) return null;

			const channel = supabase
				.channel(`conversation:${conversationId}`)
				.on(
					'postgres_changes',
					{
						event: 'INSERT',
						schema: 'public',
						table: 'messages',
						filter: `conversation_id=eq.${conversationId}`
					},
					(payload) => {
						this.handleNewMessage(payload.new);
						callbacks.onNewMessage?.(payload.new);
					}
				)
				.on(
					'postgres_changes',
					{
						event: 'UPDATE',
						schema: 'public',
						table: 'typing_indicators',
						filter: `conversation_id=eq.${conversationId}`
					},
					(payload) => {
						this.handleTypingChange(payload.new);
						callbacks.onTypingChange?.(payload.new);
					}
				)
				.subscribe();

			// Store channel reference for cleanup
			update(state => ({
				...state,
				realtimeChannels: {
					...state.realtimeChannels,
					[conversationId]: channel
				}
			}));

			return channel;
		},

		/**
		 * Handle new message from real-time subscription
		 * @param {Message} message
		 */
		handleNewMessage(message) {
			update(state => {
				// Avoid duplicates
				const exists = state.messages.some(msg => msg.id === message.id);
				if (exists) return state;

				return {
					...state,
					messages: [...state.messages, message]
				};
			});
		},

		/**
		 * Handle typing indicator changes
		 * @param {Object} typingData
		 */
		handleTypingChange(typingData) {
			update(state => {
				const { user_id, is_typing } = typingData;
				let newTypingUsers = [...state.typingUsers];

				if (is_typing) {
					if (!newTypingUsers.includes(user_id)) {
						newTypingUsers.push(user_id);
					}
				} else {
					newTypingUsers = newTypingUsers.filter(id => id !== user_id);
				}

				return {
					...state,
					typingUsers: newTypingUsers
				};
			});
		},

		/**
		 * Set typing indicator for current user
		 * @param {string} conversationId
		 * @param {string} userId
		 * @param {boolean} isTyping
		 */
		async setTypingIndicator(conversationId, userId, isTyping) {
			if (!browser) return;

			try {
				const supabase = getSupabase();
				if (!supabase) throw new Error('Supabase client not available');

				await supabase
					.from('typing_indicators')
					.upsert(
						{
							conversation_id: conversationId,
							user_id: userId,
							is_typing: isTyping,
							updated_at: new Date().toISOString()
						},
						{ onConflict: 'conversation_id,user_id' }
					);
			} catch (error) {
				console.error('Failed to set typing indicator:', error);
			}
		},

		/**
		 * Search conversations by name
		 * @param {string} query
		 * @returns {Conversation[]}
		 */
		searchConversations(query) {
			const state = get(chatState);
			if (!query.trim()) return state.conversations;

			const lowerQuery = query.toLowerCase();
			return state.conversations.filter(conv =>
				conv.conversation_name?.toLowerCase().includes(lowerQuery)
			);
		},

		/**
		 * Filter conversations by type
		 * @param {'direct' | 'group' | 'room'} type
		 * @returns {Conversation[]}
		 */
		filterConversationsByType(type) {
			const state = get(chatState);
			return state.conversations.filter(conv => conv.conversation_type === type);
		},

		/**
		 * Get unread message count
		 * @returns {number}
		 */
		getTotalUnreadCount() {
			const state = get(chatState);
			return state.conversations.reduce((total, conv) => total + conv.unread_count, 0);
		},

		/**
		 * Clean up real-time subscriptions
		 */
		cleanup() {
			const state = get(chatState);
			const supabase = getSupabase();
			
			if (supabase && state.realtimeChannels) {
				Object.values(state.realtimeChannels).forEach(channel => {
					if (channel && typeof channel.unsubscribe === 'function') {
						channel.unsubscribe();
					}
				});
			}

			update(state => ({
				...state,
				realtimeChannels: {}
			}));
		},

		// Utility methods for testing and state management
		setConversations(conversations) {
			update(state => ({ ...state, conversations }));
		},

		setMessages(messages) {
			update(state => ({ ...state, messages }));
		},

		setError(error) {
			update(state => ({ ...state, error }));
		},

		clearError() {
			update(state => ({ ...state, error: null }));
		}
	};
}

// Create and export the chat store
export const chat = createChatStore();

// Derived stores for convenience
export const conversations = derived(chat, $chat => $chat.conversations);
export const groups = derived(chat, $chat => $chat.groups);
export const activeConversation = derived(chat, $chat => $chat.activeConversation);
export const messages = derived(chat, $chat => $chat.messages);
export const isLoading = derived(chat, $chat => $chat.loading);
export const chatError = derived(chat, $chat => $chat.error);
export const typingUsers = derived(chat, $chat => $chat.typingUsers);
export const totalUnreadCount = derived(chat, $chat => 
	$chat.conversations.reduce((total, conv) => total + conv.unread_count, 0)
);

// Helper function to get store value (for testing)
function get(store) {
	let value;
	store.subscribe(v => value = v)();
	return value;
}

// Clean up subscriptions when the page unloads
if (browser) {
	window.addEventListener('beforeunload', () => {
		chat.cleanup();
	});
}