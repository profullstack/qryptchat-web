/**
 * @fileoverview Supabase client configuration for QryptChat
 * Handles authentication, database operations, and real-time subscriptions
 */

import { createBrowserClient, createServerClient, isBrowser } from '@supabase/ssr';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

/**
 * Create Supabase client for browser usage
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
export function createSupabaseClient() {
	return createBrowserClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
		auth: {
			autoRefreshToken: true,
			persistSession: true,
			detectSessionInUrl: true
		},
		realtime: {
			params: {
				eventsPerSecond: 10
			}
		}
	});
}

/**
 * Create Supabase client for server-side usage
 * @param {import('@sveltejs/kit').RequestEvent} event
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
export function createSupabaseServerClient(event) {
	return createServerClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
		cookies: {
			get: (key) => event.cookies.get(key),
			set: (key, value, options) => {
				event.cookies.set(key, value, { ...options, path: '/' });
			},
			remove: (key, options) => {
				event.cookies.delete(key, { ...options, path: '/' });
			}
		}
	});
}

/**
 * Database helper functions for common operations
 */
export class SupabaseHelpers {
	/**
	 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
	 */
	constructor(supabase) {
		this.supabase = supabase;
	}

	/**
	 * Get user profile by ID
	 * @param {string} userId
	 * @returns {Promise<{data: any, error: any}>}
	 */
	async getUserProfile(userId) {
		try {
			const { data, error } = await this.supabase
				.from('users')
				.select('*')
				.eq('id', userId)
				.single();

			return { data, error };
		} catch (error) {
			return { data: null, error };
		}
	}

	/**
	 * Update user profile
	 * @param {string} userId
	 * @param {object} updates
	 * @returns {Promise<{data: any, error: any}>}
	 */
	async updateUserProfile(userId, updates) {
		try {
			const { data, error } = await this.supabase
				.from('users')
				.update({ ...updates, updated_at: new Date().toISOString() })
				.eq('id', userId)
				.select()
				.single();

			return { data, error };
		} catch (error) {
			return { data: null, error };
		}
	}

	/**
	 * Get user conversations
	 * @param {string} userId
	 * @returns {Promise<{data: any[], error: any}>}
	 */
	async getUserConversations(userId) {
		try {
			const { data, error } = await this.supabase.rpc('get_user_conversations', {
				user_uuid: userId
			});

			return { data: data || [], error };
		} catch (error) {
			return { data: [], error };
		}
	}

	/**
	 * Create a direct conversation between two users
	 * @param {string} user1Id
	 * @param {string} user2Id
	 * @returns {Promise<{data: any, error: any}>}
	 */
	async createDirectConversation(user1Id, user2Id) {
		try {
			const { data, error } = await this.supabase.rpc('create_direct_conversation', {
				user1_id: user1Id,
				user2_id: user2Id
			});

			return { data, error };
		} catch (error) {
			return { data: null, error };
		}
	}

	/**
	 * Send a message to a conversation
	 * @param {object} messageData
	 * @returns {Promise<{data: any, error: any}>}
	 */
	async sendMessage(messageData) {
		try {
			const { data, error } = await this.supabase
				.from('messages')
				.insert([messageData])
				.select()
				.single();

			return { data, error };
		} catch (error) {
			return { data: null, error };
		}
	}

	/**
	 * Get messages for a conversation
	 * @param {string} conversationId
	 * @param {number} limit
	 * @param {string|null} before - Message ID to paginate before
	 * @returns {Promise<{data: any[], error: any}>}
	 */
	async getMessages(conversationId, limit = 50, before = null) {
		try {
			let query = this.supabase
				.from('messages')
				.select(`
					*,
					sender:users!messages_sender_id_fkey(id, username, display_name, avatar_url),
					reply_to:messages!messages_reply_to_id_fkey(id, encrypted_content, sender_id)
				`)
				.eq('conversation_id', conversationId)
				.is('deleted_at', null)
				.order('created_at', { ascending: false })
				.limit(limit);

			if (before) {
				const { data: beforeMessage } = await this.supabase
					.from('messages')
					.select('created_at')
					.eq('id', before)
					.single();

				if (beforeMessage) {
					query = query.lt('created_at', beforeMessage.created_at);
				}
			}

			const { data, error } = await query;

			return { data: data || [], error };
		} catch (error) {
			return { data: [], error };
		}
	}

