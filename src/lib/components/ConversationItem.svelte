<script>
	import { createEventDispatcher } from 'svelte';

	// Props
	let { 
		conversation, 
		active = false, 
		isRoom = false 
	} = $props();

	const dispatch = createEventDispatcher();

	// Handle click
	function handleClick() {
		dispatch('select', conversation.id);
	}

	// Format last message time
	function formatTime(/** @type {string | null | undefined} */ timestamp) {
		if (!timestamp) return '';
		
		const date = new Date(timestamp);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffMins = Math.floor(diffMs / 60000);
		const diffHours = Math.floor(diffMs / 3600000);
		const diffDays = Math.floor(diffMs / 86400000);

		if (diffMins < 1) return 'now';
		if (diffMins < 60) return `${diffMins}m`;
		if (diffHours < 24) return `${diffHours}h`;
		if (diffDays < 7) return `${diffDays}d`;
		
		return date.toLocaleDateString();
	}

	// Truncate message content
	function truncateMessage(/** @type {string | null | undefined} */ content, maxLength = 50) {
		if (!content) return '';
		if (content.length <= maxLength) return content;
		return content.substring(0, maxLength) + '...';
	}

	// Truncate conversation ID for debugging
	function truncateConversationId(/** @type {string | null | undefined} */ id) {
		if (!id) return '';
		return id.substring(0, 8);
	}
</script>

<button
	class="conversation-item"
	class:active
	class:is-room={isRoom}
	onclick={handleClick}
>
	<div class="conversation-avatar">
		{#if conversation.avatar_url}
			<img src={conversation.avatar_url} alt={conversation.name} />
		{:else if isRoom}
			<div class="room-icon">
				<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
					<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
				</svg>
			</div>
		{:else}
			<div class="avatar-placeholder">
				{(conversation.name || 'U').charAt(0).toUpperCase()}
			</div>
		{/if}
	</div>

	<div class="conversation-content">
		<div class="conversation-header">
			<div class="conversation-name">
				{#if isRoom}
					<span class="room-prefix">#</span>
				{/if}
				{conversation.name || 'Unknown'}
			</div>
			
			<div class="conversation-meta">
				{#if conversation.last_message_at}
					<div class="conversation-time">
						{formatTime(conversation.last_message_at)}
					</div>
				{/if}
				<div class="conversation-id" title={conversation.id}>
					{truncateConversationId(conversation.id)}
				</div>
			</div>
		</div>

		<div class="conversation-preview">
			{#if conversation.last_message_content}
				<div class="last-message">
					{#if conversation.last_message_sender_username && conversation.type !== 'direct'}
						<span class="sender-name">{conversation.last_message_sender_username}:</span>
					{/if}
					<span class="message-content">
						{truncateMessage(conversation.last_message_content)}
					</span>
				</div>
			{:else}
				<div class="no-messages">
					{isRoom ? 'No messages in this room' : 'No messages yet'}
				</div>
			{/if}

			{#if conversation.unread_count && conversation.unread_count > 0}
				<div class="unread-badge">
					{conversation.unread_count > 99 ? '99+' : conversation.unread_count}
				</div>
			{/if}
		</div>
	</div>
</button>

<style>
	.conversation-item {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		background: none;
		border: none;
		cursor: pointer;
		text-align: left;
		transition: background-color 0.2s ease;
		border-radius: 0;
		position: relative;
	}

	.conversation-item:hover {
		background: var(--color-surface-hover);
	}

	.conversation-item.active {
		background: var(--color-primary-100);
		border-right: 3px solid var(--color-primary-500);
	}

	.conversation-item.is-room {
		padding-left: 1.5rem;
		font-size: 0.875rem;
	}

	.conversation-avatar {
		width: 40px;
		height: 40px;
		border-radius: 50%;
		overflow: hidden;
		flex-shrink: 0;
		position: relative;
	}

	.is-room .conversation-avatar {
		width: 32px;
		height: 32px;
	}

	.conversation-avatar img {
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
		font-size: 1rem;
	}

	.is-room .avatar-placeholder {
		font-size: 0.875rem;
	}

	.room-icon {
		width: 100%;
		height: 100%;
		background: var(--color-surface-hover);
		color: var(--color-text-secondary);
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
	}

	.conversation-content {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.conversation-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.conversation-name {
		font-weight: 600;
		color: var(--color-text-primary);
		font-size: 0.875rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}

	.room-prefix {
		color: var(--color-text-secondary);
		font-weight: 400;
	}

	.conversation-meta {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-shrink: 0;
	}

	.conversation-time {
		font-size: 0.75rem;
		color: var(--color-text-secondary);
		flex-shrink: 0;
	}

	.conversation-id {
		font-size: 0.625rem;
		color: var(--color-text-secondary);
		opacity: 0.6;
		font-family: monospace;
		background: var(--color-surface-hover);
		padding: 0.125rem 0.25rem;
		border-radius: 0.25rem;
		flex-shrink: 0;
	}

	.conversation-preview {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.last-message {
		flex: 1;
		min-width: 0;
		font-size: 0.75rem;
		color: var(--color-text-secondary);
		display: flex;
		gap: 0.25rem;
	}

	.sender-name {
		font-weight: 500;
		color: var(--color-text-primary);
		flex-shrink: 0;
	}

	.message-content {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.no-messages {
		flex: 1;
		font-size: 0.75rem;
		color: var(--color-text-secondary);
		font-style: italic;
	}

	.unread-badge {
		background: var(--color-primary-500);
		color: white;
		font-size: 0.625rem;
		font-weight: 600;
		padding: 0.125rem 0.375rem;
		border-radius: 0.75rem;
		min-width: 1.25rem;
		text-align: center;
		flex-shrink: 0;
	}

	/* Active state adjustments */
	.conversation-item.active .conversation-name {
		color: var(--color-primary-700);
	}

	.conversation-item.active .last-message {
		color: var(--color-primary-600);
	}

	.conversation-item.active .sender-name {
		color: var(--color-primary-700);
	}

	/* Dark mode support */
	@media (prefers-color-scheme: dark) {
		.conversation-item.active {
			background: var(--color-primary-900);
		}

		.conversation-item.active .conversation-name {
			color: var(--color-primary-300);
		}

		.conversation-item.active .last-message {
			color: var(--color-primary-400);
		}

		.conversation-item.active .sender-name {
			color: var(--color-primary-300);
		}
	}
</style>