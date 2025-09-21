/**
 * @fileoverview WebSocket voice call handler
 * Handles voice/video call signaling and WebRTC coordination
 */

import { MESSAGE_TYPES, createSuccessResponse, createErrorResponse } from '../utils/protocol.js';
import { roomManager } from '../utils/rooms.js';
import { isAuthenticated, getAuthenticatedUser, getSupabaseClient } from './auth.js';

/**
 * Handle call offer request
 * @param {WebSocket} ws - WebSocket connection
 * @param {Object} message - Call offer message
 * @param {Object} context - WebSocket context
 */
export async function handleCallOffer(ws, message, context) {
	console.log('📞 [OFFER] ==================== CALL OFFER START ====================');
	console.log('📞 [OFFER] Message received:', JSON.stringify(message, null, 2));

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
		const { targetUserId, callType = 'voice', sdpOffer } = message.payload;
		const user = getAuthenticatedUser(context);
		const supabase = getSupabaseClient(context);

		console.log('📞 [OFFER] Call offer details:', {
			from: user.id,
			to: targetUserId,
			callType,
			hasSdpOffer: !!sdpOffer
		});

		if (!targetUserId) {
			const errorResponse = createErrorResponse(
				message.requestId,
				'Target user ID is required',
				'MISSING_TARGET_USER'
			);
			ws.send(JSON.stringify(errorResponse));
			return;
		}

		// Get target user details
		const { data: targetUser, error: userError } = await supabase
			.from('users')
			.select('id, username, display_name, avatar_url')
			.eq('id', targetUserId)
			.single();

		if (userError || !targetUser) {
			const errorResponse = createErrorResponse(
				message.requestId,
				'Target user not found',
				'USER_NOT_FOUND'
			);
			ws.send(JSON.stringify(errorResponse));
			return;
		}

		// Generate call ID
		const callId = `call-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;

		// Store call in database for history
		const callData = {
			id: callId,
			caller_id: user.id,
			recipient_id: targetUserId,
			call_type: callType,
			status: 'ringing',
			started_at: new Date().toISOString()
		};

		const { error: callInsertError } = await supabase
			.from('voice_calls')
			.insert(callData);

		if (callInsertError) {
			console.error('📞 [OFFER] Failed to insert call record:', callInsertError);
			// Continue anyway - don't fail the call if history fails
		}

		// Send call offer to target user
		const callOfferMessage = {
			type: MESSAGE_TYPES.CALL_OFFER,
			payload: {
				callId,
				from: user.id,
				fromName: user.display_name || user.username,
				fromAvatar: user.avatar_url,
				callType,
				sdpOffer
			},
			requestId: message.requestId,
			timestamp: new Date().toISOString()
		};

		// Send offer to target user via room manager
		const targetConnections = roomManager.getUserConnections(targetUserId);
		if (targetConnections.length > 0) {
			targetConnections.forEach(targetWs => {
				targetWs.send(JSON.stringify(callOfferMessage));
			});
			console.log('📞 [OFFER] Call offer sent to target user:', targetUserId);
		} else {
			console.log('📞 [OFFER] Target user not online:', targetUserId);
			// TODO: Could implement push notifications here
		}

		// Send success response to caller
		const successResponse = createSuccessResponse(
			message.requestId,
			MESSAGE_TYPES.CALL_STATUS,
			{
				callId,
				status: 'calling',
				targetUser: {
					id: targetUser.id,
					username: targetUser.username,
					displayName: targetUser.display_name,
					avatarUrl: targetUser.avatar_url
				}
			}
		);
		ws.send(JSON.stringify(successResponse));

		console.log('📞 [OFFER] ==================== CALL OFFER SUCCESS ====================');

	} catch (error) {
		console.error('📞 [OFFER] ==================== CALL OFFER EXCEPTION ====================');
		console.error('📞 [OFFER] Exception details:', error);
		const errorResponse = createErrorResponse(
			message.requestId,
			'Failed to initiate call',
			'SERVER_ERROR'
		);
		ws.send(JSON.stringify(errorResponse));
	}
}

/**
 * Handle call answer request
 * @param {WebSocket} ws - WebSocket connection
 * @param {Object} message - Call answer message
 * @param {Object} context - WebSocket context
 */
export async function handleCallAnswer(ws, message, context) {
	console.log('📞 [ANSWER] ==================== CALL ANSWER START ====================');

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
		const { callId, sdpAnswer } = message.payload;
		const user = getAuthenticatedUser(context);
		const supabase = getSupabaseClient(context);

		console.log('📞 [ANSWER] Call answer details:', {
			callId,
			from: user.id,
			hasSdpAnswer: !!sdpAnswer
		});

		if (!callId) {
			const errorResponse = createErrorResponse(
				message.requestId,
				'Call ID is required',
				'MISSING_CALL_ID'
			);
			ws.send(JSON.stringify(errorResponse));
			return;
		}

		// Get call details and verify user is the recipient
		const { data: call, error: callError } = await supabase
			.from('voice_calls')
			.select('*, caller:users!voice_calls_caller_id_fkey(id, username, display_name, avatar_url)')
			.eq('id', callId)
			.eq('recipient_id', user.id)
			.single();

		if (callError || !call) {
			const errorResponse = createErrorResponse(
				message.requestId,
				'Call not found or access denied',
				'CALL_NOT_FOUND'
			);
			ws.send(JSON.stringify(errorResponse));
			return;
		}

		// Update call status to connected
		await supabase
			.from('voice_calls')
			.update({ 
				status: 'connected', 
				connected_at: new Date().toISOString() 
			})
			.eq('id', callId);

		// Send answer to caller
		const callAnswerMessage = {
			type: MESSAGE_TYPES.CALL_ANSWER,
			payload: {
				callId,
				from: user.id,
				fromName: user.display_name || user.username,
				sdpAnswer
			},
			requestId: null,
			timestamp: new Date().toISOString()
		};

		// Send answer to caller
		const callerConnections = roomManager.getUserConnections(call.caller_id);
		callerConnections.forEach(callerWs => {
			callerWs.send(JSON.stringify(callAnswerMessage));
		});

		// Send success response to recipient
		const successResponse = createSuccessResponse(
			message.requestId,
			MESSAGE_TYPES.CALL_STATUS,
			{
				callId,
				status: 'connected',
				caller: call.caller
			}
		);
		ws.send(JSON.stringify(successResponse));

		console.log('📞 [ANSWER] ==================== CALL ANSWER SUCCESS ====================');

	} catch (error) {
		console.error('📞 [ANSWER] Exception details:', error);
		const errorResponse = createErrorResponse(
			message.requestId,
			'Failed to answer call',
			'SERVER_ERROR'
		);
		ws.send(JSON.stringify(errorResponse));
	}
}

/**
 * Handle call decline request
 * @param {WebSocket} ws - WebSocket connection
 * @param {Object} message - Call decline message
 * @param {Object} context - WebSocket context
 */
export async function handleCallDecline(ws, message, context) {
	console.log('📞 [DECLINE] ==================== CALL DECLINE START ====================');

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
		const { callId } = message.payload;
		const user = getAuthenticatedUser(context);
		const supabase = getSupabaseClient(context);

		if (!callId) {
			const errorResponse = createErrorResponse(
				message.requestId,
				'Call ID is required',
				'MISSING_CALL_ID'
			);
			ws.send(JSON.stringify(errorResponse));
			return;
		}

		// Get call details
		const { data: call, error: callError } = await supabase
			.from('voice_calls')
			.select('caller_id, recipient_id')
			.eq('id', callId)
			.single();

		if (callError || !call) {
			const errorResponse = createErrorResponse(
				message.requestId,
				'Call not found',
				'CALL_NOT_FOUND'
			);
			ws.send(JSON.stringify(errorResponse));
			return;
		}

		// Update call status to declined
		await supabase
			.from('voice_calls')
			.update({ 
				status: 'declined', 
				ended_at: new Date().toISOString() 
			})
			.eq('id', callId);

		// Notify caller of decline
		const callDeclineMessage = {
			type: MESSAGE_TYPES.CALL_DECLINE,
			payload: {
				callId,
				from: user.id
			},
			requestId: null,
			timestamp: new Date().toISOString()
		};

		// Send decline to caller
		const callerConnections = roomManager.getUserConnections(call.caller_id);
		callerConnections.forEach(callerWs => {
			callerWs.send(JSON.stringify(callDeclineMessage));
		});

		// Send success response to decliner
		const successResponse = createSuccessResponse(
			message.requestId,
			MESSAGE_TYPES.CALL_STATUS,
			{
				callId,
				status: 'declined'
			}
		);
		ws.send(JSON.stringify(successResponse));

		console.log('📞 [DECLINE] ==================== CALL DECLINE SUCCESS ====================');

	} catch (error) {
		console.error('📞 [DECLINE] Exception details:', error);
		const errorResponse = createErrorResponse(
			message.requestId,
			'Failed to decline call',
			'SERVER_ERROR'
		);
		ws.send(JSON.stringify(errorResponse));
	}
}

/**
 * Handle call end request
 * @param {WebSocket} ws - WebSocket connection
 * @param {Object} message - Call end message
 * @param {Object} context - WebSocket context
 */
export async function handleCallEnd(ws, message, context) {
	console.log('📞 [END] ==================== CALL END START ====================');

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
		const { callId } = message.payload;
		const user = getAuthenticatedUser(context);
		const supabase = getSupabaseClient(context);

		if (!callId) {
			const errorResponse = createErrorResponse(
				message.requestId,
				'Call ID is required',
				'MISSING_CALL_ID'
			);
			ws.send(JSON.stringify(errorResponse));
			return;
		}

		// Get call details
		const { data: call, error: callError } = await supabase
			.from('voice_calls')
			.select('caller_id, recipient_id, status, started_at')
			.eq('id', callId)
			.single();

		if (callError || !call) {
			const errorResponse = createErrorResponse(
				message.requestId,
				'Call not found',
				'CALL_NOT_FOUND'
			);
			ws.send(JSON.stringify(errorResponse));
			return;
		}

		// Calculate call duration if it was connected
		let duration = null;
		if (call.status === 'connected' && call.started_at) {
			duration = Math.floor((Date.now() - new Date(call.started_at).getTime()) / 1000);
		}

		// Update call status to ended
		await supabase
			.from('voice_calls')
			.update({ 
				status: 'ended', 
				ended_at: new Date().toISOString(),
				...(duration && { duration_seconds: duration })
			})
			.eq('id', callId);

		// Notify other participant of call end
		const otherUserId = call.caller_id === user.id ? call.recipient_id : call.caller_id;
		const callEndMessage = {
			type: MESSAGE_TYPES.CALL_END,
			payload: {
				callId,
				from: user.id,
				duration
			},
			requestId: null,
			timestamp: new Date().toISOString()
		};

		// Send end to other participant
		const otherConnections = roomManager.getUserConnections(otherUserId);
		otherConnections.forEach(otherWs => {
			otherWs.send(JSON.stringify(callEndMessage));
		});

		// Send success response to sender
		const successResponse = createSuccessResponse(
			message.requestId,
			MESSAGE_TYPES.CALL_STATUS,
			{
				callId,
				status: 'ended',
				duration
			}
		);
		ws.send(JSON.stringify(successResponse));

		console.log('📞 [END] ==================== CALL END SUCCESS ====================');

	} catch (error) {
		console.error('📞 [END] Exception details:', error);
		const errorResponse = createErrorResponse(
			message.requestId,
			'Failed to end call',
			'SERVER_ERROR'
		);
		ws.send(JSON.stringify(errorResponse));
	}
}

/**
 * Handle ICE candidate exchange
 * @param {WebSocket} ws - WebSocket connection
 * @param {Object} message - ICE candidate message
 * @param {Object} context - WebSocket context
 */
export async function handleIceCandidate(ws, message, context) {
	console.log('📞 [ICE] ==================== ICE CANDIDATE START ====================');

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
		const { callId, targetUserId, candidate } = message.payload;
		const user = getAuthenticatedUser(context);

		console.log('📞 [ICE] ICE candidate details:', {
			callId,
			from: user.id,
			to: targetUserId,
			hasCandidate: !!candidate
		});

		if (!callId || !targetUserId || !candidate) {
			const errorResponse = createErrorResponse(
				message.requestId,
				'Call ID, target user ID, and candidate are required',
				'MISSING_REQUIRED_FIELDS'
			);
			ws.send(JSON.stringify(errorResponse));
			return;
		}

		// Forward ICE candidate to target user
		const iceCandidateMessage = {
			type: MESSAGE_TYPES.CALL_ICE_CANDIDATE,
			payload: {
				callId,
				from: user.id,
				candidate
			},
			requestId: null,
			timestamp: new Date().toISOString()
		};

		// Send ICE candidate to target user
		const targetConnections = roomManager.getUserConnections(targetUserId);
		targetConnections.forEach(targetWs => {
			targetWs.send(JSON.stringify(iceCandidateMessage));
		});

		console.log('📞 [ICE] ==================== ICE CANDIDATE SUCCESS ====================');

	} catch (error) {
		console.error('📞 [ICE] Exception details:', error);
		const errorResponse = createErrorResponse(
			message.requestId,
			'Failed to exchange ICE candidate',
			'SERVER_ERROR'
		);
		ws.send(JSON.stringify(errorResponse));
	}
}

/**
 * Handle SDP offer exchange
 * @param {WebSocket} ws - WebSocket connection
 * @param {Object} message - SDP offer message
 * @param {Object} context - WebSocket context
 */
export async function handleSdpOffer(ws, message, context) {
	console.log('📞 [SDP_OFFER] ==================== SDP OFFER START ====================');

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
		const { callId, targetUserId, sdp } = message.payload;
		const user = getAuthenticatedUser(context);

		if (!callId || !targetUserId || !sdp) {
			const errorResponse = createErrorResponse(
				message.requestId,
				'Call ID, target user ID, and SDP are required',
				'MISSING_REQUIRED_FIELDS'
			);
			ws.send(JSON.stringify(errorResponse));
			return;
		}

		// Forward SDP offer to target user
		const sdpOfferMessage = {
			type: MESSAGE_TYPES.CALL_SDP_OFFER,
			payload: {
				callId,
				from: user.id,
				sdp
			},
			requestId: null,
			timestamp: new Date().toISOString()
		};

		// Send SDP offer to target user
		const targetConnections = roomManager.getUserConnections(targetUserId);
		targetConnections.forEach(targetWs => {
			targetWs.send(JSON.stringify(sdpOfferMessage));
		});

		console.log('📞 [SDP_OFFER] ==================== SDP OFFER SUCCESS ====================');

	} catch (error) {
		console.error('📞 [SDP_OFFER] Exception details:', error);
		const errorResponse = createErrorResponse(
			message.requestId,
			'Failed to exchange SDP offer',
			'SERVER_ERROR'
		);
		ws.send(JSON.stringify(errorResponse));
	}
}

/**
 * Handle SDP answer exchange
 * @param {WebSocket} ws - WebSocket connection
 * @param {Object} message - SDP answer message
 * @param {Object} context - WebSocket context
 */
export async function handleSdpAnswer(ws, message, context) {
	console.log('📞 [SDP_ANSWER] ==================== SDP ANSWER START ====================');

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
		const { callId, targetUserId, sdp } = message.payload;
		const user = getAuthenticatedUser(context);

		if (!callId || !targetUserId || !sdp) {
			const errorResponse = createErrorResponse(
				message.requestId,
				'Call ID, target user ID, and SDP are required',
				'MISSING_REQUIRED_FIELDS'
			);
			ws.send(JSON.stringify(errorResponse));
			return;
		}

		// Forward SDP answer to target user
		const sdpAnswerMessage = {
			type: MESSAGE_TYPES.CALL_SDP_ANSWER,
			payload: {
				callId,
				from: user.id,
				sdp
			},
			requestId: null,
			timestamp: new Date().toISOString()
		};

		// Send SDP answer to target user
		const targetConnections = roomManager.getUserConnections(targetUserId);
		targetConnections.forEach(targetWs => {
			targetWs.send(JSON.stringify(sdpAnswerMessage));
		});

		console.log('📞 [SDP_ANSWER] ==================== SDP ANSWER SUCCESS ====================');

	} catch (error) {
		console.error('📞 [SDP_ANSWER] Exception details:', error);
		const errorResponse = createErrorResponse(
			message.requestId,
			'Failed to exchange SDP answer',
			'SERVER_ERROR'
		);
		ws.send(JSON.stringify(errorResponse));
	}
}