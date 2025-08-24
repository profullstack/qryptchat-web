<script>
	import { onMount, onDestroy } from 'svelte';
	import { wsChat, conversations, groups, isConnected, isAuthenticated } from '$lib/stores/websocket-chat.js';
	import { user } from '$lib/stores/auth.js';
	import ConversationItem from './ConversationItem.svelte';
	import GroupItem from './GroupItem.svelte';
	import NewChatModal from './NewChatModal.svelte';
	import JoinGroupModal from './JoinGroupModal.svelte';

	// Props
	let { activeConversationId = null, onConversationSelect = () => {} } = $props();

	// Local state using Svelte 5 runes
	let searchQuery = $state('');
	let showNewChatModal = $state(false);
	let showJoinGroupModal = $state(false);
	let expandedGroups = $state(new Set());
	let loading = $state(false);
	let hasLoadedConversations = $state(false);

	// Derived state using Svelte 5 runes
	const filteredConversations = $derived(searchQuery
		? $conversations.filter(conv =>
			conv.conversation_name?.toLowerCase().includes(searchQuery.toLowerCase())
		)
		: $conversations);

	const directMessages = $derived(filteredConversations.filter(conv => conv.conversation_type === 'direct'));
	const groupConversations = $derived(filteredConversations.filter(conv => conv.conversation_type === 'group'));
	const roomConversations = $derived(filteredConversations.filter(conv => conv.conversation_type === 'room'));

	// Group rooms by group_id
	const groupedRooms = $derived(roomConversations.reduce((acc, room) => {
		if (!room.group_id) return acc;
		const groupId = room.group_id;
		if (!acc[groupId]) acc[groupId] = [];
		acc[groupId].push(room);
		return acc;
	}, /** @type {Record<string, any[]>} */ ({})));

	// Load data when WebSocket is authenticated (only once)
	$effect(() => {
		if ($isAuthenticated && $user?.id && !hasLoadedConversations) {
			loadConversationsData();
		}
	});

	// Reset the flag when component mounts to allow fresh loading
	$effect(() => {
		hasLoadedConversations = false;
	});

	async function loadConversationsData() {
		if (loading || hasLoadedConversations) return; // Prevent multiple simultaneous loads
		
		loading = true;
		try {
			await wsChat.loadConversations();
			hasLoadedConversations = true; // Mark as loaded
		} catch (error) {
			console.error('Failed to load conversations:', error);
		} finally {
			loading = false;
		}
	}

	// Handle conversation selection
	function handleConversationSelect(/** @type {string} */ conversationId) {
		onConversationSelect(conversationId);
		if ($user?.id) {
			wsChat.joinConversation(conversationId);
		}
	}

	// Toggle group expansion
	function toggleGroup(/** @type {string} */ groupId) {
		if (expandedGroups.has(groupId)) {
			expandedGroups.delete(groupId);
		} else {
			expandedGroups.add(groupId);
		}
		expandedGroups = new Set(expandedGroups); // Trigger reactivity
	}

	// Handle new chat creation
	function handleNewChat() {
		showNewChatModal = true;
	}

	// Handle join group
	function handleJoinGroup() {
		showJoinGroupModal = true;
	}

	// Handle successful group join
	async function handleGroupJoined() {
		if ($user?.id) {
			hasLoadedConversations = false; // Reset flag to allow reload
			await Promise.all([
				wsChat.loadConversations()
			]);
			hasLoadedConversations = true; // Mark as loaded again
		}
	}

	// Handle new conversation created
	async function handleConversationCreated(event) {
		const { conversationId } = event.detail;
		
		// Reload conversations to get the new one
		if ($user?.id) {
			hasLoadedConversations = false; // Reset flag to allow reload
			await Promise.all([
				wsChat.loadConversations()
			]);
			hasLoadedConversations = true; // Mark as loaded again
		}
		
		// Auto-select the new conversation
		if (conversationId) {
			handleConversationSelect(conversationId);
		}
	}

	// Format last message time
	function formatMessageTime(/** @type {string | null | undefined} */ timestamp) {
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
</script>

<div class="chat-sidebar">
	<!-- Header -->
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
		
		<div class="header-actions">
			<button class="action-button" onclick={handleNewChat} title="New Chat" aria-label="Create new chat">
				<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
					<path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
				</svg>
			</button>
			<button class="action-button" onclick={handleJoinGroup} title="Join Group" aria-label="Join existing group">
				<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
					<path d="M16 4c0-1.11.89-2 2-2s2 .89 2 2-.89 2-2 2-2-.89-2-2zm4 18v-6h2.5l-2.54-7.63A2.996 2.996 0 0 0 17.06 7c-.8 0-1.54.37-2.01.97L12 11.5v3c0 .55-.45 1-1 1s-1-.45-1-1v-4l-4.5-4.5C5.19 5.69 4.8 5.5 4.38 5.5c-.83 0-1.5.67-1.5 1.5 0 .42.19.81.5 1.11L7 11.5V22h2v-6h2v6h9z"/>
				</svg>
			</button>
		</div>
	</div>

	<!-- Search -->
	<div class="search-section">
		<div class="search-input">
			<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" class="search-icon">
				<path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
			</svg>
			<input 
				type="text" 
				placeholder="Search conversations..." 
				bind:value={searchQuery}
			/>
		</div>
	</div>

	<!-- Content -->
	<div class="sidebar-content">
		{#if loading}
			<div class="loading-state">
				<div class="loading-spinner"></div>
				<p>Loading conversations...</p>
			</div>
		{:else}
			<!-- Groups Section -->
			{#if $groups.length > 0}
				<div class="section">
					<div class="section-header">
						<h3>Groups</h3>
						<span class="section-count">{$groups.length}</span>
					</div>
					
					{#each $groups as group (group.group_id)}
						<div class="group-container">
							<GroupItem 
								{group}
								expanded={expandedGroups.has(group.group_id)}
								on:toggle={() => toggleGroup(group.group_id)}
							/>
							
							{#if expandedGroups.has(group.group_id) && groupedRooms[group.group_id]}
								<div class="group-rooms">
									{#each (groupedRooms[group.group_id] || []) as room (room.conversation_id)}
										<ConversationItem
											conversation={room}
											active={activeConversationId === room.conversation_id}
											isRoom={true}
											on:select={() => handleConversationSelect(room.conversation_id)}
										/>
									{/each}
								</div>
							{/if}
						</div>
					{/each}
				</div>
			{/if}

			<!-- Direct Messages Section -->
			{#if directMessages.length > 0}
				<div class="section">
					<div class="section-header">
						<h3>Direct Messages</h3>
						<span class="section-count">{directMessages.length}</span>
					</div>
					
					{#each directMessages as conversation (conversation.conversation_id)}
						<ConversationItem
							{conversation}
							active={activeConversationId === conversation.conversation_id}
							on:select={() => handleConversationSelect(conversation.conversation_id)}
						/>
					{/each}
				</div>
			{/if}

			<!-- Group Conversations (legacy) -->
			{#if groupConversations.length > 0}
				<div class="section">
					<div class="section-header">
						<h3>Group Chats</h3>
						<span class="section-count">{groupConversations.length}</span>
					</div>
					
					{#each groupConversations as conversation (conversation.conversation_id)}
						<ConversationItem
							{conversation}
							active={activeConversationId === conversation.conversation_id}
							on:select={() => handleConversationSelect(conversation.conversation_id)}
						/>
					{/each}
				</div>
			{/if}

			<!-- Empty State -->
			{#if !loading && $conversations.length === 0}
				<div class="empty-state">
					<div class="empty-icon">💬</div>
					<h3>No conversations yet</h3>
					<p>Start a new chat or join a group to begin messaging</p>
					<div class="empty-actions">
						<button class="primary-button" onclick={handleNewChat}>
							Start Chatting
						</button>
						<button class="secondary-button" onclick={() => {
							console.log('🔄 Debug: Forcing conversation reload');
							hasLoadedConversations = false;
							loadConversationsData();
						}}>
							Reload Conversations
						</button>
					</div>
				</div>
			{/if}
		{/if}
	</div>
</div>

<!-- Modals -->
{#if showNewChatModal}
	<NewChatModal
		isOpen={showNewChatModal}
		on:close={() => showNewChatModal = false}
		on:conversationCreated={handleConversationCreated}
	/>
{/if}

{#if showJoinGroupModal}
	<JoinGroupModal 
		on:close={() => showJoinGroupModal = false}
		on:joined={handleGroupJoined}
	/>
{/if}

<style>
	.chat-sidebar {
		width: 320px;
		height: 100vh;
		background: var(--color-surface);
		border-right: 1px solid var(--color-border);
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.sidebar-header {
		padding: 1rem;
		border-bottom: 1px solid var(--color-border);
		display: flex;
		align-items: center;
		justify-content: space-between;
		background: var(--color-surface);
		z-index: 1;
	}

	.user-info {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex: 1;
		min-width: 0;
	}

	.user-avatar {
		width: 40px;
		height: 40px;
		border-radius: 50%;
		overflow: hidden;
		flex-shrink: 0;
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
		min-width: 0;
	}

	.user-name {
		font-weight: 600;
		color: var(--color-text-primary);
		font-size: 0.875rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.user-status {
		font-size: 0.75rem;
		color: var(--color-success-600);
	}

	.header-actions {
		display: flex;
		gap: 0.5rem;
	}

	.action-button {
		background: none;
		border: none;
		color: var(--color-text-secondary);
		cursor: pointer;
		padding: 0.5rem;
		border-radius: 0.375rem;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.2s ease;
	}

	.action-button:hover {
		background: var(--color-surface-hover);
		color: var(--color-text-primary);
	}

	.search-section {
		padding: 1rem;
		border-bottom: 1px solid var(--color-border);
	}

	.search-input {
		position: relative;
		display: flex;
		align-items: center;
	}

	.search-icon {
		position: absolute;
		left: 0.75rem;
		color: var(--color-text-secondary);
		z-index: 1;
	}

	.search-input input {
		width: 100%;
		padding: 0.75rem 0.75rem 0.75rem 2.5rem;
		border: 1px solid var(--color-border);
		border-radius: 0.5rem;
		background: var(--color-background);
		color: var(--color-text-primary);
		font-size: 0.875rem;
		transition: border-color 0.2s ease;
	}

	.search-input input:focus {
		outline: none;
		border-color: var(--color-primary-500);
	}

	.search-input input::placeholder {
		color: var(--color-text-secondary);
	}

	.sidebar-content {
		flex: 1;
		overflow-y: auto;
		padding: 0.5rem 0;
	}

	.section {
		margin-bottom: 1rem;
	}

	.section-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.5rem 1rem;
		margin-bottom: 0.25rem;
	}

	.section-header h3 {
		margin: 0;
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--color-text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.section-count {
		font-size: 0.75rem;
		color: var(--color-text-secondary);
		background: var(--color-surface-hover);
		padding: 0.125rem 0.375rem;
		border-radius: 0.75rem;
		min-width: 1.25rem;
		text-align: center;
	}

	.group-container {
		margin-bottom: 0.25rem;
	}

	.group-rooms {
		margin-left: 1rem;
		border-left: 2px solid var(--color-border);
		padding-left: 0.5rem;
	}

	.loading-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 2rem 1rem;
		color: var(--color-text-secondary);
	}

	.loading-spinner {
		width: 32px;
		height: 32px;
		border: 3px solid var(--color-border);
		border-top: 3px solid var(--color-primary-500);
		border-radius: 50%;
		animation: spin 1s linear infinite;
		margin-bottom: 1rem;
	}

	@keyframes spin {
		0% { transform: rotate(0deg); }
		100% { transform: rotate(360deg); }
	}

	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 2rem 1rem;
		text-align: center;
		color: var(--color-text-secondary);
	}

	.empty-icon {
		font-size: 3rem;
		margin-bottom: 1rem;
		opacity: 0.5;
	}

	.empty-state h3 {
		margin: 0 0 0.5rem 0;
		color: var(--color-text-primary);
		font-size: 1.125rem;
	}

	.empty-state p {
		margin: 0 0 1.5rem 0;
		font-size: 0.875rem;
		line-height: 1.4;
	}

	.empty-actions {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		align-items: center;
	}

	.primary-button {
		background: var(--color-primary-600);
		color: white;
		border: none;
		padding: 0.75rem 1.5rem;
		border-radius: 0.5rem;
		font-weight: 500;
		cursor: pointer;
		transition: background-color 0.2s ease;
	}

	.primary-button:hover {
		background: var(--color-primary-700);
	}

	.secondary-button {
		background: var(--color-surface-hover);
		color: var(--color-text-primary);
		border: 1px solid var(--color-border);
		padding: 0.5rem 1rem;
		border-radius: 0.375rem;
		font-size: 0.875rem;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.secondary-button:hover {
		background: var(--color-border);
	}

	/* Responsive */
	@media (max-width: 768px) {
		.chat-sidebar {
			width: 100%;
			max-width: 320px;
		}
	}

	/* Scrollbar styling */
	.sidebar-content::-webkit-scrollbar {
		width: 6px;
	}

	.sidebar-content::-webkit-scrollbar-track {
		background: transparent;
	}

	.sidebar-content::-webkit-scrollbar-thumb {
		background: var(--color-border);
		border-radius: 3px;
	}

	.sidebar-content::-webkit-scrollbar-thumb:hover {
		background: var(--color-text-secondary);
	}
</style>