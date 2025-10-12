/**
 * @fileoverview SSE + POST-based chat store for QryptChat
 * Replaces WebSocket with Server-Sent Events for receiving and POST for sending
 */

import { writable, derived } from 'svelte/store';
import { browser } from '$app/environment';
import { MESSAGE_TYPES } from '$lib/api/protocol.js';
import { multiRecipientEncryption } from '$lib/crypto/multi-recipient-encryption.js';
import { postQuantumEncryption } from '$lib/crypto/post-quantum-encryption.js';
import { publicKeyService } from '$lib/crypto/public-key-service.js';
import * as conversationUtils from '$lib/utils/conversation-utils.js';

/**
 * @typedef {Object} ChatState
 * @property {Array} conversations - User's conversations
 * @property {Array} groups - User's groups
 * @property {string|null} activeConversation - Currently active conversation ID
 * @property {Array} messages - Messages for active conversation
 * @property {boolean} loading - Loading state
 * @property {string|null} error - Error message
 * @property {Array} typingUsers - Users currently typing
 * @property {boolean} connected - SSE connection status
 * @property {boolean} authenticated - Authentication status
 * @property {Object|null} user - Current user data
 */

// Create writable store
const chatState = writable(/** @type {ChatState} */ ({
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
 * SSE + POST-based chat store
 */
function createChatStore() {
	const { subscribe, set, update } = chatState;

	let eventSource = null;
	let reconnectAttempts = 0;
	let maxReconnectAttempts = 5;
	let reconnectDelay = 1000;
	let maxReconnectDelay = 30000;
	let typingTimeout = null;
	let reconnectTimeout = null;
	let connectionToken = null;
	let lastEventTime = null;

	/**
	 * Connect to SSE server
	 * @param {string} token - Authentication token
	 */
	async function connect(token) {
		if (!browser) return;

		// Store token for reconnection attempts
		connectionToken = token;

		// If already connected, don't reconnect
		if (eventSource?.readyState === EventSource.OPEN) {
			console.log('📡 SSE already connected');
			return;
		}

		// Clean up existing connection
		if (eventSource) {
			console.log('📡 Closing existing SSE connection');
			eventSource.close();
		}

		const url = `/api/events`;
		console.log(`📡 Connecting to SSE (attempt ${reconnectAttempts + 1}/${maxReconnectAttempts + 1}):`, url);

		try {
			eventSource = new EventSource(url);

			eventSource.addEventListener('open', async () => {
				console.log('✅ SSE connected successfully');
				reconnectAttempts = 0;
				lastEventTime = Date.now();

				// Clear any pending reconnection timeout
				if (reconnectTimeout) {
					clearTimeout(reconnectTimeout);
					reconnectTimeout = null;
				}

				update(state => ({ ...state, connected: true, error: null }));

				// Initialize encryption
				console.log('🔐 Initializing multi-recipient encryption...');
				await multiRecipientEncryption.initialize();
				await publicKeyService.initialize();
				await publicKeyService.initializeUserEncryption();
				console.log('🔐 Multi-recipient encryption initialized');

				// Mark as authenticated (SSE endpoint already validated token)
				update(state => ({ ...state, authenticated: true }));
			});

			// Handle CONNECTED event
			eventSource.addEventListener('CONNECTED', (event) => {
				const data = JSON.parse(event.data);
				console.log('📡 SSE CONNECTED event:', data);
				lastEventTime = Date.now();
			});

			// Handle NEW_MESSAGE events
			eventSource.addEventListener(MESSAGE_TYPES.NEW_MESSAGE, (event) => {
				lastEventTime = Date.now();
				const data = JSON.parse(event.data);
				handleNewMessage(data.data).catch(error => {
					console.error('Error handling new message:', error);
				});
			});

			// Handle USER_TYPING events
			eventSource.addEventListener(MESSAGE_TYPES.USER_TYPING, (event) => {
				lastEventTime = Date.now();
				const data = JSON.parse(event.data);
				handleTypingUpdate(data.data);
			});

			// Handle CONVERSATION_CREATED events
			eventSource.addEventListener(MESSAGE_TYPES.CONVERSATION_CREATED, (event) => {
				lastEventTime = Date.now();
				const data = JSON.parse(event.data);
				console.log('📡 New conversation created:', data);
				// Reload conversations to include the new one
				loadConversations();
			});

			// Handle generic message events
			eventSource.addEventListener('message', (event) => {
				lastEventTime = Date.now();
				console.log('📡 SSE message event:', event.data);
			});

			eventSource.addEventListener('error', (error) => {
				console.error('❌ SSE error:', error);

				// EventSource automatically reconnects, but we track it
				if (eventSource.readyState === EventSource.CLOSED) {
					console.log('📡 SSE connection closed');
					update(state => ({
						...state,
						connected: false,
						authenticated: false
					}));

					// Attempt manual reconnection if needed
					if (connectionToken && reconnectAttempts < maxReconnectAttempts) {
						scheduleReconnection();
					} else if (reconnectAttempts >= maxReconnectAttempts) {
						console.error('❌ Max reconnection attempts reached');
						update(state => ({
							...state,
							error: 'Connection failed after multiple attempts. Please refresh the page.'
						}));
					}
				}
			});

		} catch (error) {
			console.error('❌ Failed to create SSE connection:', error);
			update(state => ({
				...state,
				error: 'Failed to connect',
				connected: false
			}));

			if (connectionToken && reconnectAttempts < maxReconnectAttempts) {
				scheduleReconnection();
			}
		}
	}

	/**
	 * Schedule reconnection attempt
	 */
	function scheduleReconnection() {
		reconnectAttempts++;
		const delay = Math.min(reconnectDelay * Math.pow(2, reconnectAttempts - 1), maxReconnectDelay);
		
		console.log(`🔄 Scheduling reconnection attempt ${reconnectAttempts} in ${delay}ms`);
		
		reconnectTimeout = setTimeout(() => {
			if (connectionToken) {
				connect(connectionToken);
			}
		}, delay);
	}

	/**
	 * Disconnect from SSE server
	 */
	function disconnect() {
		if (eventSource) {
			eventSource.close();
			eventSource = null;
		}

		if (reconnectTimeout) {
			clearTimeout(reconnectTimeout);
			reconnectTimeout = null;
		}

		update(state => ({
			...state,
			connected: false,
			authenticated: false,
			user: null
		}));
	}

	/**
	 * Make authenticated POST request
	 * @param {string} endpoint - API endpoint
	 * @param {Object} data - Request data
	 * @returns {Promise<Object>} Response data
	 */
	async function apiPost(endpoint, data = {}) {
		try {
			const response = await fetch(endpoint, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(data),
				credentials: 'include' // Include cookies for authentication
			});

			if (!response.ok) {
				const error = await response.json().catch(() => ({ error: 'Request failed' }));
				throw new Error(error.error || `HTTP ${response.status}`);
			}

			return await response.json();
		} catch (error) {
			console.error(`API POST ${endpoint} failed:`, error);
			throw error;
		}
	}

	/**
	 * Load user conversations
	 */
	async function loadConversations() {
		try {
			update(state => ({ ...state, loading: true }));

			const response = await apiPost('/api/conversations/load');

			if (response.success) {
				update(state => ({
					...state,
					conversations: response.conversations,
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
			const response = await apiPost('/api/conversations/join', { conversationId });

			if (response.success) {
				console.log('✅ Successfully joined conversation room:', conversationId);

				// Ensure user encryption is initialized
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
			await apiPost('/api/conversations/leave', { conversationId });
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

			const response = await apiPost('/api/messages/load', { conversationId });

			if (response.success) {
				// Decrypt all loaded messages
				const messages = response.messages || [];
				console.log(`🔐 [LOAD] Processing ${messages.length} messages for decryption`);

				for (const message of messages) {
					if (message.encrypted_content) {
						try {
							console.log(`🔐 [LOAD] Decrypting message ${message.id}`);

							const decryptedContent = await postQuantumEncryption.decryptFromSender(
								message.encrypted_content,
								''
							);

							message.content = decryptedContent;
							console.log(`🔐 [LOAD] ✅ Decrypted message ${message.id}`);
						} catch (error) {
							console.error(`🔐 [LOAD] ❌ Failed to decrypt message ${message.id}:`, error);

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
	 * @param {Object} metadata - Optional metadata (e.g., { isAsciiArt: true })
	 * @param {string} replyToId - ID of message being replied to
	 */
	async function sendChatMessage(conversationId, content, messageType = 'text', metadata = null, replyToId = null) {
		try {
			// Encrypt message for all conversation participants
			console.log(`🔐 [SEND] Encrypting message for conversation: ${conversationId}`);
			const encryptedContents = await multiRecipientEncryption.encryptForConversation(conversationId, content);

			const payload = {
				conversationId,
				encryptedContents,
				messageType
			};

			if (metadata) {
				payload.metadata = metadata;
			}

			if (replyToId) {
				payload.replyToId = replyToId;
			}

			const response = await apiPost('/api/messages/send', payload);

			if (response.success) {
				// Decrypt the sent message for immediate display
				const sentMessage = response.message;
				if (sentMessage.encrypted_content) {
					try {
						console.log(`🔐 [SENT] Decrypting sent message ${sentMessage.id}`);

						const decryptedContent = await postQuantumEncryption.decryptFromSender(
							sentMessage.encrypted_content,
							''
						);

						sentMessage.content = decryptedContent;
						console.log(`🔐 [SENT] ✅ Decrypted sent message ${sentMessage.id}`);
					} catch (error) {
						console.error(`🔐 [SENT] ❌ Failed to decrypt sent message:`, error);
						sentMessage.content = content; // Fallback to original
					}
				} else {
					sentMessage.content = content;
				}

				// Don't add message locally - let SSE broadcast handle it
				return { success: true, data: sentMessage };
			}
		} catch (error) {
			console.error('Failed to send message:', error);

			let errorMessage = 'Failed to send message';

			if (error && error.message) {
				if (error.message.includes('KYBER') || error.message.includes('Nuclear Key Reset')) {
					errorMessage = 'Encryption failed due to incompatible key format. All participants must use the Nuclear Key Reset option in Settings to generate new encryption keys.';
				} else if (error.message.includes('invalid encapsulation key')) {
					errorMessage = 'Encryption failed due to key compatibility issues. Both participants need to reset their encryption keys.';
				} else if (error.message.includes('Failed to encrypt message for any participants')) {
					errorMessage = 'Failed to encrypt message for any participants. Try using the Nuclear Key Reset option in Settings.';
				} else if (error.message.includes('Users with incompatible keys detected')) {
					errorMessage = error.message; // Use the detailed error message from multi-recipient encryption
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
			await apiPost('/api/typing/start', { conversationId });
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
			await apiPost('/api/typing/stop', { conversationId });
		} catch (error) {
			console.error('Failed to stop typing:', error);
		}
	}

	/**
	 * Set typing indicator with auto-stop
	 * @param {string} conversationId - Conversation ID
	 */
	function setTyping(conversationId) {
		if (typingTimeout) {
			clearTimeout(typingTimeout);
		}

		startTyping(conversationId);

		typingTimeout = setTimeout(() => {
			stopTyping(conversationId);
		}, 3000);
	}

	/**
	 * Handle new message from SSE broadcast
	 * @param {Object} messagePayload - Message payload from broadcast
	 */
	async function handleNewMessage(messagePayload) {
		const message = messagePayload.message;
		const shouldReloadMessages = messagePayload.shouldReloadMessages;

		console.log(`🔐 [NEW] Processing new message ${message.id} for conversation ${message.conversation_id}`);

		// Get current state
		let currentState;
		const unsubscribe = subscribe(state => {
			currentState = state;
		});
		unsubscribe();

		// If shouldReloadMessages, reload all messages
		if (shouldReloadMessages) {
			console.log(`🔐 [NEW] Message ${message.id} requires message reload`);

			if (currentState.activeConversation === message.conversation_id) {
				console.log(`🔐 [NEW] Reloading messages for active conversation`);
				await loadMessages(message.conversation_id);
				return;
			} else {
				console.log(`🔐 [NEW] Message for inactive conversation, refreshing list`);
				await loadConversations();
				return;
			}
		}

		// Decrypt message
		if (message.encrypted_content) {
			try {
				console.log(`🔐 [NEW] Decrypting new message ${message.id}`);

				const decryptedContent = await postQuantumEncryption.decryptFromSender(
					message.encrypted_content,
					''
				);

				message.content = decryptedContent;
				console.log(`🔐 [NEW] ✅ Decrypted new message ${message.id}`);
			} catch (error) {
				console.error(`🔐 [NEW] ❌ Failed to decrypt message:`, error);

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
			}
		} else if (message.content) {
			console.log(`🔐 [NEW] ⚠️ Message has content but no encrypted_content`);
		} else {
			console.log(`🔐 [NEW] ⚠️ Message has no content`);
			message.content = '[No content]';
		}

		// Update state
		update(state => {
			if (state.activeConversation === message.conversation_id) {
				const exists = state.messages.some(msg => msg.id === message.id);
				if (!exists) {
					console.log(`🔐 [NEW] Adding message to state`);
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
	 * Create a new conversation
	 * @param {Object} conversationData - Conversation data
	 */
	async function createConversation(conversationData) {
		try {
			const response = await apiPost('/api/conversations/create', conversationData);

			if (response.success) {
				const newConversation = response.conversation;
				const conversationId = newConversation.id;

				console.log(`🔑 Ensuring user encryption for new conversation: ${conversationId}`);
				await publicKeyService.initializeUserEncryption();

				await loadConversations();
				return { success: true, data: newConversation };
			}
		} catch (error) {
			console.error('Failed to create conversation:', error);
			return { success: false, error: 'Failed to create conversation' };
		}
	}

	/**
	 * Archive a conversation
	 * @param {string} conversationId - Conversation ID
	 */
	const archiveConversation = (conversationId) =>
		conversationUtils.archiveConversation(apiPost, loadConversations, conversationId);

	/**
	 * Unarchive a conversation
	 * @param {string} conversationId - Conversation ID
	 */
	const unarchiveConversation = (conversationId) =>
		conversationUtils.unarchiveConversation(apiPost, loadConversations, conversationId);

	/**
	 * Delete a conversation permanently
	 * @param {string} conversationId - Conversation ID
	 */
	const deleteConversation = (conversationId) =>
		conversationUtils.deleteConversation(apiPost, loadConversations, conversationId);

	return {
		subscribe,

		// Connection management
		connect,
		disconnect,

		// Conversation management
		loadConversations,
		joinConversation,
		leaveConversation,
		createConversation,
		archiveConversation,
		unarchiveConversation,
		deleteConversation,

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

		// Get current state
		getState: () => {
			let currentState;
			subscribe(state => currentState = state)();
			return currentState;
		},

		// For compatibility with WebRTC (returns null since no WebSocket)
		getWebSocket: () => null
	};
}

// Create and export the chat store
export const chat = createChatStore();

// Maintain backward compatibility
export const wsChat = chat;

// Derived stores for convenience
export const conversations = derived(chat, $chat => $chat.conversations);
export const groups = derived(chat, $chat => $chat.groups);
export const activeConversation = derived(chat, $chat => $chat.activeConversation);
export const messages = derived(chat, $chat => $chat.messages);
export const isLoading = derived(chat, $chat => $chat.loading);
export const chatError = derived(chat, $chat => $chat.error);
export const typingUsers = derived(chat, $chat => $chat.typingUsers);
export const isConnected = derived(chat, $chat => $chat.connected);
export const isAuthenticated = derived(chat, $chat => $chat.authenticated);
export const currentUser = derived(chat, $chat => $chat.user);

// Clean up on page unload
if (browser) {
	window.addEventListener('beforeunload', () => {
		chat.disconnect();
	});
}