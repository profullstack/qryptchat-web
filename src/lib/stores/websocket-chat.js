/**
 * @fileoverview WebSocket-based chat store for QryptChat
 * Replaces the REST API + Supabase real-time approach with a unified WebSocket API
 */

import { writable, derived } from 'svelte/store';
import { browser } from '$app/environment';
import { 
	MESSAGE_TYPES, 
	createMessage, 
	parseMessage, 
	serializeMessage 
} from '$lib/websocket/utils/protocol.js';

/**
 * @typedef {Object} WebSocketChatState
 * @property {Array} conversations - User's conversations
 * @property {Array} groups - User's groups
 * @property {string|null} activeConversation - Currently active conversation ID
 * @property {Array} messages - Messages for active conversation
 * @property {boolean} loading - Loading state
 * @property {string|null} error - Error message
 * @property {Array} typingUsers - Users currently typing
 * @property {boolean} connected - WebSocket connection status
 * @property {boolean} authenticated - Authentication status
 * @property {Object|null} user - Current user data
 */

// Create writable store
const chatState = writable(/** @type {WebSocketChatState} */ ({
	conversations: [],
	groups: [],
	activeConversation: null,
	messages: [],
	loading: false,
	error: null,
	typingUsers: [],
	connected: false,
	authenticated: false,
	user: null
}));

/**
 * WebSocket-based chat store
 */
