<script>
	import { onMount, tick } from 'svelte';
	import { wsChat, messages as messagesStore } from '$lib/stores/websocket-chat.js';
	import { user } from '$lib/stores/auth.js';
	import MessageItem from './MessageItem.svelte';
	import TypingIndicator from './TypingIndicator.svelte';

	let { conversationId = null } = $props();

	let messagesContainer = $state(/** @type {HTMLDivElement | null} */ (null));
	let shouldScrollToBottom = $state(true);
	let isLoadingMore = $state(false);

	const messages = $derived($messagesStore || []);
	const currentUser = $derived($user);
	const typingUsers = $derived(/** @type {any[]} */ ([])); // TODO: Implement typing users from store

	// Auto-scroll to bottom when new messages arrive
	$effect(() => {
		if (shouldScrollToBottom && messagesContainer && messages.length > 0) {
			tick().then(() => {
				if (messagesContainer) {
					messagesContainer.scrollTop = messagesContainer.scrollHeight;
				}
			});
		}
	});

	// Load messages when conversation changes
	$effect(() => {
		if (conversationId) {
			loadMessages();
		}
	});

	async function loadMessages() {
		try {
			if (currentUser?.id) {
				await wsChat.loadMessages(conversationId);
				shouldScrollToBottom = true;
			}
		} catch (error) {
			console.error('Failed to load messages:', error);
		}
	}

	async function loadMoreMessages() {
		if (isLoadingMore || !conversationId || messages.length === 0) return;

		try {
			isLoadingMore = true;
			const oldScrollHeight = messagesContainer?.scrollHeight || 0;
			
			// TODO: Implement pagination in WebSocket store
			console.log('Load more messages not yet implemented in WebSocket store');
			
			// Maintain scroll position after loading older messages
			await tick();
			if (messagesContainer) {
				const newScrollHeight = messagesContainer.scrollHeight;
				messagesContainer.scrollTop = newScrollHeight - oldScrollHeight;
			}
		} catch (error) {
			console.error('Failed to load more messages:', error);
		} finally {
			isLoadingMore = false;
		}
	}

	function handleScroll() {
		if (!messagesContainer) return;

		const { scrollTop, scrollHeight, clientHeight } = messagesContainer;
		
		// Check if user scrolled to top (load more messages)
		if (scrollTop === 0 && !isLoadingMore) {
			loadMoreMessages();
		}

		// Check if user is near bottom (auto-scroll new messages)
		shouldScrollToBottom = scrollTop + clientHeight >= scrollHeight - 100;
	}

	function shouldShowDateSeparator(/** @type {any} */ message, /** @type {number} */ index) {
		if (index === 0) return true;
		
		const currentDate = new Date(message.created_at).toDateString();
		const previousDate = new Date(messages[index - 1].created_at).toDateString();
		
		return currentDate !== previousDate;
	}

	onMount(() => {
		// Mark messages as read when component mounts
		if (conversationId && currentUser?.id) {
			const messageIds = messages
				.filter(msg => msg.sender_id !== currentUser.id)
				.map(msg => msg.id);
			
			if (messageIds.length > 0) {
				// TODO: Implement mark as read in WebSocket store
				console.log('Mark messages as read not yet implemented in WebSocket store');
			}
		}
	});
</script>

<div class="message-list" bind:this={messagesContainer} onscroll={handleScroll}>
	{#if isLoadingMore}
		<div class="loading-indicator">
			<div class="loading-spinner"></div>
			<span>Loading more messages...</span>
		</div>
	{/if}

	{#if messages.length === 0}
		<div class="empty-state">
			<div class="empty-icon">💬</div>
			<h3>No messages yet</h3>
			<p>Start the conversation by sending a message!</p>
		</div>
	{:else}
		{#each messages as message, index (message.id)}
			{#if shouldShowDateSeparator(message, index)}
				<div class="date-separator">
					<span>{new Date(message.created_at).toLocaleDateString([], { 
						weekday: 'long', 
						year: 'numeric', 
						month: 'long', 
						day: 'numeric' 
					})}</span>
				</div>
			{/if}
			
			<MessageItem 
				{message} 
				isOwn={message.sender_id === currentUser?.id}
				showAvatar={index === 0 || messages[index - 1].sender_id !== message.sender_id}
				showTimestamp={index === messages.length - 1 || 
					messages[index + 1]?.sender_id !== message.sender_id ||
					new Date(messages[index + 1]?.created_at).getTime() - new Date(message.created_at).getTime() > 300000}
			/>
		{/each}
	{/if}

	{#if typingUsers.length > 0}
		<TypingIndicator users={typingUsers} />
	{/if}
</div>

<style>
	.message-list {
		flex: 1;
		overflow-y: auto;
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		background: var(--color-background);
	}

	.loading-indicator {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 1rem;
		color: var(--color-text-secondary);
		font-size: 0.875rem;
	}

	.loading-spinner {
		width: 1rem;
		height: 1rem;
		border: 2px solid var(--color-border);
		border-top: 2px solid var(--color-primary-500);
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		0% { transform: rotate(0deg); }
		100% { transform: rotate(360deg); }
	}

	.empty-state {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
		color: var(--color-text-secondary);
		padding: 2rem;
	}

	.empty-icon {
		font-size: 3rem;
		margin-bottom: 1rem;
		opacity: 0.5;
	}

	.empty-state h3 {
		margin: 0 0 0.5rem 0;
		font-size: 1.25rem;
		font-weight: 600;
		color: var(--color-text-primary);
	}

	.empty-state p {
		margin: 0;
		font-size: 0.875rem;
	}

	.date-separator {
		display: flex;
		align-items: center;
		justify-content: center;
		margin: 1rem 0;
		position: relative;
	}

	.date-separator::before {
		content: '';
		position: absolute;
		top: 50%;
		left: 0;
		right: 0;
		height: 1px;
		background: var(--color-border);
		z-index: 0;
	}

	.date-separator span {
		background: var(--color-background);
		padding: 0 1rem;
		font-size: 0.75rem;
		color: var(--color-text-secondary);
		font-weight: 500;
		z-index: 1;
		position: relative;
	}

	/* Scrollbar styling */
	.message-list::-webkit-scrollbar {
		width: 6px;
	}

	.message-list::-webkit-scrollbar-track {
		background: transparent;
	}

	.message-list::-webkit-scrollbar-thumb {
		background: var(--color-border);
		border-radius: 3px;
	}

	.message-list::-webkit-scrollbar-thumb:hover {
		background: var(--color-text-secondary);
	}
</style>