/**
 * @fileoverview ML-KEM Enhanced WebSocket Voice Call Handler
 * Handles voice/video call signaling with ML-KEM post-quantum cryptography
 * Implements FIPS 203 compliant key exchange for E2EE calls
 */

import { MESSAGE_TYPES, createSuccessResponse, createErrorResponse } from '../utils/protocol.js';
import { roomManager } from '../utils/rooms.js';
import { isAuthenticated, getAuthenticatedUser, getSupabaseClient } from './auth.js';
import { CallKeyExchange, MLKEMUtils } from '../../crypto/ml-kem.js';

/**
 * Handle ML-KEM encrypted call offer request
 * @param {WebSocket} ws - WebSocket connection
 * @param {Object} message - Call offer message
 * @param {Object} context - WebSocket context
 */
export async function handleMLKEMCallOffer(ws, message, context) {
	console.log('🔐 [ML-KEM OFFER] ==================== ENCRYPTED CALL OFFER START ====================');
	console.log('🔐 [ML-KEM OFFER] Message received:', JSON.stringify(message, null, 2));

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
		const { 
			targetUserId, 
			callType = 'voice', 
			sdpOffer,
			mlKemParams = ['ML_KEM_1024', 'ML_KEM_768'], // Supported parameter sets
			initiatorPublicKey // Base64 encoded ML-KEM public key
		} = message.payload;
		
		const user = getAuthenticatedUser(context);
		const supabase = getSupabaseClient(context);

		console.log('🔐 [ML-KEM OFFER] Call offer details:', {
			from: user.id,
			to: targetUserId,
			callType,
			mlKemParams,
			hasInitiatorPublicKey: !!initiatorPublicKey,
			hasSdpOffer: !!sdpOffer
		});

		if (!targetUserId || !initiatorPublicKey) {
			const errorResponse = createErrorResponse(
				message.requestId,
				'Target user ID and ML-KEM public key are required',
				'MISSING_REQUIRED_FIELDS'
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

		// Create call record in voice_calls table
		const callData = {
			id: callId,
			caller_id: user.id,
			recipient_id: targetUserId,
			call_type: callType,
			status: 'ringing',
			started_at: new Date().toISOString(),
			metadata: {
				encryption: 'ML_KEM',
				supported_params: mlKemParams
			}
		};

		const { error: callInsertError } = await supabase
			.from('voice_calls')
			.insert(callData);

		if (callInsertError) {
			console.error('🔐 [ML-KEM OFFER] Failed to insert call record:', callInsertError);
			const errorResponse = createErrorResponse(
				message.requestId,
				'Failed to create call record',
				'DATABASE_ERROR'
			);
			ws.send(JSON.stringify(errorResponse));
			return;
		}

		// Negotiate ML-KEM parameters with target user's capabilities
		const callKeyExchange = new CallKeyExchange();
		let negotiatedParams;
		
		try {
			// For now, assume target supports the same as initiator
			// In a real implementation, this would be negotiated based on target's capabilities
			negotiatedParams = callKeyExchange.negotiate(mlKemParams);
		} catch (negotiationError) {
			console.error('🔐 [ML-KEM OFFER] Parameter negotiation failed:', negotiationError);
			const errorResponse = createErrorResponse(
				message.requestId,
				'ML-KEM parameter negotiation failed',
				'CRYPTO_NEGOTIATION_FAILED'
			);
			ws.send(JSON.stringify(errorResponse));
			return;
		}

		// Create call session with ML-KEM parameters
		const { data: sessionId, error: sessionError } = await supabase
			.rpc('create_call_session', {
				p_call_id: callId,
				p_recipient_id: targetUserId,
				p_ml_kem_parameter_set: negotiatedParams.parameterSet,
				p_initiator_public_key: initiatorPublicKey
			});

		if (sessionError) {
			console.error('🔐 [ML-KEM OFFER] Failed to create call session:', sessionError);
			const errorResponse = createErrorResponse(
				message.requestId,
				'Failed to create encrypted call session',
				'SESSION_CREATION_FAILED'
			);
			ws.send(JSON.stringify(errorResponse));
			return;
		}

		// Send encrypted call offer to target user
		const encryptedCallOfferMessage = {
			type: MESSAGE_TYPES.ML_KEM_CALL_OFFER,
			payload: {
				callId,
				sessionId,
				from: user.id,
				fromName: user.display_name || user.username,
				fromAvatar: user.avatar_url,
				callType,
				mlKemParameterSet: negotiatedParams.parameterSet,
				initiatorPublicKey,
				sdpOffer
			},
			requestId: message.requestId,
			timestamp: new Date().toISOString()
		};

		// Send offer to target user via room manager
		const targetConnections = roomManager.getUserConnections(targetUserId);
		if (targetConnections.length > 0) {
			targetConnections.forEach(targetWs => {
				targetWs.send(JSON.stringify(encryptedCallOfferMessage));
			});
			console.log('🔐 [ML-KEM OFFER] Encrypted call offer sent to target user:', targetUserId);
		} else {
			console.log('🔐 [ML-KEM OFFER] Target user not online:', targetUserId);
			// TODO: Could implement push notifications here
		}

		// Send success response to caller
		const successResponse = createSuccessResponse(
			message.requestId,
			MESSAGE_TYPES.CALL_STATUS,
			{
				callId,
				sessionId,
				status: 'calling',
				encryption: 'ML_KEM',
				mlKemParameterSet: negotiatedParams.parameterSet,
				targetUser: {
					id: targetUser.id,
					username: targetUser.username,
					displayName: targetUser.display_name,
					avatarUrl: targetUser.avatar_url
				}
			}
		);
		ws.send(JSON.stringify(successResponse));

		console.log('🔐 [ML-KEM OFFER] ==================== ENCRYPTED CALL OFFER SUCCESS ====================');

	} catch (error) {
		console.error('🔐 [ML-KEM OFFER] ==================== ENCRYPTED CALL OFFER EXCEPTION ====================');
		console.error('🔐 [ML-KEM OFFER] Exception details:', error);
		const errorResponse = createErrorResponse(
			message.requestId,
			'Failed to initiate encrypted call',
			'SERVER_ERROR'
		);
		ws.send(JSON.stringify(errorResponse));
	}
}

/**
 * Handle ML-KEM encrypted call answer request
 * @param {WebSocket} ws - WebSocket connection
 * @param {Object} message - Call answer message
 * @param {Object} context - WebSocket context
 */
export async function handleMLKEMCallAnswer(ws, message, context) {
	console.log('🔐 [ML-KEM ANSWER] ==================== ENCRYPTED CALL ANSWER START ====================');

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
		const { 
			callId, 
			sessionId,
			sdpAnswer,
			recipientPublicKey, // Base64 encoded ML-KEM public key
			ciphertext // Base64 encoded ML-KEM ciphertext
		} = message.payload;
		
		const user = getAuthenticatedUser(context);
		const supabase = getSupabaseClient(context);

		console.log('🔐 [ML-KEM ANSWER] Call answer details:', {
			callId,
			sessionId,
			from: user.id,
			hasRecipientPublicKey: !!recipientPublicKey,
			hasCiphertext: !!ciphertext,
			hasSdpAnswer: !!sdpAnswer
		});

		if (!callId || !sessionId || !recipientPublicKey || !ciphertext) {
			const errorResponse = createErrorResponse(
				message.requestId,
				'Call ID, session ID, recipient public key, and ciphertext are required',
				'MISSING_REQUIRED_FIELDS'
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

		// Establish the call session with recipient's ML-KEM response
		const { data: established, error: establishError } = await supabase
			.rpc('establish_call_session', {
				p_session_id: sessionId,
				p_recipient_public_key: recipientPublicKey,
				p_ciphertext: ciphertext
			});

		if (establishError || !established) {
			console.error('🔐 [ML-KEM ANSWER] Failed to establish call session:', establishError);
			const errorResponse = createErrorResponse(
				message.requestId,
				'Failed to establish encrypted call session',
				'SESSION_ESTABLISHMENT_FAILED'
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

		// Send encrypted answer to caller
		const encryptedCallAnswerMessage = {
			type: MESSAGE_TYPES.ML_KEM_CALL_ANSWER,
			payload: {
				callId,
				sessionId,
				from: user.id,
				fromName: user.display_name || user.username,
				recipientPublicKey,
				ciphertext,
				sdpAnswer
			},
			requestId: null,
			timestamp: new Date().toISOString()
		};

		// Send answer to caller
		const callerConnections = roomManager.getUserConnections(call.caller_id);
		callerConnections.forEach(callerWs => {
			callerWs.send(JSON.stringify(encryptedCallAnswerMessage));
		});

		// Send success response to recipient
		const successResponse = createSuccessResponse(
			message.requestId,
			MESSAGE_TYPES.CALL_STATUS,
			{
				callId,
				sessionId,
				status: 'connected',
				encryption: 'ML_KEM',
				caller: call.caller
			}
		);
		ws.send(JSON.stringify(successResponse));

		console.log('🔐 [ML-KEM ANSWER] ==================== ENCRYPTED CALL ANSWER SUCCESS ====================');

	} catch (error) {
		console.error('🔐 [ML-KEM ANSWER] Exception details:', error);
		const errorResponse = createErrorResponse(
			message.requestId,
			'Failed to answer encrypted call',
			'SERVER_ERROR'
		);
		ws.send(JSON.stringify(errorResponse));
	}
}

/**
 * Handle ML-KEM key rotation request for forward secrecy
 * @param {WebSocket} ws - WebSocket connection
 * @param {Object} message - Key rotation message
 * @param {Object} context - WebSocket context
 */
export async function handleMLKEMKeyRotation(ws, message, context) {
	console.log('🔐 [ML-KEM ROTATION] ==================== KEY ROTATION START ====================');

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
		const { 
			sessionId,
			newPublicKey, // Base64 encoded new ML-KEM public key
			rotationSequence
		} = message.payload;
		
		const user = getAuthenticatedUser(context);
		const supabase = getSupabaseClient(context);

		console.log('🔐 [ML-KEM ROTATION] Key rotation details:', {
			sessionId,
			from: user.id,
			rotationSequence,
			hasNewPublicKey: !!newPublicKey
		});

		if (!sessionId || !newPublicKey || rotationSequence === undefined) {
			const errorResponse = createErrorResponse(
				message.requestId,
				'Session ID, new public key, and rotation sequence are required',
				'MISSING_REQUIRED_FIELDS'
			);
			ws.send(JSON.stringify(errorResponse));
			return;
		}

		// Get call session and verify user participation
		const { data: session, error: sessionError } = await supabase
			.from('call_sessions')
			.select('*, voice_calls!call_sessions_call_id_fkey(*)')
			.eq('id', sessionId)
			.single();

		if (sessionError || !session) {
			const errorResponse = createErrorResponse(
				message.requestId,
				'Call session not found',
				'SESSION_NOT_FOUND'
			);
			ws.send(JSON.stringify(errorResponse));
			return;
		}

		// Verify user is participant in this call
		const isParticipant = session.initiator_id === user.id || session.recipient_id === user.id;
		if (!isParticipant) {
			const errorResponse = createErrorResponse(
				message.requestId,
				'Access denied to call session',
				'ACCESS_DENIED'
			);
			ws.send(JSON.stringify(errorResponse));
			return;
		}

		// Insert key rotation record
		const { data: rotation, error: rotationError } = await supabase
			.from('call_key_rotations')
			.insert({
				call_session_id: sessionId,
				rotation_sequence: rotationSequence,
				initiator_public_key: newPublicKey,
				status: 'pending'
			})
			.select()
			.single();

		if (rotationError) {
			console.error('🔐 [ML-KEM ROTATION] Failed to create rotation record:', rotationError);
			const errorResponse = createErrorResponse(
				message.requestId,
				'Failed to initiate key rotation',
				'ROTATION_CREATION_FAILED'
			);
			ws.send(JSON.stringify(errorResponse));
			return;
		}

		// Send key rotation request to other participant
		const otherUserId = session.initiator_id === user.id ? session.recipient_id : session.initiator_id;
		const keyRotationMessage = {
			type: MESSAGE_TYPES.ML_KEM_KEY_ROTATION,
			payload: {
				sessionId,
				rotationId: rotation.id,
				rotationSequence,
				from: user.id,
				newPublicKey
			},
			requestId: null,
			timestamp: new Date().toISOString()
		};

		// Send rotation request to other participant
		const otherConnections = roomManager.getUserConnections(otherUserId);
		otherConnections.forEach(otherWs => {
			otherWs.send(JSON.stringify(keyRotationMessage));
		});

		// Send success response to initiator
		const successResponse = createSuccessResponse(
			message.requestId,
			MESSAGE_TYPES.CALL_STATUS,
			{
				sessionId,
				rotationId: rotation.id,
				status: 'key_rotation_initiated',
				rotationSequence
			}
		);
		ws.send(JSON.stringify(successResponse));

		console.log('🔐 [ML-KEM ROTATION] ==================== KEY ROTATION SUCCESS ====================');

	} catch (error) {
		console.error('🔐 [ML-KEM ROTATION] Exception details:', error);
		const errorResponse = createErrorResponse(
			message.requestId,
			'Failed to initiate key rotation',
			'SERVER_ERROR'
		);
		ws.send(JSON.stringify(errorResponse));
	}
}

/**
 * Handle ML-KEM key rotation response
 * @param {WebSocket} ws - WebSocket connection
 * @param {Object} message - Key rotation response message
 * @param {Object} context - WebSocket context
 */
export async function handleMLKEMKeyRotationResponse(ws, message, context) {
	console.log('🔐 [ML-KEM ROTATION RESPONSE] ==================== KEY ROTATION RESPONSE START ====================');

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
		const { 
			rotationId,
			recipientPublicKey, // Base64 encoded ML-KEM public key
			ciphertext // Base64 encoded ML-KEM ciphertext
		} = message.payload;
		
		const user = getAuthenticatedUser(context);
		const supabase = getSupabaseClient(context);

		if (!rotationId || !recipientPublicKey || !ciphertext) {
			const errorResponse = createErrorResponse(
				message.requestId,
				'Rotation ID, recipient public key, and ciphertext are required',
				'MISSING_REQUIRED_FIELDS'
			);
			ws.send(JSON.stringify(errorResponse));
			return;
		}

		// Update rotation record with response
		const { data: rotation, error: updateError } = await supabase
			.from('call_key_rotations')
			.update({
				recipient_public_key: recipientPublicKey,
				ciphertext: ciphertext,
				status: 'established',
				established_at: new Date().toISOString()
			})
			.eq('id', rotationId)
			.select('*, call_sessions!call_key_rotations_call_session_id_fkey(*)')
			.single();

		if (updateError || !rotation) {
			console.error('🔐 [ML-KEM ROTATION RESPONSE] Failed to update rotation:', updateError);
			const errorResponse = createErrorResponse(
				message.requestId,
				'Failed to complete key rotation',
				'ROTATION_UPDATE_FAILED'
			);
			ws.send(JSON.stringify(errorResponse));
			return;
		}

		// Notify rotation initiator
		const session = rotation.call_sessions;
		const initiatorId = session.initiator_id === user.id ? session.recipient_id : session.initiator_id;
		
		const rotationCompleteMessage = {
			type: MESSAGE_TYPES.ML_KEM_KEY_ROTATION_COMPLETE,
			payload: {
				sessionId: session.id,
				rotationId: rotation.id,
				rotationSequence: rotation.rotation_sequence,
				recipientPublicKey,
				ciphertext
			},
			requestId: null,
			timestamp: new Date().toISOString()
		};

		// Send completion notification to initiator
		const initiatorConnections = roomManager.getUserConnections(initiatorId);
		initiatorConnections.forEach(initiatorWs => {
			initiatorWs.send(JSON.stringify(rotationCompleteMessage));
		});

		// Send success response
		const successResponse = createSuccessResponse(
			message.requestId,
			MESSAGE_TYPES.CALL_STATUS,
			{
				sessionId: session.id,
				rotationId: rotation.id,
				status: 'key_rotation_complete',
				rotationSequence: rotation.rotation_sequence
			}
		);
		ws.send(JSON.stringify(successResponse));

		console.log('🔐 [ML-KEM ROTATION RESPONSE] ==================== KEY ROTATION RESPONSE SUCCESS ====================');

	} catch (error) {
		console.error('🔐 [ML-KEM ROTATION RESPONSE] Exception details:', error);
		const errorResponse = createErrorResponse(
			message.requestId,
			'Failed to complete key rotation',
			'SERVER_ERROR'
		);
		ws.send(JSON.stringify(errorResponse));
	}
}

/**
 * Add ML-KEM message types to the protocol
 */
export const ML_KEM_MESSAGE_TYPES = {
	ML_KEM_CALL_OFFER: 'ml_kem_call_offer',
	ML_KEM_CALL_ANSWER: 'ml_kem_call_answer',
	ML_KEM_KEY_ROTATION: 'ml_kem_key_rotation',
	ML_KEM_KEY_ROTATION_RESPONSE: 'ml_kem_key_rotation_response',
	ML_KEM_KEY_ROTATION_COMPLETE: 'ml_kem_key_rotation_complete'
};