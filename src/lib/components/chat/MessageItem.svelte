<script>
	import { user } from '$lib/stores/auth.js';

	let { 
		message, 
		isOwn = false, 
		showAvatar = true, 
		showTimestamp = true 
	} = $props();

	const currentUser = $derived($user);

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
	{#if showAvatar && !isOwn}
		<div class="message-avatar">
			{#if getAvatarUrl(message.sender)}
				<img src={getAvatarUrl(message.sender)} alt={getDisplayName(message.sender)} />
			{:else}
				<div class="avatar-placeholder">
					{getInitials(getDisplayName(message.sender))}
				</div>
			{/if}
		</div>
	{/if}

	<div class="message-content" class:own-content={isOwn}>
		{#if !isOwn && showAvatar}
			<div class="message-header">
				<span class="sender-name">{getDisplayName(message.sender)}</span>
				<span class="message-time">{formatTime(message.created_at)}</span>
			</div>
		{/if}

		<div class="message-bubble" class:own-bubble={isOwn}>
			<div class="message-text">
				{message.encrypted_content || message.content || '[Message content unavailable]'}
			</div>
			
			{#if isOwn && showTimestamp}
				<div class="message-time own-time">{formatTime(message.created_at)}</div>
			{/if}
		</div>
	</div>
</div>

<style>
	.message-item {
		display: flex;
		gap: 0.75rem;
		margin-bottom: 0.5rem;
		padding: 0.25rem 0;
	}

	.message-item.own {
		flex-direction: row-reverse;
		justify-content: flex-start;
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
		background: var(--color-primary-500);
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

	.sender-name {
		font-weight: 600;
		font-size: 0.875rem;
		color: var(--color-text-primary);
	}

	.message-time {
		font-size: 0.75rem;
		color: var(--color-text-secondary);
	}

	.message-bubble {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 1rem;
		padding: 0.75rem 1rem;
		position: relative;
		word-wrap: break-word;
		overflow-wrap: break-word;
	}

	.message-bubble.own-bubble {
		background: var(--color-primary-500);
		color: white;
		border-color: var(--color-primary-600);
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

	/* Message bubble tails */
	.message-bubble::before {
		content: '';
		position: absolute;
		width: 0;
		height: 0;
		border-style: solid;
	}

	.message-bubble:not(.own-bubble)::before {
		left: -8px;
		top: 12px;
		border-width: 8px 8px 8px 0;
		border-color: transparent var(--color-border) transparent transparent;
	}

	.message-bubble:not(.own-bubble)::after {
		content: '';
		position: absolute;
		left: -7px;
		top: 12px;
		width: 0;
		height: 0;
		border-style: solid;
		border-width: 8px 8px 8px 0;
		border-color: transparent var(--color-surface) transparent transparent;
	}

	.message-bubble.own-bubble::before {
		right: -8px;
		top: 12px;
		border-width: 8px 0 8px 8px;
		border-color: transparent transparent transparent var(--color-primary-600);
	}

	.message-bubble.own-bubble::after {
		content: '';
		position: absolute;
		right: -7px;
		top: 12px;
		width: 0;
		height: 0;
		border-style: solid;
		border-width: 8px 0 8px 8px;
		border-color: transparent transparent transparent var(--color-primary-500);
	}

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