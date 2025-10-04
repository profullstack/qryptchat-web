/**
 * @fileoverview API message protocol utilities
 * Defines standardized message format and validation for API communication
 */

/**
 * Message types for API communication
 */
export const MESSAGE_TYPES = {
	// Authentication
	AUTH: 'AUTH',
	AUTH_SUCCESS: 'AUTH_SUCCESS',
	AUTH_ERROR: 'AUTH_ERROR',

	// Messages
	SEND_MESSAGE: 'SEND_MESSAGE',
	MESSAGE_SENT: 'MESSAGE_SENT',
	NEW_MESSAGE: 'NEW_MESSAGE',
	LOAD_MESSAGES: 'LOAD_MESSAGES',
	MESSAGES_LOADED: 'MESSAGES_LOADED',
	LOAD_MORE_MESSAGES: 'LOAD_MORE_MESSAGES',

	// Conversations
	LOAD_CONVERSATIONS: 'LOAD_CONVERSATIONS',
	CONVERSATIONS_LOADED: 'CONVERSATIONS_LOADED',
	CREATE_CONVERSATION: 'CREATE_CONVERSATION',
	CONVERSATION_CREATED: 'CONVERSATION_CREATED',
	JOIN_CONVERSATION: 'JOIN_CONVERSATION',
	CONVERSATION_JOINED: 'CONVERSATION_JOINED',
	LEAVE_CONVERSATION: 'LEAVE_CONVERSATION',
	CONVERSATION_LEFT: 'CONVERSATION_LEFT',

	// Typing indicators
	TYPING_START: 'TYPING_START',
	TYPING_STOP: 'TYPING_STOP',
	USER_TYPING: 'USER_TYPING',

	// Voice/Video calls
	CALL_OFFER: 'CALL_OFFER',
	CALL_ANSWER: 'CALL_ANSWER',
	CALL_DECLINE: 'CALL_DECLINE',
	CALL_END: 'CALL_END',
	CALL_ICE_CANDIDATE: 'CALL_ICE_CANDIDATE',
	CALL_SDP_OFFER: 'CALL_SDP_OFFER',
	CALL_SDP_ANSWER: 'CALL_SDP_ANSWER',

	// ML-KEM calls
	ML_KEM_CALL_OFFER: 'ML_KEM_CALL_OFFER',
	ML_KEM_CALL_ANSWER: 'ML_KEM_CALL_ANSWER',
	ML_KEM_KEY_ROTATION: 'ML_KEM_KEY_ROTATION',
	ML_KEM_KEY_ROTATION_RESPONSE: 'ML_KEM_KEY_ROTATION_RESPONSE',

	// System
	PING: 'PING',
	PONG: 'PONG',
	ERROR: 'ERROR',
	SUCCESS: 'SUCCESS'
};

/**
 * Create a standardized API message
 * @param {string} type - Message type from MESSAGE_TYPES
 * @param {Object} [data] - Message data
 * @param {string} [requestId] - Optional request ID for correlation
 * @returns {Object} Formatted API message
 */
export function createMessage(type, data = {}, requestId = null) {
	const message = {
		type,
		timestamp: new Date().toISOString(),
		data
	};

	if (requestId) {
		message.requestId = requestId;
	}

	return message;
}

/**
 * Create an error message
 * @param {string} error - Error message
 * @param {string} [code] - Error code
 * @param {string} [requestId] - Optional request ID
 * @returns {Object} Error message
 */
export function createErrorMessage(error, code = 'UNKNOWN_ERROR', requestId = null) {
	return createMessage(
		MESSAGE_TYPES.ERROR,
		{ error, code },
		requestId
	);
}

/**
 * Create a success message
 * @param {Object} [data] - Success data
 * @param {string} [requestId] - Optional request ID
 * @returns {Object} Success message
 */
export function createSuccessMessage(data = {}, requestId = null) {
	return createMessage(
		MESSAGE_TYPES.SUCCESS,
		data,
		requestId
	);
}

/**
 * Create a pong message (response to ping)
 * @param {string} [requestId] - Optional request ID
 * @returns {Object} Pong message
 */
export function createPongMessage(requestId = null) {
	return createMessage(
		MESSAGE_TYPES.PONG,
		{ timestamp: Date.now() },
		requestId
	);
}

/**
 * Validate message format
 * @param {Object} message - Message to validate
 * @returns {{valid: boolean, error?: string}} Validation result
 */
export function validateMessage(message) {
	if (!message || typeof message !== 'object') {
		return { valid: false, error: 'Message must be an object' };
	}

	if (!message.type || typeof message.type !== 'string') {
		return { valid: false, error: 'Message must have a type string' };
	}

	if (!Object.values(MESSAGE_TYPES).includes(message.type)) {
		return { valid: false, error: `Unknown message type: ${message.type}` };
	}

	if (message.data !== undefined && typeof message.data !== 'object') {
		return { valid: false, error: 'Message data must be an object' };
	}

	return { valid: true };
}

/**
 * Parse message safely
 * @param {string} data - Raw message data
 * @returns {Object|null} Parsed message or null if invalid
 */
export function parseMessage(data) {
	try {
		return JSON.parse(data);
	} catch (error) {
		console.error('Failed to parse message:', error);
		return null;
	}
}

/**
 * Serialize message
 * @param {Object} message - Message to serialize
 * @returns {string} Serialized message
 */
export function serializeMessage(message) {
	return JSON.stringify(message);
}

/**
 * Format a message for SSE transmission
 * @param {string} eventType - Event type
 * @param {Object} data - Event data
 * @returns {string} Formatted SSE message
 */
export function formatSSEMessage(eventType, data) {
	const message = {
		type: eventType,
		timestamp: new Date().toISOString(),
		data
	};
	return `event: ${eventType}\ndata: ${JSON.stringify(message)}\n\n`;
}