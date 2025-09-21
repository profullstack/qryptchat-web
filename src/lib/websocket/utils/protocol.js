/**
 * @fileoverview WebSocket message protocol utilities
 * Defines standardized message format and validation for WebSocket communication
 */

import { v4 as uuidv4 } from 'uuid';

/**
 * WebSocket message types
 */
export const MESSAGE_TYPES = {
	// Authentication
	AUTH: 'auth',
	AUTH_SUCCESS: 'auth_success',
	AUTH_ERROR: 'auth_error',

	// Conversations
	LOAD_CONVERSATIONS: 'load_conversations',
	CONVERSATIONS_LOADED: 'conversations_loaded',
	JOIN_CONVERSATION: 'join_conversation',
	LEAVE_CONVERSATION: 'leave_conversation',
	CONVERSATION_JOINED: 'conversation_joined',
	CONVERSATION_LEFT: 'conversation_left',
	CREATE_CONVERSATION: 'create_conversation',
	CONVERSATION_CREATED: 'conversation_created',

	// Messages
	SEND_MESSAGE: 'send_message',
	MESSAGE_SENT: 'message_sent',
	MESSAGE_RECEIVED: 'message_received',
	LOAD_MESSAGES: 'load_messages',
	MESSAGES_LOADED: 'messages_loaded',
	LOAD_MORE_MESSAGES: 'load_more_messages',

	// Typing indicators
	TYPING_START: 'typing_start',
	TYPING_STOP: 'typing_stop',
	TYPING_UPDATE: 'typing_update',

	// Groups
	CREATE_GROUP: 'create_group',
	GROUP_CREATED: 'group_created',
	JOIN_GROUP: 'join_group',
	GROUP_JOINED: 'group_joined',
	LOAD_GROUPS: 'load_groups',
	GROUPS_LOADED: 'groups_loaded',

	// User presence
	USER_ONLINE: 'user_online',
	USER_OFFLINE: 'user_offline',

	// Error handling
	ERROR: 'error',
	PING: 'ping',
	PONG: 'pong',

	// Key distribution messages
	KEY_SHARE: 'key_share',
	KEY_REQUEST: 'key_request',
	KEY_RESPONSE: 'key_response',
	KEY_INIT: 'key_init',

	// Voice/Video calling
	CALL_OFFER: 'call_offer',
	CALL_ANSWER: 'call_answer',
	CALL_DECLINE: 'call_decline',
	CALL_END: 'call_end',
	CALL_ICE_CANDIDATE: 'call_ice_candidate',
	CALL_SDP_OFFER: 'call_sdp_offer',
	CALL_SDP_ANSWER: 'call_sdp_answer',
	CALL_STATUS: 'call_status'
};

/**
 * Create a standardized WebSocket message
 * @param {string} type - Message type from MESSAGE_TYPES
 * @param {Object} payload - Message payload
 * @param {string} [requestId] - Optional request ID for correlation
 * @returns {Object} Formatted WebSocket message
 */
export function createMessage(type, payload = {}, requestId = null) {
	return {
		type,
		payload,
		requestId: requestId || uuidv4(),
		timestamp: new Date().toISOString()
	};
}

/**
 * Create a success response message
 * @param {string} requestId - Original request ID
 * @param {string} type - Response message type
 * @param {Object} payload - Response payload
 * @returns {Object} Success response message
 */
export function createSuccessResponse(requestId, type, payload = {}) {
	return createMessage(type, payload, requestId);
}

/**
 * Create an error response message
 * @param {string} requestId - Original request ID
 * @param {string} error - Error message
 * @param {string} [code] - Optional error code
 * @returns {Object} Error response message
 */
export function createErrorResponse(requestId, error, code = null) {
	return createMessage(MESSAGE_TYPES.ERROR, {
		error,
		code,
		requestId
	}, requestId);
}

/**
 * Validate WebSocket message format
 * @param {Object} message - Message to validate
 * @returns {boolean} True if message is valid
 */
export function validateMessage(message) {
	if (!message || typeof message !== 'object') {
		return false;
	}

	const { type, payload, requestId, timestamp } = message;

	// Check required fields
	if (!type || typeof type !== 'string') {
		return false;
	}

	if (!payload || typeof payload !== 'object') {
		return false;
	}

	// requestId can be null for broadcast messages (presence, typing, etc.)
	if (requestId !== null && typeof requestId !== 'string') {
		return false;
	}

	if (!timestamp || typeof timestamp !== 'string') {
		return false;
	}

	// Check if type is valid
	if (!Object.values(MESSAGE_TYPES).includes(type)) {
		return false;
	}

	return true;
}

/**
 * Parse WebSocket message safely
 * @param {string} data - Raw message data
 * @returns {Object|null} Parsed message or null if invalid
 */
export function parseMessage(data) {
	try {
		const message = JSON.parse(data);
		return validateMessage(message) ? message : null;
	} catch (error) {
		console.error('Failed to parse WebSocket message:', error);
		return null;
	}
}

/**
 * Serialize WebSocket message
 * @param {Object} message - Message to serialize
 * @returns {string} Serialized message
 */
export function serializeMessage(message) {
	return JSON.stringify(message);
}

/**
 * Create a ping message
 * @returns {Object} Ping message
 */
export function createPingMessage() {
	return createMessage(MESSAGE_TYPES.PING);
}

/**
 * Create a pong message
 * @param {string} requestId - Ping request ID
 * @returns {Object} Pong message
 */
export function createPongMessage(requestId) {
	return createMessage(MESSAGE_TYPES.PONG, {}, requestId);
}