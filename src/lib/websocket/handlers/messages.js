/**
 * @fileoverview WebSocket messages handler
 * Handles message-related operations like sending, loading, and real-time message updates
 */

import { MESSAGE_TYPES, createSuccessResponse, createErrorResponse } from '../utils/protocol.js';
import { roomManager } from '../utils/rooms.js';
import { isAuthenticated, getAuthenticatedUser, getSupabaseClient } from './auth.js';
import { createSMSNotificationService } from '../../services/sms-notification-service.js';

/**
 * Handle send message request
 * @param {WebSocket} ws - WebSocket connection
 * @param {Object} message - Send message request
 * @param {Object} context - WebSocket context
 */
export async function handleSendMessage(ws, message, context) {
	if (!isAuthenticated(context)) {
		const errorResponse = createErrorResponse(
			message.requestId,
			'Authentication required',
			'UNAUTHORIZED'
		);
		ws.send(JSON.stringify(errorResponse));
		return;
	}

	try {
		const { conversationId, content, messageType = 'text', replyToId } = message.payload;
		const user = getAuthenticatedUser(context);
		const supabase = getSupabaseClient(context);

		if (!conversationId || !content) {
			const errorResponse = createErrorResponse(
				message.requestId,
				'Conversation ID and content are required',
				'MISSING_REQUIRED_FIELDS'
			);
			ws.send(JSON.stringify(errorResponse));
			return;
		}

		// Verify user can access this conversation
		// Use the internal user ID (not auth_user_id) for conversation_participants lookup
		const { data: participant, error: participantError } = await supabase
			.from('conversation_participants')
			.select('id, role')
			.eq('conversation_id', conversationId)
			.eq('user_id', user.id)
			.single();

		if (participantError || !participant) {
			const errorResponse = createErrorResponse(
				message.requestId,
				'Access denied to conversation',
				'ACCESS_DENIED'
			);
			ws.send(JSON.stringify(errorResponse));
			return;
		}

		// TODO: Integrate encryption here
		// For now, we'll store the content as plain text (no encoding needed for bytea - Supabase handles it)
		// In production, this should be: encryptedContent = await encryptMessage(content, conversationKey)
		const encryptedContent = content;

		// Insert message into database
		const messageData = {
			conversation_id: conversationId,
			sender_id: user.id,
			message_type: messageType,
			encrypted_content: encryptedContent,
			...(replyToId && { reply_to_id: replyToId }),
			metadata: {},
			created_at: new Date().toISOString()
		};

		const { data: newMessage, error: insertError } = await supabase
			.from('messages')
			.insert(messageData)
			.select(`
				*,
				sender:users!messages_sender_id_fkey(id, username, display_name, avatar_url)
			`)
			.single();

		if (insertError) {
			console.error('Error inserting message:', insertError);
			const errorResponse = createErrorResponse(
				message.requestId,
				'Failed to send message',
				'DATABASE_ERROR'
			);
			ws.send(JSON.stringify(errorResponse));
			return;
		}

		// Update sender's activity (they just sent a message)
		try {
			await supabase.rpc('update_user_activity', { user_uuid: user.id });
		} catch (activityError) {
			console.error('Failed to update user activity:', activityError);
			// Don't fail the message send if activity tracking fails
		}

		// Send success response to sender
		const successResponse = createSuccessResponse(
			message.requestId,
			MESSAGE_TYPES.MESSAGE_SENT,
			{
				message: newMessage
			}
		);
		ws.send(JSON.stringify(successResponse));

		// Decode the encrypted_content for broadcasting (same as in load messages)
		if (newMessage.encrypted_content) {
			try {
				if (newMessage.encrypted_content instanceof Uint8Array) {
					newMessage.encrypted_content = new TextDecoder().decode(newMessage.encrypted_content);
				} else if (typeof newMessage.encrypted_content === 'string' && newMessage.encrypted_content.startsWith('\\x')) {
					const hexString = newMessage.encrypted_content.slice(2);
					const bytes = new Uint8Array(hexString.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
					newMessage.encrypted_content = new TextDecoder().decode(bytes);
				}
			} catch (error) {
				console.error('📨 [SEND] Error decoding message content for broadcast:', error);
				newMessage.encrypted_content = '[Message content unavailable]';
			}
		}

		// Broadcast message to all participants in the conversation
		const broadcastMessage = {
			type: MESSAGE_TYPES.MESSAGE_RECEIVED,
			payload: {
				message: newMessage
			},
			requestId: null,
			timestamp: new Date().toISOString()
		};

		console.log('📨 [SEND] Broadcasting message to room:', {
			conversationId,
			messageId: newMessage.id,
			roomUsers: roomManager.getRoomUsers(conversationId),
			totalConnections: roomManager.getTotalConnections()
		});

		// Broadcast to ALL participants, including the sender (they'll filter it out on client side if needed)
		roomManager.broadcastToRoom(conversationId, broadcastMessage);
		
		console.log('📨 [SEND] Room stats after broadcast:', {
			roomUsers: roomManager.getRoomUsers(conversationId),
			totalConnections: roomManager.getTotalConnections(),
			onlineUsers: roomManager.getOnlineUsers()
		});

		// Send SMS notifications to inactive participants
		try {
			const smsService = createSMSNotificationService(supabase);
			const senderName = user.display_name || user.username || 'Someone';
			const messagePreview = newMessage.encrypted_content || 'sent you a message';
			
			console.log('📨 [SMS] Checking for inactive participants to notify:', {
				conversationId,
				senderName,
				messagePreview: messagePreview.substring(0, 50) + '...',
				userId: user.id,
				userDetails: {
					id: user.id,
					username: user.username,
					display_name: user.display_name
				}
			});

			const smsResult = await smsService.notifyInactiveParticipants(
				conversationId,
				senderName,
				messagePreview
			);

			console.log('📨 [SMS] SMS notification result:', {
				success: smsResult.success,
				notificationsSent: smsResult.notificationsSent,
				totalParticipants: smsResult.totalParticipants,
				hasError: !!smsResult.error,
				errorMessage: smsResult.error,
				details: smsResult.details
			});

			if (!smsResult.success && smsResult.error) {
				console.error('📨 [SMS] SMS notification error details:', smsResult.error);
			}

		} catch (smsError) {
			console.error('📨 [SMS] Failed to send SMS notifications:', smsError);
			console.error('📨 [SMS] SMS error stack:', smsError.stack);
			// Don't fail the message send if SMS notifications fail
		}

	} catch (error) {
		console.error('Error sending message:', error);
		const errorResponse = createErrorResponse(
			message.requestId,
			'Failed to send message',
			'SERVER_ERROR'
		);
		ws.send(JSON.stringify(errorResponse));
	}
}

/**
 * Handle load messages request
 * @param {WebSocket} ws - WebSocket connection
 * @param {Object} message - Load messages request
 * @param {Object} context - WebSocket context
 */
export async function handleLoadMessages(ws, message, context) {
	console.log('📨 [MESSAGES] ==================== LOAD MESSAGES START ====================');
	console.log('📨 [MESSAGES] Message received:', JSON.stringify(message, null, 2));
	console.log('📨 [MESSAGES] Authentication check:', {
		isAuthenticated: isAuthenticated(context),
		hasContext: !!context,
		contextKeys: Object.keys(context || {})
	});
	
	if (!isAuthenticated(context)) {
		console.error('📨 [MESSAGES] ERROR: Authentication required');
		const errorResponse = createErrorResponse(
			message.requestId,
			'Authentication required',
			'UNAUTHORIZED'
		);
		ws.send(JSON.stringify(errorResponse));
		return;
	}

	try {
		const { conversationId, limit = 50 } = message.payload;
		const user = getAuthenticatedUser(context);
		const supabase = getSupabaseClient(context);

		console.log('📨 [MESSAGES] Request details:', {
			conversationId,
			limit,
			hasUser: !!user,
			userId: user?.id || 'N/A',
			username: user?.username || 'N/A',
			hasSupabase: !!supabase
		});

		if (!conversationId) {
			console.error('📨 [MESSAGES] ERROR: No conversation ID provided');
			const errorResponse = createErrorResponse(
				message.requestId,
				'Conversation ID is required',
				'MISSING_CONVERSATION_ID'
			);
			ws.send(JSON.stringify(errorResponse));
			return;
		}

		// Verify user can access this conversation
		console.log('📨 [MESSAGES] Checking participant access:', {
			conversationId,
			userId: user.id,
			authUserId: user.id  // This should be the same as userId (internal user ID)
		});

		const { data: participant, error: participantError } = await supabase
			.from('conversation_participants')
			.select('id')
			.eq('conversation_id', conversationId)
			.eq('user_id', user.id)
			.single();

		console.log('📨 [MESSAGES] Participant query result:', {
			hasParticipant: !!participant,
			participant,
			participantError: participantError ? {
				message: participantError.message,
				code: participantError.code,
				details: participantError.details,
				hint: participantError.hint
			} : null
		});

		if (participantError || !participant) {
			// Let's check what participants exist for this conversation
			console.log('📨 [MESSAGES] Access denied - checking all participants for conversation:', conversationId);
			const { data: allParticipants } = await supabase
				.from('conversation_participants')
				.select('*')
				.eq('conversation_id', conversationId);
			
			console.log('📨 [MESSAGES] All participants for conversation:', {
				conversationId,
				participantCount: allParticipants?.length || 0,
				participants: allParticipants?.map(p => ({
					user_id: p.user_id,
					joined_at: p.joined_at
				})) || []
			});

			console.error('📨 [MESSAGES] ERROR: Access denied to conversation');
			const errorResponse = createErrorResponse(
				message.requestId,
				'Access denied to conversation',
				'ACCESS_DENIED'
			);
			ws.send(JSON.stringify(errorResponse));
			return;
		}

		console.log('📨 [MESSAGES] SUCCESS: Access granted for participant:', participant);

		// Load messages for the conversation
		console.log('📨 [MESSAGES] Loading messages from database...');
		const { data: messages, error: messagesError } = await supabase
			.from('messages')
			.select(`
				*,
				sender:users!messages_sender_id_fkey(id, username, display_name, avatar_url)
			`)
			.eq('conversation_id', conversationId)
			.is('deleted_at', null)
			.order('created_at', { ascending: true })
			.limit(limit);

		console.log('📨 [MESSAGES] Messages query result:', {
			hasMessages: !!messages,
			messageCount: messages?.length || 0,
			messages: messages?.map(m => ({
				id: m.id,
				sender_id: m.sender_id,
				message_type: m.message_type,
				created_at: m.created_at,
				sender_username: m.sender?.username
			})) || [],
			messagesError: messagesError ? {
				message: messagesError.message,
				code: messagesError.code,
				details: messagesError.details,
				hint: messagesError.hint
			} : null
		});

		if (messagesError) {
			console.error('📨 [MESSAGES] ERROR: Failed to load messages');
			console.error('📨 [MESSAGES] Messages error details:', messagesError);
			const errorResponse = createErrorResponse(
				message.requestId,
				'Failed to load messages',
				'DATABASE_ERROR'
			);
			ws.send(JSON.stringify(errorResponse));
			return;
		}

		// Load reply data separately to avoid PostgREST issues
		let messagesWithReplies = messages || [];
		console.log('📨 [MESSAGES] Processing reply data for', messagesWithReplies.length, 'messages');
		
		// Decode encrypted_content from bytea to text for all messages
		if (messagesWithReplies.length > 0) {
			messagesWithReplies.forEach(msg => {
				if (msg.encrypted_content) {
					try {
						// If encrypted_content is bytea, decode it to text
						if (msg.encrypted_content instanceof Uint8Array) {
							msg.encrypted_content = new TextDecoder().decode(msg.encrypted_content);
						} else if (typeof msg.encrypted_content === 'string' && msg.encrypted_content.startsWith('\\x')) {
							// Handle PostgreSQL bytea hex format
							const hexString = msg.encrypted_content.slice(2); // Remove \x prefix
							const bytes = new Uint8Array(hexString.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
							msg.encrypted_content = new TextDecoder().decode(bytes);
						}
						// If it's already a string, leave it as is
					} catch (error) {
						console.error('📨 [MESSAGES] Error decoding message content:', error);
						msg.encrypted_content = '[Message content unavailable]';
					}
				}
			});
			
			const replyIds = messagesWithReplies
				.filter(msg => msg.reply_to_id)
				.map(msg => msg.reply_to_id);

			console.log('📨 [MESSAGES] Reply IDs found:', replyIds);

			if (replyIds.length > 0) {
				const { data: replyData } = await supabase
					.from('messages')
					.select('id, encrypted_content, sender_id')
					.in('id', replyIds);

				console.log('📨 [MESSAGES] Reply data loaded:', replyData?.length || 0, 'replies');

				// Map reply data to messages and decode reply content
				if (replyData) {
					replyData.forEach(reply => {
						if (reply.encrypted_content) {
							try {
								if (reply.encrypted_content instanceof Uint8Array) {
									reply.encrypted_content = new TextDecoder().decode(reply.encrypted_content);
								} else if (typeof reply.encrypted_content === 'string' && reply.encrypted_content.startsWith('\\x')) {
									const hexString = reply.encrypted_content.slice(2);
									const bytes = new Uint8Array(hexString.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
									reply.encrypted_content = new TextDecoder().decode(bytes);
								}
							} catch (error) {
								console.error('📨 [MESSAGES] Error decoding reply content:', error);
								reply.encrypted_content = '[Reply content unavailable]';
							}
						}
					});
					
					messagesWithReplies.forEach(msg => {
						if (msg.reply_to_id) {
							msg.reply_to = replyData.find(reply => reply.id === msg.reply_to_id);
						}
					});
				}
			}
		}

		const successResponse = createSuccessResponse(
			message.requestId,
			MESSAGE_TYPES.MESSAGES_LOADED,
			{
				messages: messagesWithReplies,
				conversationId
			}
		);

		console.log('📨 [MESSAGES] Sending success response with', messagesWithReplies.length, 'messages');
		console.log('📨 [MESSAGES] Response:', JSON.stringify(successResponse, null, 2));
		ws.send(JSON.stringify(successResponse));

		// Update user activity (they just loaded messages)
		try {
			await supabase.rpc('update_user_activity', { user_uuid: user.id });
		} catch (activityError) {
			console.error('Failed to update user activity:', activityError);
			// Don't fail the message load if activity tracking fails
		}

		// Mark messages as read
		if (messagesWithReplies.length > 0) {
			const messageIds = messagesWithReplies
				.filter(msg => msg.sender_id !== user.id)
				.map(msg => msg.id);
			
			console.log('📨 [MESSAGES] Marking', messageIds.length, 'messages as read');
			if (messageIds.length > 0) {
				await markMessagesAsRead(messageIds, user.id, supabase);
			}
		}

		console.log('📨 [MESSAGES] ==================== LOAD MESSAGES SUCCESS ====================');

	} catch (error) {
		console.error('📨 [MESSAGES] ==================== LOAD MESSAGES EXCEPTION ====================');
		console.error('📨 [MESSAGES] Exception details:', error);
		console.error('📨 [MESSAGES] Stack trace:', error.stack);
		const errorResponse = createErrorResponse(
			message.requestId,
			'Failed to load messages',
			'SERVER_ERROR'
		);
		ws.send(JSON.stringify(errorResponse));
	}
}

/**
 * Handle load more messages request (pagination)
 * @param {WebSocket} ws - WebSocket connection
 * @param {Object} message - Load more messages request
 * @param {Object} context - WebSocket context
 */
export async function handleLoadMoreMessages(ws, message, context) {
	if (!isAuthenticated(context)) {
		const errorResponse = createErrorResponse(
			message.requestId,
			'Authentication required',
			'UNAUTHORIZED'
		);
		ws.send(JSON.stringify(errorResponse));
		return;
	}

	try {
		const { conversationId, beforeMessageId, limit = 50 } = message.payload;
		const user = getAuthenticatedUser(context);
		const supabase = getSupabaseClient(context);

		if (!conversationId || !beforeMessageId) {
			const errorResponse = createErrorResponse(
				message.requestId,
				'Conversation ID and beforeMessageId are required',
				'MISSING_REQUIRED_FIELDS'
			);
			ws.send(JSON.stringify(errorResponse));
			return;
		}

		// Verify user can access this conversation
		const { data: participant, error: participantError } = await supabase
			.from('conversation_participants')
			.select('id')
			.eq('conversation_id', conversationId)
			.eq('user_id', user.id)
			.single();

		if (participantError || !participant) {
			const errorResponse = createErrorResponse(
				message.requestId,
				'Access denied to conversation',
				'ACCESS_DENIED'
			);
			ws.send(JSON.stringify(errorResponse));
			return;
		}

		// Get the timestamp of the before message
		const { data: beforeMessage } = await supabase
			.from('messages')
			.select('created_at')
			.eq('id', beforeMessageId)
			.single();

		if (!beforeMessage) {
			const errorResponse = createErrorResponse(
				message.requestId,
				'Before message not found',
				'MESSAGE_NOT_FOUND'
			);
			ws.send(JSON.stringify(errorResponse));
			return;
		}

		// Load older messages
		const { data: messages, error: messagesError } = await supabase
			.from('messages')
			.select(`
				*,
				sender:users!messages_sender_id_fkey(id, username, display_name, avatar_url)
			`)
			.eq('conversation_id', conversationId)
			.is('deleted_at', null)
			.lt('created_at', beforeMessage.created_at)
			.order('created_at', { ascending: false })
			.limit(limit);

		if (messagesError) {
			console.error('Error loading more messages:', messagesError);
			const errorResponse = createErrorResponse(
				message.requestId,
				'Failed to load more messages',
				'DATABASE_ERROR'
			);
			ws.send(JSON.stringify(errorResponse));
			return;
		}

		// Load reply data separately
		let messagesWithReplies = messages || [];
		if (messagesWithReplies.length > 0) {
			const replyIds = messagesWithReplies
				.filter(msg => msg.reply_to_id)
				.map(msg => msg.reply_to_id);

			if (replyIds.length > 0) {
				const { data: replyData } = await supabase
					.from('messages')
					.select('id, encrypted_content, sender_id')
					.in('id', replyIds);

				if (replyData) {
					messagesWithReplies.forEach(msg => {
						if (msg.reply_to_id) {
							msg.reply_to = replyData.find(reply => reply.id === msg.reply_to_id);
						}
					});
				}
			}
		}

		const successResponse = createSuccessResponse(
			message.requestId,
			MESSAGE_TYPES.MESSAGES_LOADED,
			{
				messages: messagesWithReplies.reverse(), // Reverse to maintain chronological order
				conversationId,
				hasMore: messagesWithReplies.length === limit
			}
		);

		ws.send(JSON.stringify(successResponse));

	} catch (error) {
		console.error('Error loading more messages:', error);
		const errorResponse = createErrorResponse(
			message.requestId,
			'Failed to load more messages',
			'SERVER_ERROR'
		);
		ws.send(JSON.stringify(errorResponse));
	}
}

/**
 * Mark messages as read
 * @param {string[]} messageIds - Array of message IDs
 * @param {string} userId - User ID
 * @param {Object} supabase - Supabase client
 */
async function markMessagesAsRead(messageIds, userId, supabase) {
	try {
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
}