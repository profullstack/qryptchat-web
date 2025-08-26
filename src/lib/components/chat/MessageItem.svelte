<script>
	import { user } from '$lib/stores/auth.js';

	let {
		message,
		isOwn = false,
		showAvatar = true,
		showTimestamp = true
	} = $props();

	const currentUser = $derived($user);
	
	// Use the already-decrypted content from WebSocket store
	const decryptedContent = $derived(message.content || '');

	function formatTime(/** @type {string} */ timestamp) {
		const date = new Date(timestamp);
		return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	}

	function getAvatarUrl(/** @type {any} */ sender) {
		return sender?.avatar_url || null;
	}

	function getDisplayName(/** @type {any} */ sender) {
		return sender?.display_name || sender?.username || 'Unknown User';
	}

	function getInitials(/** @type {string} */ name) {
		return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
	}
</script>

<div class="message-item" class:own={isOwn}>
	{#if !isOwn}
		<a href="/u/{message.sender?.username}" class="message-avatar-link">
			<div class="message-avatar">
				{#if getAvatarUrl(message.sender)}
					<img src={getAvatarUrl(message.sender)} alt={getDisplayName(message.sender)} />
				{:else}
					<div class="avatar-placeholder">
						{getInitials(getDisplayName(message.sender))}
					</div>
				{/if}
			</div>
		</a>
	{/if}

	<div class="message-content" class:own-content={isOwn}>
		{#if !isOwn}
			<div class="message-header">
				<a href="/u/{message.sender?.username}" class="sender-name-link">
					<span class="sender-name">{getDisplayName(message.sender)}</span>
				</a>
				<span class="message-time">{formatTime(message.created_at)}</span>
			</div>
		{/if}

		<div class="message-bubble" class:own-bubble={isOwn}>
			<div class="message-text">
				{decryptedContent}
			</div>
			
			{#if isOwn && showTimestamp}
				<div class="message-time own-time">{formatTime(message.created_at)}</div>
			{/if}
		</div>
	</div>

	{#if isOwn}
		<a href="/u/{currentUser?.username}" class="message-avatar-link">
			<div class="message-avatar">
				{#if currentUser?.avatarUrl}
					<img src={currentUser.avatarUrl} alt={currentUser.displayName || currentUser.username} />
				{:else}
					<div class="avatar-placeholder">
						{getInitials(currentUser?.displayName || currentUser?.username || 'You')}
					</div>
				{/if}
			</div>
		</a>
	{/if}
</div>

<style>
	.message-item {
		display: flex;
		gap: 0.75rem;
		margin-bottom: 0.5rem;
		padding: 0.25rem 0;
		width: 100%;
		align-items: flex-start;
	}

	.message-item.own {
		justify-content: flex-end;
		margin-left: auto;
		margin-right: 0;
		max-width: 80%;
	}

	.message-avatar-link {
		text-decoration: none;
		flex-shrink: 0;
		align-self: center;
		transition: opacity 0.2s ease;
	}

	.message-avatar-link:hover {
		opacity: 0.8;
	}

	.message-avatar {
		width: 32px;
		height: 32px;
		border-radius: 50%;
		overflow: hidden;
		flex-shrink: 0;
		align-self: flex-end;
	}

	.message-avatar img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.avatar-placeholder {
		width: 100%;
		height: 100%;
		background: var(--brand-primary);
		color: white;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.75rem;
		font-weight: 600;
	}

	.message-content {
		flex: 1;
		min-width: 0;
		max-width: 70%;
	}

	.message-content.own-content {
		max-width: 70%;
		align-self: flex-end;
	}

	.message-header {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		margin-bottom: 0.25rem;
	}

	.sender-name-link {
		text-decoration: none;
		transition: opacity 0.2s ease;
	}

	.sender-name-link:hover {
		opacity: 0.8;
	}

	.sender-name {
		font-weight: 600;
		font-size: 0.875rem;
		color: var(--text-primary);
	}

	.message-time {
		font-size: 0.75rem;
		color: var(--text-secondary);
	}

	.message-bubble {
		background: var(--bg-secondary);
		border: 1px solid var(--border-primary);
		border-radius: 1rem;
		padding: 0.75rem 1rem;
		position: relative;
		word-wrap: break-word;
		overflow-wrap: break-word;
		color: var(--text-primary);
	}

	.message-bubble.own-bubble {
		background: var(--brand-primary);
		color: white;
		border-color: var(--brand-primary);
	}

	.message-bubble.own-bubble .message-text {
		text-align: right;
	}
	
	.message-text {
		line-height: 1.4;
		font-size: 0.875rem;
	}

	.own-time {
		text-align: right;
		margin-top: 0.25rem;
		font-size: 0.75rem;
		opacity: 0.8;
	}

	.message-bubble.own-bubble .own-time {
		color: rgba(255, 255, 255, 0.8);
	}

	.decrypting-indicator {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: var(--text-secondary);
		font-style: italic;
		font-size: 0.8125rem;
	}

	.spinner {
		width: 0.875rem;
		height: 0.875rem;
		border: 2px solid transparent;
		border-top: 2px solid currentColor;
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* Removed message bubble tails to fix visual artifacts */

	/* Responsive adjustments */
	@media (max-width: 768px) {
		.message-content,
		.message-content.own-content {
			max-width: 85%;
		}

		.message-avatar {
			width: 28px;
			height: 28px;
		}

		.message-bubble {
			padding: 0.625rem 0.875rem;
		}

		.message-text {
			font-size: 0.8125rem;
		}
	}
</style>