<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { auth, user, isAuthenticated } from '$lib/stores/auth.js';
	import { activeConversation } from '$lib/stores/chat.js';
	import { t } from '$lib/stores/i18n.js';
	import ChatSidebar from '$lib/components/ChatSidebar.svelte';

	let showWelcome = false;
	let activeConversationId = null;

	// Handle conversation selection
	function handleConversationSelect(conversationId) {
		activeConversationId = conversationId;
	}

	// Redirect if not authenticated
	onMount(() => {
		if (!$isAuthenticated) {
			goto('/auth');
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
				<button class="close-welcome" on:click={() => showWelcome = false}>
					×
				</button>
			</div>
		{/if}

		<!-- Chat Interface -->
		<div class="chat-layout">
			<!-- Enhanced Sidebar -->
			<ChatSidebar
				{activeConversationId}
				onConversationSelect={handleConversationSelect}
			/>

			<!-- Main Chat Area -->
			<div class="chat-main">
				{#if activeConversationId}
					<!-- TODO: Add ChatInterface component here -->
					<div class="chat-placeholder">
						<h3>Chat Interface Coming Soon</h3>
						<p>Selected conversation: {activeConversationId}</p>
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
	}

	.chat-main {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--color-background);
		overflow: hidden;
	}

	.chat-placeholder {
		text-align: center;
		padding: 2rem;
		color: var(--color-text-secondary);
	}

	.chat-placeholder h3 {
		margin: 0 0 0.5rem 0;
		color: var(--color-text-primary);
		font-size: 1.25rem;
	}

	.chat-placeholder p {
		margin: 0;
		font-size: 0.875rem;
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
		.chat-layout {
			position: relative;
		}
		
		.chat-main {
			display: none;
		}

		.chat-main.active {
			display: flex;
			position: absolute;
			top: 0;
			left: 0;
			right: 0;
			bottom: 0;
			z-index: 5;
		}
	}
</style>