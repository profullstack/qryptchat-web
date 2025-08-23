<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { auth, user, isAuthenticated } from '$lib/stores/auth.js';
	import { t } from '$lib/stores/i18n.js';

	let showWelcome = false;

	// Handle starting a new chat
	function handleNewChat() {
		// For now, show a simple alert - this would be replaced with actual chat functionality
		alert('New chat functionality coming soon! This will open a dialog to start a new conversation.');
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
			<!-- Sidebar -->
			<div class="chat-sidebar">
				<div class="sidebar-header">
					<div class="user-info">
						<div class="user-avatar">
							{#if $user?.avatarUrl}
								<img src={$user.avatarUrl} alt={$user.displayName} />
							{:else}
								<div class="avatar-placeholder">
									{($user?.displayName || $user?.username || 'U').charAt(0).toUpperCase()}
								</div>
							{/if}
						</div>
						<div class="user-details">
							<div class="user-name">{$user?.displayName || $user?.username}</div>
							<div class="user-status">Online</div>
						</div>
					</div>
				</div>

				<div class="conversations-section">
					<div class="section-header">
						<h3>Conversations</h3>
						<button class="new-chat-button" on:click={handleNewChat} title="New Chat">
							+
						</button>
					</div>
					
					<div class="conversations-list">
						<div class="empty-state">
							<div class="empty-icon">💬</div>
							<p>No conversations yet</p>
							<p class="empty-subtitle">Start a new chat to begin messaging</p>
						</div>
					</div>
				</div>
			</div>

			<!-- Main Chat Area -->
			<div class="chat-main">
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
					<button class="start-chat-button" on:click={handleNewChat}>
						Start Your First Chat
					</button>
				</div>
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

	.chat-sidebar {
		width: 320px;
		background: var(--color-surface);
		border-right: 1px solid var(--color-border);
		display: flex;
		flex-direction: column;
	}

	.sidebar-header {
		padding: 1rem;
		border-bottom: 1px solid var(--color-border);
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.user-info {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.user-avatar {
		width: 40px;
		height: 40px;
		border-radius: 50%;
		overflow: hidden;
	}

	.user-avatar img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.avatar-placeholder {
		width: 100%;
		height: 100%;
		background: var(--color-primary-500);
		color: white;
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 600;
		font-size: 1.125rem;
	}

	.user-details {
		flex: 1;
	}

	.user-name {
		font-weight: 600;
		color: var(--color-text-primary);
		font-size: 0.875rem;
	}

	.user-status {
		font-size: 0.75rem;
		color: var(--color-success-600);
	}


	.conversations-section {
		flex: 1;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.section-header {
		padding: 1rem;
		display: flex;
		align-items: center;
		justify-content: space-between;
		border-bottom: 1px solid var(--color-border);
	}

	.section-header h3 {
		margin: 0;
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--color-text-primary);
	}

	.new-chat-button {
		background: var(--color-primary-500);
		color: white;
		border: none;
		width: 28px;
		height: 28px;
		border-radius: 50%;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1rem;
		font-weight: 600;
		transition: background-color 0.2s ease;
	}

	.new-chat-button:hover {
		background: var(--color-primary-600);
	}

	.conversations-list {
		flex: 1;
		overflow-y: auto;
		padding: 1rem;
	}

	.empty-state {
		text-align: center;
		padding: 2rem 1rem;
		color: var(--color-text-secondary);
	}

	.empty-icon {
		font-size: 3rem;
		margin-bottom: 1rem;
		opacity: 0.5;
	}

	.empty-state p {
		margin: 0.5rem 0;
	}

	.empty-subtitle {
		font-size: 0.875rem;
		opacity: 0.7;
	}

	.chat-main {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
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

	.start-chat-button {
		background: var(--color-primary-600);
		color: white;
		border: none;
		padding: 0.75rem 1.5rem;
		border-radius: 0.5rem;
		font-weight: 500;
		cursor: pointer;
		transition: background-color 0.2s ease;
	}

	.start-chat-button:hover {
		background: var(--color-primary-700);
	}

	@media (max-width: 768px) {
		.chat-sidebar {
			width: 100%;
			max-width: 320px;
		}
		
		.chat-main {
			display: none;
		}
	}
</style>