	/**
	 * Update message read status
	 * @param {string} messageId
	 * @param {string} userId
	 * @returns {Promise<{data: any, error: any}>}
	 */
	async markMessageAsRead(messageId, userId) {
		try {
			const { data, error } = await this.supabase
				.from('message_status')
				.upsert(
					{
						message_id: messageId,
						user_id: userId,
						status: 'read',
						timestamp: new Date().toISOString()
					},
					{ onConflict: 'message_id,user_id' }
				)
				.select()
				.single();

			return { data, error };
		} catch (error) {
			return { data: null, error };
		}
	}

	/**
	 * Update user presence
	 * @param {string} userId
	 * @param {string} status - 'online', 'away', 'busy', 'offline'
	 * @returns {Promise<{data: any, error: any}>}
	 */
	async updatePresence(userId, status) {
		try {
			const { data, error } = await this.supabase
				.from('user_presence')
				.upsert(
					{
						user_id: userId,
						status,
						last_seen: new Date().toISOString(),
						updated_at: new Date().toISOString()
					},
					{ onConflict: 'user_id' }
				)
				.select()
				.single();

			return { data, error };
		} catch (error) {
			return { data: null, error };
		}
	}

	/**
	 * Set typing indicator
	 * @param {string} conversationId
	 * @param {string} userId
	 * @param {boolean} isTyping
	 * @returns {Promise<{data: any, error: any}>}
	 */
	async setTypingIndicator(conversationId, userId, isTyping) {
		try {
			const { data, error } = await this.supabase
				.from('typing_indicators')
				.upsert(
					{
						conversation_id: conversationId,
						user_id: userId,
						is_typing: isTyping,
						updated_at: new Date().toISOString()
					},
					{ onConflict: 'conversation_id,user_id' }
				)
				.select()
				.single();

			return { data, error };
		} catch (error) {
			return { data: null, error };
		}
	}

	/**
	 * Subscribe to real-time changes for a conversation
	 * @param {string} conversationId
	 * @param {{onNewMessage?: function, onTypingChange?: function, onPresenceChange?: function}} callbacks
	 * @returns {import('@supabase/supabase-js').RealtimeChannel}
	 */
	subscribeToConversation(conversationId, callbacks = {}) {
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
					callbacks.onTypingChange?.(payload.new);
				}
			)
			.on(
				'postgres_changes',
				{
					event: '*',
					schema: 'public',
					table: 'user_presence'
				},
				(payload) => {
					callbacks.onPresenceChange?.(payload.new);
				}
			)
			.subscribe();

		return channel;
	}

	/**
	 * Subscribe to user's conversations list
	 * @param {string} userId
	 * @param {function} callback
	 * @returns {import('@supabase/supabase-js').RealtimeChannel}
	 */
	subscribeToUserConversations(userId, callback) {
		const channel = this.supabase
			.channel(`user_conversations:${userId}`)
			.on(
				'postgres_changes',
				{
					event: '*',
					schema: 'public',
					table: 'conversation_participants',
					filter: `user_id=eq.${userId}`
				},
				() => {
					// Refetch conversations when participants change
					this.getUserConversations(userId).then(({ data, error }) => {
						if (!error) {
							callback(data);
						}
					});
				}
			)
			.on(
				'postgres_changes',
				{
					event: 'INSERT',
					schema: 'public',
					table: 'messages'
				},
				() => {
					// Refetch conversations when new messages arrive
					this.getUserConversations(userId).then(({ data, error }) => {
						if (!error) {
							callback(data);
						}
					});
				}
			)
			.subscribe();

		return channel;
	}
}

// Export singleton instance for browser usage
export const supabase = isBrowser() ? createSupabaseClient() : null;
export const supabaseHelpers = supabase ? new SupabaseHelpers(supabase) : null;