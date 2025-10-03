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
import { multiRecipientEncryption } from '$lib/crypto/multi-recipient-encryption.js';
import { postQuantumEncryption } from '$lib/crypto/post-quantum-encryption.js';
import { publicKeyService } from '$lib/crypto/public-key-service.js';

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
	let maxReconnectDelay = 30000;
	let pendingRequests = new Map(); // requestId -> { resolve, reject, timeout }
	let typingTimeout = null;
	let reconnectTimeout = null;
	let heartbeatInterval = null;
	let lastHeartbeat = null;
	let connectionToken = null; // Store current connection token

	/**
	 * Get WebSocket URL based on environment
	 * @returns {string} WebSocket URL
	 */
	function getWebSocketUrl() {
		if (!browser) return '';
		
		const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
		const host = window.location.host; // Use host instead of hostname to include port
		
		const wsUrl = `${protocol}//${host}/ws`;
		console.log('🔗 WebSocket URL calculated:', wsUrl, {
			protocol: window.location.protocol,
			host: window.location.host,
			hostname: window.location.hostname,
			port: window.location.port
		});
		
		return wsUrl;
	}

	/**
	 * Connect to WebSocket server with enhanced reconnection logic
	 * @param {string} token - Authentication token
	 */
	function connect(token) {
		if (!browser) return;
		
		// Store token for reconnection attempts
		connectionToken = token;
		
		// If already connected with same token, don't reconnect
		if (ws?.readyState === WebSocket.OPEN && connectionToken === token) {
			console.log('WebSocket already connected with same token');
			return;
		}

		// Clean up existing connection
		if (ws && ws.readyState !== WebSocket.CLOSED) {
			console.log('Closing existing WebSocket connection');
			ws.close();
		}

		const wsUrl = getWebSocketUrl();
		console.log(`🔗 Connecting to WebSocket (attempt ${reconnectAttempts + 1}/${maxReconnectAttempts + 1}):`, wsUrl);

		try {
			ws = new WebSocket(wsUrl);

			ws.onopen = async () => {
				console.log('✅ WebSocket connected successfully');
				reconnectAttempts = 0;
				lastHeartbeat = Date.now();
				
				// Clear any pending reconnection timeout
				if (reconnectTimeout) {
					clearTimeout(reconnectTimeout);
					reconnectTimeout = null;
				}
				
				update(state => ({ ...state, connected: true, error: null }));

				// Initialize multi-recipient encryption and public key service
				console.log('🔐 Initializing multi-recipient encryption...');
				await multiRecipientEncryption.initialize();
				await publicKeyService.initialize();
				
				// Initialize user encryption (generates keys and uploads public key)
				await publicKeyService.initializeUserEncryption();
				console.log('🔐 Multi-recipient encryption and public key service initialized');

				// Authenticate immediately after connection
				if (token) {
					await authenticate(token);
				}
				
				// Start heartbeat
				startHeartbeat();
			};

			ws.onmessage = (event) => {
				lastHeartbeat = Date.now();
				handleMessage(event.data);
			};

			ws.onclose = (event) => {
				console.log(`🔌 WebSocket disconnected: ${event.code} - ${event.reason}`);
				
				// Stop heartbeat
				stopHeartbeat();
				
				update(state => ({
					...state,
					connected: false,
					authenticated: false
				}));

				// Only attempt reconnection if we have a token and haven't exceeded max attempts
				if (connectionToken && reconnectAttempts < maxReconnectAttempts) {
					scheduleReconnection();
				} else if (reconnectAttempts >= maxReconnectAttempts) {
					console.error('❌ Max reconnection attempts reached');
					update(state => ({
						...state,
						error: 'Connection failed after multiple attempts. Please refresh the page.'
					}));
				}
			};

			ws.onerror = (error) => {
				console.error('❌ WebSocket error:', error);
				update(state => ({
					...state,
					error: 'Connection error',
					connected: false
				}));
			};

		} catch (error) {
			console.error('❌ Failed to create WebSocket connection:', error);
			update(state => ({
				...state,
				error: 'Failed to connect',
				connected: false
			}));
			
			// Schedule reconnection on connection creation failure
			if (connectionToken && reconnectAttempts < maxReconnectAttempts) {
				scheduleReconnection();
			}
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
				console.error('Invalid message received - parseMessage returned null/undefined');
				console.error('Raw data:', data);
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
					// Await the async handleNewMessage to ensure decryption completes before DOM update
					handleNewMessage(message.payload).catch(error => {
						console.error('Error handling new message:', error);
					});
					break;

				case MESSAGE_TYPES.TYPING_UPDATE:
					handleTypingUpdate(message.payload);
					break;

				case MESSAGE_TYPES.USER_ONLINE:
				case MESSAGE_TYPES.USER_OFFLINE:
					handlePresenceUpdate(message.payload);
					break;

				// Removed complex key distribution system - using simple encryption only

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
				console.log('✅ Successfully joined conversation room:', conversationId);
				
				// Ensure user encryption is initialized for this conversation
				console.log(`🔑 Ensuring user encryption is ready for conversation: ${conversationId}`);
				try {
					await publicKeyService.initializeUserEncryption();
					console.log(`🔑 ✅ User encryption ready for conversation: ${conversationId}`);
				} catch (keyError) {
					console.error(`🔑 ❌ Failed to ensure user encryption:`, keyError);
				}
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
				// Decrypt all loaded messages using multi-recipient encryption
				const messages = response.payload.messages || [];
				console.log(`🔐 [LOAD] Processing ${messages.length} messages for multi-recipient decryption`);
				
				for (const message of messages) {
					if (message.encrypted_content) {
						try {
							console.log(`🔐 [LOAD] Decrypting message ${message.id} (your encrypted copy)`);
							
							// Decrypt YOUR encrypted copy using YOUR private key (ML-KEM approach)
							// The server already provided only YOUR encrypted copy in message.encrypted_content
							const decryptedContent = await postQuantumEncryption.decryptFromSender(
								message.encrypted_content,
								'' // Sender public key not needed for ML-KEM decryption
							);
							
							message.content = decryptedContent;
							console.log(`🔐 [LOAD] ✅ Decrypted message ${message.id}: "${decryptedContent}"`);
						} catch (error) {
							console.error(`🔐 [LOAD] ❌ Failed to decrypt message ${message.id}:`, error);
							
							// Handle specific error types
							const errorMsg = error instanceof Error ? error.message : String(error);
							if (errorMsg.includes('Algorithm mismatch') || errorMsg.includes('invalid encapsulation key')) {
								message.content = '[Message encrypted with incompatible keys - please ask sender to resend]';
							} else if (errorMsg.includes('tag')) {
								message.content = '[Message integrity check failed - please ask sender to resend]';
							} else if (errorMsg.includes('ML-KEM')) {
								message.content = '[Message encrypted with different ML-KEM algorithm - please ask sender to resend]';
							} else {
								message.content = '[Message content unavailable - please ask sender to resend]';
							}
							
							// Log the specific error message for troubleshooting
							console.error(`🔐 [LOAD] Error details: ${errorMsg}`);
						}
					} else {
						console.log(`🔐 [LOAD] ⚠️ Message ${message.id} has no encrypted_content`);
						message.content = '[No content]';
					}
				}

				update(state => ({
					...state,
					activeConversation: conversationId,
					messages: messages,
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
			// Encrypt message for all conversation participants using multi-recipient encryption
			console.log(`🔐 [SEND] Encrypting message for all participants in conversation: ${conversationId}`);
			const encryptedContents = await multiRecipientEncryption.encryptForConversation(conversationId, content);
			
			const payload = {
				conversationId,
				encryptedContents, // Now sending per-participant encrypted contents
				messageType
			};
			
			if (replyToId) {
				payload.replyToId = replyToId;
			}

			const response = await sendMessage(MESSAGE_TYPES.SEND_MESSAGE, payload);
			
			if (response.type === MESSAGE_TYPES.MESSAGE_SENT) {
				// Decrypt the message before returning it for immediate display
				const sentMessage = response.payload.message;
				if (sentMessage.encrypted_content) {
					try {
						console.log(`🔐 [SENT] Decrypting sent message ${sentMessage.id} for immediate display`);
						
						// Decrypt YOUR encrypted copy using YOUR private key (ML-KEM approach)
						// The server returned YOUR encrypted copy in sentMessage.encrypted_content
						const decryptedContent = await postQuantumEncryption.decryptFromSender(
							sentMessage.encrypted_content,
							'' // Sender public key not needed for ML-KEM decryption
						);
						
						sentMessage.content = decryptedContent;
						console.log(`🔐 [SENT] ✅ Decrypted sent message ${sentMessage.id}: "${decryptedContent}"`);
					} catch (error) {
						console.error(`🔐 [SENT] ❌ Failed to decrypt sent message ${sentMessage.id}:`, error);
						
						// For sent messages, we should never see encryption errors since we just encrypted it
						// But handle them gracefully just in case
						const errorMsg = error instanceof Error ? error.message : String(error);
						console.error(`🔐 [SENT] Error details: ${errorMsg}`);
						
						// Use the original content as fallback since this is our own sent message
						sentMessage.content = content || '[Message content unavailable]';
					}
				} else {
					console.log(`🔐 [SENT] ⚠️ Sent message ${sentMessage.id} has no encrypted_content`);
					sentMessage.content = content; // Use original content as fallback
				}
				
				// Message will be added via broadcast, but return decrypted version for immediate display
				return { success: true, data: sentMessage };
			}
		} catch (error) {
			console.error('Failed to send message:', error);
			
			// Extract more useful error information for the user
			let errorMessage = 'Failed to send message';
			
			// Check for KYBER header issues
			if (error && error.message) {
				if (error.message.includes('KYBER') && error.message.includes('Nuclear Key Reset')) {
					errorMessage = 'Encryption failed due to key format issues. Both you and the recipient need to use the Nuclear Key Reset option in Settings.';
				} else if (error.message.includes('invalid encapsulation key')) {
					errorMessage = 'Encryption failed due to key compatibility issues. Both participants need to reset their encryption keys.';
				} else if (error.message.includes('Failed to encrypt message for any participants')) {
					errorMessage = 'Failed to encrypt message for any participants. Try using the Nuclear Key Reset option in Settings.';
				}
			}
			
			// Check if the multi-recipient service collected error details
			if (multiRecipientEncryption.encryptionErrors && multiRecipientEncryption.encryptionErrors.length > 0) {
				const kyberErrors = multiRecipientEncryption.encryptionErrors.filter(e =>
					e.errorType === 'KYBER_HEADER' ||
					e.message.includes('KYBER')
				);
				
				if (kyberErrors.length > 0) {
					errorMessage = 'Message encryption failed: Detected KYBER key format. Both participants must use the Nuclear Key Reset option in Settings.';
				}
			}
			
			return { success: false, error: errorMessage };
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
	 * @param {Object} messagePayload - Message payload from broadcast
	 */
	async function handleNewMessage(messagePayload) {
		const message = messagePayload.message;
		const shouldReloadMessages = messagePayload.shouldReloadMessages;
		
		console.log(`🔐 [NEW] Processing new message ${message.id} for conversation ${message.conversation_id}`);
		
		// Get current state to check if this is the active conversation
		let currentState;
		const unsubscribe = subscribe(state => {
			currentState = state;
		});
		unsubscribe(); // Immediately unsubscribe after getting the state
		
		// If shouldReloadMessages is true, reload all messages to get proper encrypted content
		if (shouldReloadMessages) {
			console.log(`🔐 [NEW] Message ${message.id} requires message reload for proper encrypted content`);
			
			if (currentState.activeConversation === message.conversation_id) {
				console.log(`🔐 [NEW] Reloading messages for active conversation ${message.conversation_id}`);
				await loadMessages(message.conversation_id);
				return; // loadMessages will handle adding the message with proper decryption
			} else {
				console.log(`🔐 [NEW] Message ${message.id} is for inactive conversation, refreshing conversation list`);
				// Refresh the conversation list to update unread counts and last message
				await loadConversations();
				return; // Don't add messages for inactive conversations, but update the list
			}
		}
		
		// Decrypt YOUR encrypted copy using YOUR private key (ML-KEM approach)
		if (message.encrypted_content) {
			try {
				console.log(`🔐 [NEW] Decrypting new message ${message.id} (your encrypted copy)`);
				
				// Decrypt YOUR encrypted copy using YOUR private key (ML-KEM approach)
				// The server/WebSocket already provided only YOUR encrypted copy in message.encrypted_content
				const decryptedContent = await postQuantumEncryption.decryptFromSender(
					message.encrypted_content,
					'' // Sender public key not needed for ML-KEM decryption
				);
				
				message.content = decryptedContent;
				console.log(`🔐 [NEW] ✅ Decrypted new message ${message.id}: "${decryptedContent}"`);
			} catch (error) {
				console.error(`🔐 [NEW] ❌ Failed to decrypt received message ${message.id}:`, error);
				
				// Handle specific error types
				const errorMsg = error instanceof Error ? error.message : String(error);
				if (errorMsg.includes('Algorithm mismatch') || errorMsg.includes('invalid encapsulation key')) {
					message.content = '[Message encrypted with incompatible keys - please ask sender to resend]';
				} else if (errorMsg.includes('tag')) {
					message.content = '[Message integrity check failed - please ask sender to resend]';
				} else if (errorMsg.includes('ML-KEM')) {
					message.content = '[Message encrypted with different ML-KEM algorithm - please ask sender to resend]';
				} else {
					message.content = '[Message content unavailable - please ask sender to resend]';
				}
				
				// Log the specific error message for troubleshooting
				console.error(`🔐 [NEW] Error details: ${errorMsg}`);
			}
		} else if (message.content) {
			// Message already has content (shouldn't happen with encryption enabled)
			console.log(`🔐 [NEW] ⚠️ New message ${message.id} has content but no encrypted_content:`, message.content);
		} else {
			console.log(`🔐 [NEW] ⚠️ New message ${message.id} has no encrypted_content or content`);
			message.content = '[No content]';
		}

		// Always update the state with the decrypted message
		update(state => {
			// Only add if it's for the active conversation
			if (state.activeConversation === message.conversation_id) {
				// Avoid duplicates
				const exists = state.messages.some(msg => msg.id === message.id);
				if (!exists) {
					console.log(`🔐 [NEW] Adding decrypted message to state: "${message.content}"`);
					return {
						...state,
						messages: [...state.messages, message]
					};
				} else {
					console.log(`🔐 [NEW] Message ${message.id} already exists in state, skipping`);
				}
			} else {
				console.log(`🔐 [NEW] Message ${message.id} is for conversation ${message.conversation_id}, but active is ${state.activeConversation}, skipping`);
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

	// Removed complex key distribution handlers - using simple encryption only

	/**
	 * Create a new conversation
	 * @param {Object} conversationData - Conversation data
	 */
	async function createConversation(conversationData) {
		try {
			const response = await sendMessage(MESSAGE_TYPES.CREATE_CONVERSATION, conversationData);
			
			if (response.type === MESSAGE_TYPES.CONVERSATION_CREATED) {
				const newConversation = response.payload;
				const conversationId = newConversation.id;

				// Ensure user encryption is ready for the new conversation
				console.log(`🔑 Ensuring user encryption is ready for new conversation: ${conversationId}`);
				await publicKeyService.initializeUserEncryption();

				// Reload conversations to include the new one
				await loadConversations();
				return { success: true, data: newConversation };
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
		},
		
		// Expose WebSocket connection for ML-KEM calls
		getWebSocket: () => ws
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