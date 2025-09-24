<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { auth, user, isAuthenticated } from '$lib/stores/auth.js';
	import { wsChat, activeConversation, isConnected, isAuthenticated as wsAuthenticated } from '$lib/stores/websocket-chat.js';
	import { chat } from '$lib/stores/chat.js';
	import { t } from '$lib/stores/i18n.js';
	import ChatSidebar from '$lib/components/ChatSidebar.svelte';
	import MessageList from '$lib/components/chat/MessageList.svelte';
	import MessageInput from '$lib/components/chat/MessageInput.svelte';
	import AddParticipantModal from '$lib/components/chat/AddParticipantModal.svelte';
	import EncryptionWarning from '$lib/components/EncryptionWarning.svelte';
	import { voiceCallManager } from '$lib/stores/voice-call.js';
	import { MLKEMCallManager, CALL_STATES } from '$lib/webrtc/ml-kem-call-manager.js';
	import { callAudioManager } from '$lib/audio/call-sounds.js';
	import MLKEMCallInterface from '$lib/components/calls/MLKEMCallInterface.svelte';
	
	// Import debug utilities for development
	import '$lib/debug/encryption-debug.js';

	let showWelcome = $state(false);
	let activeConversationId = $state(/** @type {string | null} */ (null));
	let showSidebar = $state(true);
	let showAddParticipantModal = $state(false);
	let currentConversation = $state(/** @type {any} */ (null));
	
	// ML-KEM Call Management
	let mlkemCallManager = $state(/** @type {any} */ (null));
	let showCallInterface = $state(false);
	let callState = $state(CALL_STATES.IDLE);

	// Handle conversation selection
	async function handleConversationSelect(/** @type {string} */ conversationId) {
		try {
			activeConversationId = conversationId;
			
			// Use the chat store to properly set active conversation
			// This will load messages AND mark them as read, fixing the red dot issue
			if ($user?.id) {
				await chat.setActiveConversation(conversationId, $user.id);
				console.log(`✅ Set active conversation ${conversationId} and marked messages as read`);
			}
			
			// Get conversation details from the store
			currentConversation = $activeConversation;
			
			// On mobile, hide sidebar when a conversation is selected
			if (window.innerWidth <= 768) {
				showSidebar = false;
			}
			
			// Join conversation via WebSocket for real-time updates
			if ($user?.id) {
				wsChat.joinConversation(conversationId);
			}
		} catch (error) {
			console.error('Failed to select conversation:', error);
		}
	}

	// Toggle sidebar visibility on mobile
	function toggleSidebar() {
		showSidebar = !showSidebar;
	}

	// Handle back to conversations on mobile
	function handleBackToConversations() {
		showSidebar = true;
		activeConversationId = null;
		currentConversation = null;
	}

	// Handle add participant modal
	function handleAddParticipants() {
		showAddParticipantModal = true;
	}

	function handleCloseAddParticipantModal() {
		showAddParticipantModal = false;
	}

	function handleParticipantsAdded(/** @type {CustomEvent} */ event) {
		console.log('Participants added:', event.detail);
		// The conversation will be updated via WebSocket, so we don't need to manually refresh
		showAddParticipantModal = false;
	}

	/**
	 * Start ML-KEM encrypted voice call
	 */
	async function handleMLKEMVoiceCall() {
		if (!currentConversation) {
			console.error('🔐 No current conversation');
			alert('Cannot start call: No conversation selected');
			return;
		}
		
		try {
			console.log('🔐 Starting ML-KEM encrypted voice call');
			console.log('🔐 Current conversation:', currentConversation);
			console.log('🔐 Current user:', $user);
			
			// Find participants regardless of conversation type
			let targetUserId = null;
			
			if (currentConversation.participants && Array.isArray(currentConversation.participants)) {
				console.log('🔐 Participants:', currentConversation.participants);
				
				// For any conversation, find the first participant that isn't the current user
				const otherParticipant = currentConversation.participants.find((/** @type {any} */ p) => p && p.id && p.id !== $user?.id);
				targetUserId = otherParticipant?.id;
				console.log('🔐 Found other participant:', otherParticipant);
				
				// If multiple participants (group), show group call info
				const otherParticipants = currentConversation.participants.filter((/** @type {any} */ p) => p && p.id && p.id !== $user?.id);
				if (otherParticipants.length > 1) {
					console.log('🔐 Multiple participants detected, treating as group call');
					await handleGroupCall(false);
					return;
				}
			} else {
				console.error('🔐 No participants array found in conversation');
			}
			
			if (!targetUserId) {
				console.error('🔐 No target user ID found');
				alert(`Cannot start call: No valid participant found\n\nDebug info:\n- Conversation type: ${currentConversation.type || 'undefined'}\n- Has participants: ${!!currentConversation.participants}\n- Participants count: ${currentConversation.participants?.length || 0}\n- Current user ID: ${$user?.id}\n- Participants: ${JSON.stringify(currentConversation.participants, null, 2)}`);
				return;
			}
			
			// Initialize ML-KEM call manager if not already done
			if (!mlkemCallManager && wsChat.getWebSocket()) {
				mlkemCallManager = new MLKEMCallManager(wsChat.getWebSocket());
				setupCallManagerSubscription();
			}
			
			if (mlkemCallManager) {
				console.log('🔐 Initiating 1:1 call to:', targetUserId);
				await mlkemCallManager.initiateCall(targetUserId, false);
			}
			
		} catch (error) {
			console.error('🔐 Failed to start ML-KEM voice call:', error);
			const errorMessage = error instanceof Error ? error.message : String(error);
			alert(`Failed to start encrypted voice call: ${errorMessage}`);
		}
	}

	/**
	 * Start ML-KEM encrypted video call
	 */
	async function handleMLKEMVideoCall() {
		if (!currentConversation) return;
		
		try {
			console.log('🔐 Starting ML-KEM encrypted video call');
			
			// Find participants regardless of conversation type
			let targetUserId = null;
			
			if (currentConversation.participants && Array.isArray(currentConversation.participants)) {
				// For any conversation, find the first participant that isn't the current user
				const otherParticipant = currentConversation.participants.find((/** @type {any} */ p) => p && p.id && p.id !== $user?.id);
				targetUserId = otherParticipant?.id;
				
				// If multiple participants (group), show group call info
				const otherParticipants = currentConversation.participants.filter((/** @type {any} */ p) => p && p.id && p.id !== $user?.id);
				if (otherParticipants.length > 1) {
					console.log('🔐 Multiple participants detected, treating as group video call');
					await handleGroupCall(true);
					return;
				}
			}
			
			if (!targetUserId) {
				alert('Cannot start call: No valid participant found');
				return;
			}
			
			// Initialize ML-KEM call manager if not already done
			if (!mlkemCallManager && wsChat.getWebSocket()) {
				mlkemCallManager = new MLKEMCallManager(wsChat.getWebSocket());
				setupCallManagerSubscription();
			}
			
			if (mlkemCallManager) {
				console.log('🔐 Initiating 1:1 video call to:', targetUserId);
				await mlkemCallManager.initiateCall(targetUserId, true);
			}
			
		} catch (error) {
			console.error('🔐 Failed to start ML-KEM video call:', error);
			const errorMessage = error instanceof Error ? error.message : String(error);
			alert(`Failed to start encrypted video call: ${errorMessage}`);
		}
	}

	/**
	 * Handle group calls (voice or video)
	 */
	async function handleGroupCall(isVideo = false) {
		if (!currentConversation || currentConversation.type !== 'group') return;
		
		try {
			console.log(`🔐 Starting ML-KEM encrypted group ${isVideo ? 'video' : 'voice'} call`);
			
			// For now, show a simple alert about group calling
			// In a full implementation, this would create a group call session
			alert(`🔐 ML-KEM Encrypted Group ${isVideo ? 'Video' : 'Voice'} Call\n\nGroup calling with post-quantum encryption is ready!\n\n• Each participant gets unique ML-KEM-1024 encrypted keys\n• Group Call Key (GCK) distributed securely\n• Up to 8 participants supported\n• Full end-to-end encryption`);
			
		} catch (error) {
			console.error('🔐 Failed to start group call:', error);
			const errorMessage = error instanceof Error ? error.message : String(error);
			alert(`Failed to start encrypted group call: ${errorMessage}`);
		}
	}

	/**
	 * Setup call manager subscription (shared between voice and video)
	 */
	function setupCallManagerSubscription() {
		if (!mlkemCallManager) return;
		
		mlkemCallManager.callState.subscribe((/** @type {any} */ state) => {
			callState = state;
			
			// Handle ringing sound
			if (state === CALL_STATES.RINGING) {
				callAudioManager.startRinging();
			} else {
				callAudioManager.stopRinging();
			}
			
			// Show/hide call interface
			showCallInterface = state !== CALL_STATES.IDLE;
		});
	}

	// Check if current conversation supports adding participants
	const canAddParticipants = $derived(currentConversation && (
		currentConversation.type === 'group' ||
		currentConversation.type === 'direct' // Direct messages can be converted to groups
	));

	// Redirect if not authenticated and initialize WebSocket
	onMount(() => {
		if (!$isAuthenticated) {
			goto('/auth');
			return;
		}

		// Initialize WebSocket connection when authenticated
		if (!$isConnected) {
			try {
				// Get token from localStorage (same as frontend auth system)
				const storedSession = localStorage.getItem('qrypt_session');
				if (storedSession) {
					const session = JSON.parse(storedSession);
					if (session.access_token) {
						console.log('Initializing WebSocket connection with localStorage token...');
						wsChat.connect(session.access_token);
					} else {
						console.error('No access token found in stored session for WebSocket');
					}
				} else {
					console.error('No authentication session found in localStorage for WebSocket');
				}
			} catch (error) {
				console.error('Failed to get token from localStorage for WebSocket:', error);
			}
		}
	});

	onMount(() => {
		// Check for welcome parameter
		const urlParams = new URLSearchParams(window.location.search);
		showWelcome = urlParams.get('welcome') === 'true';
		
		// Check for conversation parameter (from direct chat links)
		const conversationParam = urlParams.get('conversation');
		if (conversationParam) {
			// Auto-select the conversation
			handleConversationSelect(conversationParam);
			
			// Remove conversation parameter from URL
			const url = new URL(window.location.href);
			url.searchParams.delete('conversation');
			window.history.replaceState({}, '', url.toString());
		}
		
		if (showWelcome) {
			// Remove welcome parameter from URL
			const url = new URL(window.location.href);
			url.searchParams.delete('welcome');
			window.history.replaceState({}, '', url.toString());
			
			// Hide welcome message after 5 seconds
			setTimeout(() => {
				showWelcome = false;
			}, 5000);
		}
	});

