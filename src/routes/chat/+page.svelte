<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { auth, user, isAuthenticated } from '$lib/stores/auth.js';
	import { wsChat, activeConversation, isConnected, isAuthenticated as wsAuthenticated } from '$lib/stores/websocket-chat.js';
	import { t } from '$lib/stores/i18n.js';
	import ChatSidebar from '$lib/components/ChatSidebar.svelte';
	import MessageList from '$lib/components/chat/MessageList.svelte';
	import MessageInput from '$lib/components/chat/MessageInput.svelte';

	let showWelcome = $state(false);
	let activeConversationId = $state(/** @type {string | null} */ (null));
	let showSidebar = $state(true);

	// Handle conversation selection
	function handleConversationSelect(/** @type {string} */ conversationId) {
		activeConversationId = conversationId;
		// On mobile, hide sidebar when a conversation is selected
		if (window.innerWidth <= 768) {
			showSidebar = false;
		}
		// The ChatSidebar already handles joining the conversation via wsChat.joinConversation()
		// so we don't need to duplicate that logic here
	}

	// Toggle sidebar visibility on mobile
	function toggleSidebar() {
		showSidebar = !showSidebar;
	}

	// Handle back to conversations on mobile
	function handleBackToConversations() {
		showSidebar = true;
		activeConversationId = null;
	}

	// Redirect if not authenticated and initialize WebSocket
	onMount(() => {
		if (!$isAuthenticated) {
			goto('/auth');
			return;
		}

		// Initialize WebSocket connection when authenticated
		const storedSession = localStorage.getItem('qrypt_session');
		if (storedSession && !$isConnected) {
			try {
				const session = JSON.parse(storedSession);
				if (session.access_token) {
					console.log('Initializing WebSocket connection...');
					wsChat.connect(session.access_token);
				}
			} catch (error) {
				console.error('Failed to parse session for WebSocket:', error);
			}
		}
	});

	onMount(() => {
		// Check for welcome parameter
		const urlParams = new URLSearchParams(window.location.search);
		showWelcome = urlParams.get('welcome') === 'true';
		
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
						<!-- Mobile Header -->
						<div class="mobile-header">
							<button class="back-button" onclick={handleBackToConversations}>
								← Back
							</button>
							<div class="conversation-title">
								Chat
							</div>
							<button class="menu-button" onclick={toggleSidebar}>
								☰
							</button>
						</div>
						
						<MessageList conversationId={activeConversationId} />
						<MessageInput conversationId={activeConversationId} />
					</div>
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
	</div>
{/if}

<style>
	.chat-container {
		height: 100vh;
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
	}

	.mobile-header {
		display: none;
		align-items: center;
		justify-content: space-between;
		padding: 1rem;
		background: var(--color-surface);
		border-bottom: 1px solid var(--color-border);
		position: sticky;
		top: 0;
		z-index: 10;
	}

	.back-button,
	.menu-button {
		background: none;
		border: none;
		color: var(--color-text-primary);
		font-size: 1rem;
		cursor: pointer;
		padding: 0.5rem;
		border-radius: 0.375rem;
		transition: background-color 0.2s ease;
	}

	.back-button:hover,
	.menu-button:hover {
		background: var(--color-background);
	}

	.conversation-title {
		font-weight: 600;
		color: var(--color-text-primary);
	}

	.chat-interface {
		flex: 1;
		display: flex;
		flex-direction: column;
		height: 100%;
		background: var(--color-background);
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
		.mobile-header {
			display: flex;
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