function createWebSocketChatStore() {
	const { subscribe, set, update } = chatState;

	let ws = null;
	let reconnectAttempts = 0;
	let maxReconnectAttempts = 5;
	let reconnectDelay = 1000;
	let pendingRequests = new Map(); // requestId -> { resolve, reject, timeout }
	let typingTimeout = null;

	/**
	 * Get WebSocket URL based on environment
	 * @returns {string} WebSocket URL
	 */
	function getWebSocketUrl() {
		if (!browser) return '';
		
		const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
		const host = window.location.hostname;
		const port = '8080'; // WebSocket server port
		
		return `${protocol}//${host}:${port}`;
	}

	/**
	 * Connect to WebSocket server
	 * @param {string} token - Authentication token
	 */
	function connect(token) {
		if (!browser || ws?.readyState === WebSocket.OPEN) return;

		const wsUrl = getWebSocketUrl();
		console.log('Connecting to WebSocket:', wsUrl);

		try {
			ws = new WebSocket(wsUrl);

			ws.onopen = () => {
				console.log('WebSocket connected');
				reconnectAttempts = 0;
				update(state => ({ ...state, connected: true, error: null }));

				// Authenticate immediately after connection
				if (token) {
					authenticate(token);
				}
			};

			ws.onmessage = (event) => {
				handleMessage(event.data);
			};

			ws.onclose = (event) => {
				console.log('WebSocket disconnected:', event.code, event.reason);
				update(state => ({ 
					...state, 
					connected: false, 
					authenticated: false 
				}));

				// Attempt to reconnect
				if (reconnectAttempts < maxReconnectAttempts) {
					setTimeout(() => {
						reconnectAttempts++;
						connect(token);
					}, reconnectDelay * Math.pow(2, reconnectAttempts));
				}
			};

			ws.onerror = (error) => {
				console.error('WebSocket error:', error);
				update(state => ({ 
					...state, 
					error: 'Connection error',
					connected: false 
				}));
			};

		} catch (error) {
			console.error('Failed to create WebSocket connection:', error);
			update(state => ({ 
				...state, 
				error: 'Failed to connect',
				connected: false 
			}));
		}
	}

	/**
	 * Disconnect from WebSocket server
	 */
	function disconnect() {
		if (ws) {
			ws.close();
			ws = null;
		}
		
		// Clear pending requests
		for (const [requestId, request] of pendingRequests.entries()) {
			clearTimeout(request.timeout);
			request.reject(new Error('Connection closed'));
		}
		pendingRequests.clear();

		update(state => ({ 
			...state, 
			connected: false, 
			authenticated: false,
			user: null
		}));
	}

	/**
	 * Send message and wait for response
	 * @param {string} type - Message type
	 * @param {Object} payload - Message payload
	 * @returns {Promise<Object>} Response message
	 */
	function sendMessage(type, payload = {}) {
		return new Promise((resolve, reject) => {
			if (!ws || ws.readyState !== WebSocket.OPEN) {
				reject(new Error('WebSocket not connected'));
				return;
			}

			const message = createMessage(type, payload);
			const requestId = message.requestId;

			// Set up response handler
			const timeout = setTimeout(() => {
				pendingRequests.delete(requestId);
				reject(new Error('Request timeout'));
			}, 30000); // 30 second timeout

			pendingRequests.set(requestId, { resolve, reject, timeout });

			// Send message
			ws.send(serializeMessage(message));
		});
	}

	/**
	 * Handle incoming WebSocket message
	 * @param {string} data - Raw message data
	 */
	function handleMessage(data) {
		try {
			const message = parseMessage(data);
			if (!message) {
				console.error('Invalid message received');
				return;
			}

			console.log('Received message:', message.type);

			// Handle response to pending request
			if (message.requestId && pendingRequests.has(message.requestId)) {
				const request = pendingRequests.get(message.requestId);
				clearTimeout(request.timeout);
				pendingRequests.delete(message.requestId);

				if (message.type === MESSAGE_TYPES.ERROR) {
					request.reject(new Error(message.payload.error));
				} else {
					request.resolve(message);
				}
				return;
			}

			// Handle broadcast messages
			switch (message.type) {
				case MESSAGE_TYPES.MESSAGE_RECEIVED:
					handleNewMessage(message.payload.message);
					break;

				case MESSAGE_TYPES.TYPING_UPDATE:
					handleTypingUpdate(message.payload);
					break;

				case MESSAGE_TYPES.USER_ONLINE:
				case MESSAGE_TYPES.USER_OFFLINE:
					handlePresenceUpdate(message.payload);
					break;

				default:
					console.log('Unhandled message type:', message.type);
					break;
			}

		} catch (error) {
			console.error('Error handling message:', error);
		}
	}

	/**
	 * Authenticate with the WebSocket server
	 * @param {string} token - JWT token
	 */
	async function authenticate(token) {
		try {
			const response = await sendMessage(MESSAGE_TYPES.AUTH, { token });
			
			if (response.type === MESSAGE_TYPES.AUTH_SUCCESS) {
				update(state => ({ 
					...state, 
					authenticated: true,
					user: response.payload.user,
					error: null
				}));
				console.log('WebSocket authenticated successfully');
			}
		} catch (error) {
			console.error('WebSocket authentication failed:', error);
			update(state => ({ 
				...state, 
				authenticated: false,
				error: 'Authentication failed'
			}));
		}
	}

	/**
	 * Load user conversations
	 */
	async function loadConversations() {
		try {
			update(state => ({ ...state, loading: true }));
			
			const response = await sendMessage(MESSAGE_TYPES.LOAD_CONVERSATIONS);
			
			if (response.type === MESSAGE_TYPES.CONVERSATIONS_LOADED) {
				update(state => ({ 
					...state, 
					conversations: response.payload.conversations,
					loading: false,
					error: null
				}));
			}
		} catch (error) {
			console.error('Failed to load conversations:', error);
			update(state => ({ 
				...state, 
				loading: false,
				error: 'Failed to load conversations'
			}));
		}
	}

	/**
	 * Join a conversation
	 * @param {string} conversationId - Conversation ID
	 */
	async function joinConversation(conversationId) {
		try {
			const response = await sendMessage(MESSAGE_TYPES.JOIN_CONVERSATION, {
				conversationId
			});
			
			if (response.type === MESSAGE_TYPES.CONVERSATION_JOINED) {
				// Load messages for this conversation
				await loadMessages(conversationId);
			}
		} catch (error) {
			console.error('Failed to join conversation:', error);
			update(state => ({ 
				...state, 
				error: 'Failed to join conversation'
			}));
		}
	}

	/**
	 * Leave a conversation
	 * @param {string} conversationId - Conversation ID
	 */
	async function leaveConversation(conversationId) {
		try {
			await sendMessage(MESSAGE_TYPES.LEAVE_CONVERSATION, {
				conversationId
			});
		} catch (error) {
			console.error('Failed to leave conversation:', error);
		}
	}

	/**
	 * Load messages for a conversation
	 * @param {string} conversationId - Conversation ID
	 */
	async function loadMessages(conversationId) {
		try {
			update(state => ({ ...state, loading: true }));
			
			const response = await sendMessage(MESSAGE_TYPES.LOAD_MESSAGES, {
				conversationId
			});
			
			if (response.type === MESSAGE_TYPES.MESSAGES_LOADED) {
				update(state => ({ 
					...state, 
					activeConversation: conversationId,
					messages: response.payload.messages,
					loading: false,
					error: null,
					typingUsers: []
				}));
			}
		} catch (error) {
			console.error('Failed to load messages:', error);
			update(state => ({ 
				...state, 
				loading: false,
				error: 'Failed to load messages'
			}));
		}
	}

	/**
	 * Send a message
	 * @param {string} conversationId - Conversation ID
	 * @param {string} content - Message content
	 * @param {string} messageType - Message type (default: 'text')
	 * @param {string} replyToId - ID of message being replied to
	 */
	async function sendChatMessage(conversationId, content, messageType = 'text', replyToId = null) {
		try {
			const payload = {
				conversationId,
				content,
				messageType
			};
			
			if (replyToId) {
				payload.replyToId = replyToId;
			}

			const response = await sendMessage(MESSAGE_TYPES.SEND_MESSAGE, payload);
			
			if (response.type === MESSAGE_TYPES.MESSAGE_SENT) {
				// Message will be added via broadcast
				return { success: true, data: response.payload.message };
			}
		} catch (error) {
			console.error('Failed to send message:', error);
			return { success: false, error: 'Failed to send message' };
		}
	}

	/**
	 * Start typing indicator
	 * @param {string} conversationId - Conversation ID
	 */
	async function startTyping(conversationId) {
		try {
			await sendMessage(MESSAGE_TYPES.TYPING_START, { conversationId });
		} catch (error) {
			console.error('Failed to start typing:', error);
		}
	}

	/**
	 * Stop typing indicator
	 * @param {string} conversationId - Conversation ID
	 */
	async function stopTyping(conversationId) {
		try {
			await sendMessage(MESSAGE_TYPES.TYPING_STOP, { conversationId });
		} catch (error) {
			console.error('Failed to stop typing:', error);
		}
	}

	/**
	 * Set typing indicator with auto-stop
	 * @param {string} conversationId - Conversation ID
	 */
	function setTyping(conversationId) {
		// Clear existing timeout
		if (typingTimeout) {
			clearTimeout(typingTimeout);
		}

		// Start typing
		startTyping(conversationId);

		// Auto-stop after 3 seconds
		typingTimeout = setTimeout(() => {
			stopTyping(conversationId);
		}, 3000);
	}

	/**
	 * Handle new message from broadcast
	 * @param {Object} message - New message
	 */
	function handleNewMessage(message) {
		update(state => {
			// Only add if it's for the active conversation
			if (state.activeConversation === message.conversation_id) {
				// Avoid duplicates
				const exists = state.messages.some(msg => msg.id === message.id);
				if (!exists) {
					return {
						...state,
						messages: [...state.messages, message]
					};
				}
			}
			return state;
		});
	}

	/**
	 * Handle typing indicator update
	 * @param {Object} typingData - Typing data
	 */
	function handleTypingUpdate(typingData) {
		update(state => {
			const { userId, isTyping } = typingData;
			let newTypingUsers = [...state.typingUsers];

			if (isTyping) {
				if (!newTypingUsers.includes(userId)) {
					newTypingUsers.push(userId);
				}
			} else {
				newTypingUsers = newTypingUsers.filter(id => id !== userId);
			}

			return {
				...state,
				typingUsers: newTypingUsers
			};
		});
	}

	/**
	 * Handle user presence update
	 * @param {Object} presenceData - Presence data
	 */
	function handlePresenceUpdate(presenceData) {
		// Update user presence in conversations/messages
		// This could be used to show online/offline status
		console.log('User presence update:', presenceData);
	}

	/**
	 * Create a new conversation
	 * @param {Object} conversationData - Conversation data
	 */
	async function createConversation(conversationData) {
		try {
			const response = await sendMessage(MESSAGE_TYPES.CREATE_CONVERSATION, conversationData);
			
			if (response.type === MESSAGE_TYPES.CONVERSATION_CREATED) {
				// Reload conversations to include the new one
				await loadConversations();
				return { success: true, data: response.payload };
			}
		} catch (error) {
			console.error('Failed to create conversation:', error);
			return { success: false, error: 'Failed to create conversation' };
		}
	}

	return {
		subscribe,
		
		// Connection management
		connect,
		disconnect,
		authenticate,
		
		// Conversation management
		loadConversations,
		joinConversation,
		leaveConversation,
		createConversation,
		
		// Message management
		loadMessages,
		sendMessage: sendChatMessage,
		
		// Typing indicators
		startTyping,
		stopTyping,
		setTyping,
		
		// Utility methods
		setError: (error) => update(state => ({ ...state, error })),
		clearError: () => update(state => ({ ...state, error: null })),
		
		// Get current state (for testing)
		getState: () => {
			let currentState;
			subscribe(state => currentState = state)();
			return currentState;
		}
	};
}

// Create and export the WebSocket chat store
export const wsChat = createWebSocketChatStore();

// Derived stores for convenience
export const conversations = derived(wsChat, $wsChat => $wsChat.conversations);
export const groups = derived(wsChat, $wsChat => $wsChat.groups);
export const activeConversation = derived(wsChat, $wsChat => $wsChat.activeConversation);
export const messages = derived(wsChat, $wsChat => $wsChat.messages);
export const isLoading = derived(wsChat, $wsChat => $wsChat.loading);
export const chatError = derived(wsChat, $wsChat => $wsChat.error);
export const typingUsers = derived(wsChat, $wsChat => $wsChat.typingUsers);
export const isConnected = derived(wsChat, $wsChat => $wsChat.connected);
export const isAuthenticated = derived(wsChat, $wsChat => $wsChat.authenticated);
export const currentUser = derived(wsChat, $wsChat => $wsChat.user);

// Clean up on page unload
if (browser) {
	window.addEventListener('beforeunload', () => {
		wsChat.disconnect();
	});
}