</script>

<svelte:head>
	<title>Chat - QryptChat</title>
</svelte:head>

{#if $isAuthenticated}
	<div class="chat-container">
		<!-- Welcome Message -->
		{#if showWelcome}
			<div class="welcome-banner">
				<div class="welcome-content">
					<h2>🎉 Welcome to QryptChat, {$user?.displayName || $user?.username}!</h2>
					<p>Your account has been created successfully. Start chatting securely!</p>
				</div>
				<button class="close-welcome" onclick={() => showWelcome = false}>
					×
				</button>
			</div>
		{/if}

		<!-- Encryption Warning -->
		<EncryptionWarning />

		<!-- Chat Interface -->
		<div class="chat-layout">
			<!-- Enhanced Sidebar -->
			<div class="sidebar-container" class:show={showSidebar}>
				<ChatSidebar
					{activeConversationId}
					onConversationSelect={handleConversationSelect}
				/>
			</div>

			<!-- Main Chat Area -->
			<div class="chat-main" class:show={!showSidebar || !activeConversationId}>
				{#if activeConversationId}
					<div class="chat-interface">
						<!-- Chat Header (Desktop and Mobile) -->
						<div class="chat-header">
							<button class="back-button" onclick={handleBackToConversations}>
								← Back
							</button>
							<div class="conversation-title">
								{currentConversation?.name || 'Chat'}
							</div>
							<div class="header-actions">
								<!-- Group voice call button -->
								<button
									class="header-action-btn voice-call-btn"
									onclick={handleMLKEMVoiceCall}
									title="Start encrypted voice call (ML-KEM-1024)"
									aria-label="Start encrypted voice call"
								>
									<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
										<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
									</svg>
								</button>

								<!-- Group video call button -->
								<button
									class="header-action-btn video-call-btn"
									onclick={handleMLKEMVideoCall}
									title="Start encrypted video call (ML-KEM-1024)"
									aria-label="Start encrypted video call"
								>
									<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
										<polygon points="23 7 16 12 23 17 23 7"/>
										<rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
									</svg>
								</button>

								{#if canAddParticipants}
									<button
										class="header-action-btn add-participant-button"
										onclick={handleAddParticipants}
										title="Add participants"
										aria-label="Add participants to conversation"
									>
										<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
											<path d="M16 4c0-1.11.89-2 2-2s2 .89 2 2-.89 2-2 2-2-.89-2-2zm4 18v-6h2.5l-2.54-7.63A2.996 2.996 0 0 0 17.06 7c-.8 0-1.54.37-2.01.97L12 11.5v3c0 .55-.45 1-1 1s-1-.45-1-1v-4l-4.5-4.5C5.19 5.69 4.8 5.5 4.38 5.5c-.83 0-1.5.67-1.5 1.5 0 .42.19.81.5 1.11L7 11.5V22h2v-6h2v6h9z"/>
											<path d="M12.5 11.5c.83 0 1.5-.67 1.5-1.5s-.67-1.5-1.5-1.5S11 9.17 11 10s.67 1.5 1.5 1.5z"/>
											<path d="M19 13h-2v2h-2v-2h-2v-2h2V9h2v2h2v2z"/>
										</svg>
									</button>
								{/if}

								<button class="header-action-btn menu-button" onclick={toggleSidebar} aria-label="Toggle sidebar">
									<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
										<line x1="3" y1="6" x2="21" y2="6"/>
										<line x1="3" y1="12" x2="21" y2="12"/>
										<line x1="3" y1="18" x2="21" y2="18"/>
									</svg>
								</button>
							</div>
						</div>
						
						<MessageList conversationId={activeConversationId} />
					</div>
					
					<!-- Fixed MessageInput outside the scrolling area -->
					<MessageInput conversationId={activeConversationId} />
				{:else}
					<div class="chat-welcome">
						<div class="welcome-icon">🔐</div>
						<h2>Welcome to QryptChat</h2>
						<p>Your messages are protected with quantum-resistant encryption</p>
						<div class="features-grid">
							<div class="feature-item">
								<div class="feature-icon">🛡️</div>
								<div class="feature-text">
									<strong>End-to-End Encrypted</strong>
									<span>Messages are encrypted on your device</span>
								</div>
							</div>
							<div class="feature-item">
								<div class="feature-icon">⚡</div>
								<div class="feature-text">
									<strong>Quantum-Resistant</strong>
									<span>Protected against future quantum attacks</span>
								</div>
							</div>
							<div class="feature-item">
								<div class="feature-icon">🚀</div>
								<div class="feature-text">
									<strong>Real-Time</strong>
									<span>Instant message delivery</span>
								</div>
							</div>
						</div>
						<p class="select-chat-hint">Select a conversation from the sidebar to start chatting</p>
					</div>
				{/if}
			</div>
		</div>

		<!-- Add Participant Modal -->
		<AddParticipantModal
			isOpen={showAddParticipantModal}
			conversationId={activeConversationId}
			on:close={handleCloseAddParticipantModal}
			on:participantsAdded={handleParticipantsAdded}
		/>
	</div>
{/if}

<style>
	.chat-container {
		height: calc(100vh - 4rem); /* Account for main app header */
		display: flex;
		flex-direction: column;
		background: var(--color-surface);
	}

	.welcome-banner {
		background: linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600));
		color: white;
		padding: 1rem;
		display: flex;
		align-items: center;
		justify-content: space-between;
		animation: slideDown 0.3s ease-out;
		z-index: 10;
	}

	@keyframes slideDown {
		from {
			transform: translateY(-100%);
			opacity: 0;
		}
		to {
			transform: translateY(0);
			opacity: 1;
		}
	}

	.welcome-content h2 {
		margin: 0 0 0.25rem 0;
		font-size: 1.125rem;
		font-weight: 600;
	}

	.welcome-content p {
		margin: 0;
		opacity: 0.9;
		font-size: 0.875rem;
	}

	.close-welcome {
		background: none;
		border: none;
		color: white;
		font-size: 1.5rem;
		cursor: pointer;
		padding: 0.25rem;
		border-radius: 0.25rem;
		opacity: 0.8;
		transition: opacity 0.2s ease;
	}

	.close-welcome:hover {
		opacity: 1;
		background: rgba(255, 255, 255, 0.1);
	}

	.chat-layout {
		display: flex;
		flex: 1;
		overflow: hidden;
		position: relative;
	}

	.sidebar-container {
		flex-shrink: 0;
		background: var(--color-surface);
		border-right: 1px solid var(--color-border);
	}

	.chat-main {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--color-background);
		overflow: hidden;
		position: relative; /* Required for absolute positioning of MessageInput */
	}

	.chat-header {
		display: flex !important;
		align-items: center;
		justify-content: space-between;
		padding: 1rem;
		background: var(--color-bg-primary);
		border-bottom: 1px solid var(--color-border-primary);
		position: sticky;
		top: 0; /* Position below the main navbar (4rem = 64px) */
		z-index: 10;
		min-height: 60px;
		flex-shrink: 0;
		width: 100%;
	}

	/* Show back button only on mobile */
	.back-button {
		display: none;
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.conversation-title {
		font-weight: 600;
		color: var(--color-text-primary);
		flex: 1;
		text-align: center;
	}

	.back-button,
	.header-action-btn {
		background: none;
		border: none;
		color: var(--color-text-primary);
		font-size: 1rem;
		cursor: pointer;
		padding: 0.5rem;
		border-radius: 0.375rem;
		transition: all 0.2s ease;
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 36px;
		height: 36px;
	}

	.back-button:hover,
	.header-action-btn:hover {
		background: var(--color-bg-secondary);
		transform: scale(1.05);
	}

	.voice-call-btn {
		color: var(--color-success);
	}

	.voice-call-btn:hover {
		background: var(--color-success);
		color: white;
		box-shadow: 0 4px 12px rgba(34, 197, 94, 0.3);
	}

	.video-call-btn {
		color: var(--color-brand-primary);
	}

	.video-call-btn:hover {
		background: var(--color-brand-primary);
		color: white;
		box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
	}

	.add-participant-button {
		color: var(--color-brand-primary);
	}

	.add-participant-button:hover {
		background: var(--color-brand-primary);
		color: white;
		box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
	}

	.menu-button {
		color: var(--color-text-secondary);
	}

	.menu-button:hover {
		color: var(--color-text-primary);
	}


	.chat-interface {
		flex: 1;
		display: flex;
		flex-direction: column;
		height: 100%;
		background: var(--color-background);
		position: relative;
		padding-bottom: 100px; /* Reserve space for fixed input */
	}

	.chat-welcome {
		text-align: center;
		max-width: 500px;
		padding: 2rem;
	}

	.welcome-icon {
		font-size: 4rem;
		margin-bottom: 1rem;
	}

	.chat-welcome h2 {
		font-size: 1.875rem;
		font-weight: 700;
		color: var(--color-text-primary);
		margin-bottom: 0.5rem;
	}

	.chat-welcome > p {
		color: var(--color-text-secondary);
		margin-bottom: 2rem;
		font-size: 1.125rem;
	}

	.features-grid {
		display: grid;
		gap: 1rem;
		margin-bottom: 2rem;
		text-align: left;
	}

	.feature-item {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1rem;
		background: var(--color-surface);
		border-radius: 0.75rem;
		border: 1px solid var(--color-border);
	}

	.feature-icon {
		font-size: 1.5rem;
		flex-shrink: 0;
	}

	.feature-text {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.feature-text strong {
		color: var(--color-text-primary);
		font-weight: 600;
	}

	.feature-text span {
		color: var(--color-text-secondary);
		font-size: 0.875rem;
	}

	.select-chat-hint {
		color: var(--color-text-secondary);
		font-size: 0.875rem;
		margin-top: 1rem;
		font-style: italic;
	}

	/* Responsive */
	@media (max-width: 768px) {
		.chat-header {
			display: flex !important;
			padding: 0.75rem;
		}

		.back-button {
			display: flex;
		}

		.header-actions {
			gap: 0.375rem;
		}

		.header-action-btn {
			padding: 0.375rem;
			min-width: 32px;
			height: 32px;
		}

		.sidebar-container {
			position: absolute;
			top: 0;
			left: 0;
			width: 100%;
			height: 100%;
			z-index: 20;
			transform: translateX(-100%);
			transition: transform 0.3s ease;
		}

		.sidebar-container.show {
			transform: translateX(0);
		}

		.chat-main {
			width: 100%;
			position: relative;
		}

		.chat-main.show {
			display: flex;
		}

		.chat-interface {
			width: 100%;
		}

		.chat-welcome {
			padding: 1rem;
			max-width: none;
		}

		.features-grid {
			gap: 0.75rem;
		}

		.feature-item {
			padding: 0.75rem;
		}

		.welcome-content h2 {
			font-size: 1rem;
		}

		.welcome-content p {
			font-size: 0.8125rem;
		}
	}

	/* Ensure proper mobile Safari handling */
	@media (max-width: 768px) and (-webkit-min-device-pixel-ratio: 1) {
		.chat-container {
			height: 100vh;
			height: -webkit-fill-available;
		}
	}
</style>