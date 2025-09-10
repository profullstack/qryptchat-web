/**
 * @fileoverview WebSocket messages handler
 * Handles message-related operations like sending, loading, and real-time message updates
 */

import { MESSAGE_TYPES, createSuccessResponse, createErrorResponse } from '../utils/protocol.js';
import { roomManager } from '../utils/rooms.js';
import { isAuthenticated, getAuthenticatedUser, getSupabaseClient } from './auth.js';
import { createSMSNotificationService } from '../../services/sms-notification-service.js';
import { getServiceRoleClient } from '../../supabase/service-role.js';

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
		const { conversationId, encryptedContents, messageType = 'text', replyToId } = message.payload;
		const user = getAuthenticatedUser(context);
		const supabase = getSupabaseClient(context);

		if (!conversationId || !encryptedContents) {
			const errorResponse = createErrorResponse(
				message.requestId,
				'Conversation ID and encrypted contents are required',
				'MISSING_REQUIRED_FIELDS'
			);
			ws.send(JSON.stringify(errorResponse));
			return;
		}

		// Validate encryptedContents is an object with user_id -> encrypted_content mappings
		if (typeof encryptedContents !== 'object' || Object.keys(encryptedContents).length === 0) {
			const errorResponse = createErrorResponse(
				message.requestId,
				'encryptedContents must be an object with user_id -> encrypted_content mappings',
				'INVALID_ENCRYPTED_CONTENTS'
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

		// Insert message into database (without encrypted_content in main table)
		const messageData = {
			conversation_id: conversationId,
			sender_id: user.id,
			message_type: messageType,
			encrypted_content: Buffer.from(''), // Empty buffer - actual content stored in message_recipients
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

		// Create per-participant encrypted message copies using service role client
		try {
			// Store JSON encrypted content directly as base64 in database
			// The post-quantum encryption returns JSON strings, and we'll store them as base64
			const base64EncryptedContents = {};
			for (const [userId, jsonEncryptedContent] of Object.entries(encryptedContents)) {
				console.log('🔐 [SEND] Processing encrypted content for storage:', {
					userId,
					jsonType: typeof jsonEncryptedContent,
					jsonLength: jsonEncryptedContent?.length || 0,
					jsonPreview: jsonEncryptedContent?.substring(0, 100) || 'N/A',
					isValidJSON: (() => {
						try {
							JSON.parse(jsonEncryptedContent);
							return true;
						} catch {
							return false;
						}
					})()
				});
				
				// Convert JSON string to base64 for database storage
				const base64Content = Buffer.from(jsonEncryptedContent, 'utf8').toString('base64');
				console.log('🔐 [SEND] Converted to base64 for database:', {
					userId,
					base64Length: base64Content?.length || 0,
					base64Preview: base64Content?.substring(0, 100) || 'N/A',
					isValidBase64: /^[A-Za-z0-9+/]*={0,2}$/.test(base64Content || '')
				});
				
				base64EncryptedContents[userId] = base64Content;
			}

			const serviceRoleClient = getServiceRoleClient();
			const { error: recipientsError } = await serviceRoleClient
				.rpc('fn_create_message_recipients', {
					p_message_id: newMessage.id,
					p_encrypted_contents: base64EncryptedContents
				});

			if (recipientsError) {
				console.error('Error creating message recipients:', recipientsError);
				// Clean up the message if recipients creation failed
				await supabase
					.from('messages')
					.delete()
					.eq('id', newMessage.id);
				
				const errorResponse = createErrorResponse(
					message.requestId,
					'Failed to create encrypted message copies',
					'DATABASE_ERROR'
				);
				ws.send(JSON.stringify(errorResponse));
				return;
			}
		} catch (error) {
			console.error('Error in message recipients creation:', error);
			// Clean up the message if recipients creation failed
			await supabase
				.from('messages')
				.delete()
				.eq('id', newMessage.id);
			
			const errorResponse = createErrorResponse(
				message.requestId,
				'Failed to create encrypted message copies',
				'SERVER_ERROR'
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

		// Server passes through encrypted content exactly as stored in database
		// No server-side decoding - clients handle all encryption/decryption

		// For broadcasting, we need to send the message with proper encrypted content for each participant
		// Since we can't send different content to each user in a single broadcast, we'll reload messages
		// This ensures each client gets the proper encrypted content for their user
		const broadcastMessage = {
			type: MESSAGE_TYPES.MESSAGE_RECEIVED,
			payload: {
				message: newMessage,
				// Signal that clients should reload messages to get proper encrypted content
				shouldReloadMessages: true
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

		// Broadcast to ALL participants - they'll reload messages to get proper encrypted content
		roomManager.broadcastToRoom(conversationId, broadcastMessage);
		
		console.log('📨 [SEND] Room stats after broadcast:', {
			roomUsers: roomManager.getRoomUsers(conversationId),
			totalConnections: roomManager.getTotalConnections(),
			onlineUsers: roomManager.getOnlineUsers()
		});

		// Send SMS notifications to inactive participants
		try {
			const smsService = await createSMSNotificationService(supabase);
			const senderName = user.display_name || user.username || 'Someone';
			
			console.log('📨 [SMS] Checking for inactive participants to notify:', {
				conversationId,
				senderName,
				userId: user.id,
				userDetails: {
					id: user.id,
					username: user.username,
					display_name: user.display_name
				}
			});

			const smsResult = await smsService.notifyInactiveParticipants(
				conversationId,
				senderName
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

		// Load messages for the conversation with user-specific encrypted content
		console.log('📨 [MESSAGES] Loading messages from database...');
		console.log('📨 [MESSAGES] Filtering for recipient_user_id:', user.id);
		console.log('📨 [MESSAGES] User details:', {
			id: user.id,
			username: user.username,
			auth_user_id: user.auth_user_id
		});
		const { data: messages, error: messagesError } = await supabase
			.from('messages')
			.select(`
				*,
				sender:users!messages_sender_id_fkey(id, username, display_name, avatar_url),
				message_recipients!inner(encrypted_content, recipient_user_id)
			`)
			.eq('conversation_id', conversationId)
			.eq('message_recipients.recipient_user_id', user.id)
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

		// Process messages and add user-specific encrypted content
		let messagesWithReplies = messages || [];
		console.log('📨 [MESSAGES] Processing reply data for', messagesWithReplies.length, 'messages');
		
		// Add user-specific encrypted content to each message
		messagesWithReplies.forEach(msg => {
			if (msg.message_recipients && msg.message_recipients.length > 0) {
				// Database now stores base64 as TEXT, convert back to JSON for client-side decryption
				const base64Content = msg.message_recipients[0].encrypted_content;
				console.log('🔐 [LOAD] Raw base64 from database:', {
					messageId: msg.id,
					base64Length: base64Content?.length || 0,
					base64Preview: base64Content?.substring(0, 100) || 'N/A',
					isValidBase64: /^[A-Za-z0-9+/]*={0,2}$/.test(base64Content || '')
				});
				
				try {
					// Convert base64 back to JSON string for client-side decryption
					const decodedContent = Buffer.from(base64Content, 'base64').toString('utf8');
					console.log('🔐 [LOAD] Decoded JSON content:', {
						messageId: msg.id,
						decodedLength: decodedContent?.length || 0,
						decodedPreview: decodedContent?.substring(0, 100) || 'N/A',
						isValidJSON: (() => {
							try {
								JSON.parse(decodedContent);
								return true;
							} catch {
								return false;
							}
						})()
					});
					msg.encrypted_content = decodedContent;
				} catch (error) {
					console.error('🔐 [LOAD] Failed to decode base64 encrypted content:', error);
					console.error('🔐 [LOAD] Raw base64 that failed:', base64Content);
					// Fallback to original content if decoding fails
					msg.encrypted_content = base64Content;
				}
			}
			// Remove the message_recipients array as it's no longer needed
			delete msg.message_recipients;
		});
		
		// Server passes through encrypted content exactly as stored in database
		// No server-side decoding - clients handle all encryption/decryption
		
		if (messagesWithReplies.length > 0) {
			const replyIds = messagesWithReplies
				.filter(msg => msg.reply_to_id)
				.map(msg => msg.reply_to_id);

			console.log('📨 [MESSAGES] Reply IDs found:', replyIds);

			if (replyIds.length > 0) {
				// Load reply data with user-specific encrypted content
				const { data: replyData } = await supabase
					.from('messages')
					.select(`
						id,
						sender_id,
						message_recipients!inner(encrypted_content)
					`)
					.in('id', replyIds)
					.eq('message_recipients.recipient_user_id', user.id);

				console.log('📨 [MESSAGES] Reply data loaded:', replyData?.length || 0, 'replies');

				// Map reply data to messages - no server-side decoding
				if (replyData) {
					messagesWithReplies.forEach(msg => {
						if (msg.reply_to_id) {
							const replyMsg = replyData.find(reply => reply.id === msg.reply_to_id);
							if (replyMsg && replyMsg.message_recipients && replyMsg.message_recipients.length > 0) {
								// Database now stores base64 as TEXT, convert back to JSON for reply content
								const base64ReplyContent = replyMsg.message_recipients[0].encrypted_content;
								let replyEncryptedContent;
								try {
									replyEncryptedContent = Buffer.from(base64ReplyContent, 'base64').toString('utf8');
								} catch (error) {
									console.error('🔐 [LOAD] Failed to decode base64 reply content:', error);
									replyEncryptedContent = base64ReplyContent;
								}
								
								msg.reply_to = {
									id: replyMsg.id,
									sender_id: replyMsg.sender_id,
									encrypted_content: replyEncryptedContent
								};
							}
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

		// Load older messages with user-specific encrypted content
		const { data: messages, error: messagesError } = await supabase
			.from('messages')
			.select(`
				*,
				sender:users!messages_sender_id_fkey(id, username, display_name, avatar_url),
				message_recipients!inner(encrypted_content)
			`)
			.eq('conversation_id', conversationId)
			.eq('message_recipients.recipient_user_id', user.id)
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

		// Process messages and add user-specific encrypted content
		let messagesWithReplies = messages || [];
		messagesWithReplies.forEach(msg => {
			if (msg.message_recipients && msg.message_recipients.length > 0) {
				// Database now stores base64 as TEXT, convert back to JSON for client-side decryption
				const base64Content = msg.message_recipients[0].encrypted_content;
				try {
					// Convert base64 back to JSON string for client-side decryption
					msg.encrypted_content = Buffer.from(base64Content, 'base64').toString('utf8');
				} catch (error) {
					console.error('🔐 [LOAD_MORE] Failed to decode base64 encrypted content:', error);
					// Fallback to original content if decoding fails
					msg.encrypted_content = base64Content;
				}
			}
			// Remove the message_recipients array as it's no longer needed
			delete msg.message_recipients;
		});
		
		if (messagesWithReplies.length > 0) {
			const replyIds = messagesWithReplies
				.filter(msg => msg.reply_to_id)
				.map(msg => msg.reply_to_id);

			if (replyIds.length > 0) {
				// Load reply data with user-specific encrypted content
				const { data: replyData } = await supabase
					.from('messages')
					.select(`
						id,
						sender_id,
						message_recipients!inner(encrypted_content)
					`)
					.in('id', replyIds)
					.eq('message_recipients.recipient_user_id', user.id);

				if (replyData) {
					messagesWithReplies.forEach(msg => {
						if (msg.reply_to_id) {
							const replyMsg = replyData.find(reply => reply.id === msg.reply_to_id);
							if (replyMsg && replyMsg.message_recipients && replyMsg.message_recipients.length > 0) {
								// Database now stores base64 as TEXT, convert back to JSON for reply content
								const base64ReplyContent = replyMsg.message_recipients[0].encrypted_content;
								let replyEncryptedContent;
								try {
									replyEncryptedContent = Buffer.from(base64ReplyContent, 'base64').toString('utf8');
								} catch (error) {
									console.error('🔐 [LOAD_MORE] Failed to decode base64 reply content:', error);
									replyEncryptedContent = base64ReplyContent;
								}
								
								msg.reply_to = {
									id: replyMsg.id,
									sender_id: replyMsg.sender_id,
									encrypted_content: replyEncryptedContent
								};
							}
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