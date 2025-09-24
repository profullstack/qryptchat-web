/**
 * @fileoverview Supabase Realtime Bridge for WebSocket Server
 * Connects WebSocket server to Supabase Realtime for automatic cross-device sync
 */

import { createClient } from '@supabase/supabase-js';
import { roomManager } from './utils/rooms.js';
import { MESSAGE_TYPES, createMessage } from './utils/protocol.js';

/**
 * Supabase Realtime Bridge
 * Listens to Supabase database changes and broadcasts to WebSocket clients
 */
export class SupabaseRealtimeBridge {
	constructor() {
		this.supabase = null;
		this.channels = new Map(); // conversation_id -> channel
		this.isInitialized = false;
	}

	/**
	 * Initialize the bridge with Supabase connection
	 */
	async initialize() {
		if (this.isInitialized) return;

		try {
			// Create Supabase client with service role for server-side operations
			const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
			const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
			
			if (!supabaseUrl || !serviceRoleKey) {
				throw new Error('Missing Supabase environment variables');
			}

			this.supabase = createClient(supabaseUrl, serviceRoleKey, {
				auth: {
					autoRefreshToken: false,
					persistSession: false
				},
				realtime: {
					params: {
						eventsPerSecond: 10
					}
				}
			});

			console.log('🔗 [REALTIME-BRIDGE] Supabase Realtime Bridge initialized');
			this.isInitialized = true;

		} catch (error) {
			console.error('🔗 [REALTIME-BRIDGE] Failed to initialize:', error);
			throw error;
		}
	}

	/**
	 * Subscribe to conversation changes for cross-device sync
	 * @param {string} conversationId - Conversation ID to monitor
	 */
	subscribeToConversation(conversationId) {
		if (!this.isInitialized || !this.supabase || this.channels.has(conversationId)) {
			return;
		}

		console.log('🔗 [REALTIME-BRIDGE] Subscribing to conversation:', conversationId);

		const channel = this.supabase
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
				}
			)
			.subscribe();

		this.channels.set(conversationId, channel);
		console.log('🔗 [REALTIME-BRIDGE] Subscribed to conversation:', conversationId);
	}

	/**
	 * Unsubscribe from conversation changes
	 * @param {string} conversationId - Conversation ID to stop monitoring
	 */
	unsubscribeFromConversation(conversationId) {
		const channel = this.channels.get(conversationId);
		if (channel && this.supabase) {
			this.supabase.removeChannel(channel);
			this.channels.delete(conversationId);
			console.log('🔗 [REALTIME-BRIDGE] Unsubscribed from conversation:', conversationId);
		}
	}

	/**
	 * Handle new message from Supabase Realtime
	 * @param {Object} message - New message from database
	 */
	async handleNewMessage(message) {
		if (!message?.id) {
			console.error('🔗 [REALTIME-BRIDGE] Invalid message data:', message);
			return;
		}

		console.log('🔗 [REALTIME-BRIDGE] New message from Supabase:', message.id);

		try {
			if (!this.supabase) {
				console.error('🔗 [REALTIME-BRIDGE] Supabase client not available');
				return;
			}

			// Get full message data with sender info
			const { data: fullMessage, error } = await this.supabase
				.from('messages')
				.select(`
					*,
					sender:users!messages_sender_id_fkey(id, username, display_name, avatar_url)
				`)
				.eq('id', message.id)
				.single();

			if (error) {
				console.error('🔗 [REALTIME-BRIDGE] Error fetching full message:', error);
				return;
			}

			// Broadcast to WebSocket clients in the conversation room
			const wsMessage = createMessage(
				MESSAGE_TYPES.MESSAGE_RECEIVED,
				{ message: fullMessage }
			);

			if (message.conversation_id) {
				roomManager.broadcastToRoom(message.conversation_id, wsMessage);
				console.log('🔗 [REALTIME-BRIDGE] Broadcasted message to WebSocket clients');
			}

		} catch (error) {
			console.error('🔗 [REALTIME-BRIDGE] Error handling new message:', error);
		}
	}

	/**
	 * Handle typing indicator changes from Supabase Realtime
	 * @param {Object} typingData - Typing indicator data
	 */
	handleTypingChange(typingData) {
		if (!typingData?.conversation_id || !typingData?.user_id) {
			console.error('🔗 [REALTIME-BRIDGE] Invalid typing data:', typingData);
			return;
		}

		console.log('🔗 [REALTIME-BRIDGE] Typing change from Supabase:', typingData);

		// Broadcast typing indicator to WebSocket clients
		const wsMessage = createMessage(
			MESSAGE_TYPES.TYPING_UPDATE,
			{
				conversationId: typingData.conversation_id,
				userId: typingData.user_id,
				isTyping: typingData.is_typing
			}
		);

		roomManager.broadcastToRoom(typingData.conversation_id, wsMessage);
		console.log('🔗 [REALTIME-BRIDGE] Broadcasted typing indicator to WebSocket clients');
	}

	/**
	 * Auto-subscribe to conversations when users join rooms
	 * Called by room manager when users join conversations
	 * @param {string} conversationId - Conversation ID
	 */
	onRoomJoined(conversationId) {
		this.subscribeToConversation(conversationId);
	}

	/**
	 * Auto-unsubscribe when no users left in room
	 * Called by room manager when rooms become empty
	 * @param {string} conversationId - Conversation ID
	 */
	onRoomEmpty(conversationId) {
		this.unsubscribeFromConversation(conversationId);
	}

	/**
	 * Cleanup all subscriptions
	 */
	cleanup() {
		console.log('🔗 [REALTIME-BRIDGE] Cleaning up subscriptions');
		
		if (this.supabase) {
			for (const [conversationId, channel] of this.channels.entries()) {
				this.supabase.removeChannel(channel);
			}
		}
		
		this.channels.clear();
		console.log('🔗 [REALTIME-BRIDGE] Cleanup complete');
	}

	/**
	 * Get bridge statistics
	 * @returns {Object} Bridge statistics
	 */
	getStats() {
		return {
			initialized: this.isInitialized,
			activeSubscriptions: this.channels.size,
			conversations: Array.from(this.channels.keys())
		};
	}
}

// Export singleton instance
export const supabaseRealtimeBridge = new SupabaseRealtimeBridge();