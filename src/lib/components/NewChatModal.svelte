<script>
	import { createEventDispatcher } from 'svelte';
	import { chat } from '$lib/stores/chat.js';
	import { user } from '$lib/stores/auth.js';
	import { messages } from '$lib/stores/messages.js';

	const dispatch = createEventDispatcher();

	// Local state
	let activeTab = 'direct'; // 'direct' or 'group'
	let loading = false;
	let searchQuery = '';
	let searchResults = [];
	let searchLoading = false;

	// Group creation form
	let groupName = '';
	let groupDescription = '';
	let isPublicGroup = false;

	// Handle close
	function handleClose() {
		dispatch('close');
	}

	// Handle tab change
	function setActiveTab(tab) {
		activeTab = tab;
		searchQuery = '';
		searchResults = [];
	}

	// Search for users
	async function searchUsers() {
		if (!searchQuery.trim() || searchQuery.length < 2) {
			searchResults = [];
			return;
		}

		searchLoading = true;
		try {
			// This would typically search your users table
			// For now, we'll simulate the search
			await new Promise(resolve => setTimeout(resolve, 500));
			
			// Mock search results - in real implementation, this would query the database
			searchResults = [
				{
					id: 'user-1',
					username: 'john_doe',
					display_name: 'John Doe',
					avatar_url: null
				},
				{
					id: 'user-2',
					username: 'jane_smith',
					display_name: 'Jane Smith',
					avatar_url: null
				}
			].filter(user => 
				user.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
				user.display_name.toLowerCase().includes(searchQuery.toLowerCase())
			);
		} catch (error) {
			console.error('Failed to search users:', error);
			messages.error('Failed to search users');
		} finally {
			searchLoading = false;
		}
	}

	// Handle user search input
	function handleSearchInput() {
		searchUsers();
	}

	// Start direct conversation
	async function startDirectConversation(otherUser) {
		if (!$user?.id) return;

		loading = true;
		try {
			const result = await chat.createDirectConversation($user.id, otherUser.id);
			
			if (result.success) {
				messages.success(`Started conversation with ${otherUser.display_name}`);
				dispatch('created', result.data);
				handleClose();
			} else {
				messages.error(result.error || 'Failed to start conversation');
			}
		} catch (error) {
			console.error('Failed to start conversation:', error);
			messages.error('Failed to start conversation');
		} finally {
			loading = false;
		}
	}

	// Create group
	async function createGroup() {
		if (!groupName.trim() || !$user?.id) return;

		loading = true;
		try {
			const result = await chat.createGroup({
				name: groupName.trim(),
				description: groupDescription.trim() || null,
				isPublic: isPublicGroup
			}, $user.id);

			if (result.success) {
				messages.success(`Created group "${groupName}"`);
				dispatch('created', result.data);
				handleClose();
			} else {
				messages.error(result.error || 'Failed to create group');
			}
		} catch (error) {
			console.error('Failed to create group:', error);
			messages.error('Failed to create group');
		} finally {
			loading = false;
		}
	}

	// Handle form submit
	function handleSubmit(event) {
		event.preventDefault();
		if (activeTab === 'group') {
			createGroup();
		}
	}
</script>

<div class="modal-overlay" on:click={handleClose}>
	<div class="modal-content" on:click|stopPropagation>
		<div class="modal-header">
			<h2>Start New Chat</h2>
			<button class="close-button" on:click={handleClose}>
				<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
					<path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
				</svg>
			</button>
		</div>

		<div class="modal-tabs">
			<button 
				class="tab-button" 
				class:active={activeTab === 'direct'}
				on:click={() => setActiveTab('direct')}
			>
				Direct Message
			</button>
			<button 
				class="tab-button" 
				class:active={activeTab === 'group'}
				on:click={() => setActiveTab('group')}
			>
				Create Group
			</button>
		</div>

		<div class="modal-body">
			{#if activeTab === 'direct'}
				<div class="direct-chat-section">
					<div class="search-section">
						<div class="search-input">
							<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" class="search-icon">
								<path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
							</svg>
							<input 
								type="text" 
								placeholder="Search users by username or name..." 
								bind:value={searchQuery}
								on:input={handleSearchInput}
							/>
						</div>
					</div>

					<div class="search-results">
						{#if searchLoading}
							<div class="loading-state">
								<div class="loading-spinner"></div>
								<p>Searching users...</p>
							</div>
						{:else if searchQuery && searchResults.length === 0}
							<div class="empty-state">
								<p>No users found matching "{searchQuery}"</p>
							</div>
						{:else if searchResults.length > 0}
							{#each searchResults as searchUser (searchUser.id)}
								<button 
									class="user-item"
									on:click={() => startDirectConversation(searchUser)}
									disabled={loading}
								>
									<div class="user-avatar">
										{#if searchUser.avatar_url}
											<img src={searchUser.avatar_url} alt={searchUser.display_name} />
										{:else}
											<div class="avatar-placeholder">
												{searchUser.display_name.charAt(0).toUpperCase()}
											</div>
										{/if}
									</div>
									<div class="user-info">
										<div class="user-name">{searchUser.display_name}</div>
										<div class="username">@{searchUser.username}</div>
									</div>
								</button>
							{/each}
						{:else}
							<div class="search-prompt">
								<svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor" class="search-icon-large">
									<path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
								</svg>
								<h3>Find someone to chat with</h3>
								<p>Search for users by their username or display name to start a conversation.</p>
							</div>
						{/if}
					</div>
				</div>
			{:else}
				<form class="group-form" on:submit={handleSubmit}>
					<div class="form-group">
						<label for="group-name">Group Name *</label>
						<input 
							id="group-name"
							type="text" 
							bind:value={groupName}
							placeholder="Enter group name..."
							required
							maxlength="50"
						/>
					</div>

					<div class="form-group">
						<label for="group-description">Description</label>
						<textarea 
							id="group-description"
							bind:value={groupDescription}
							placeholder="What's this group about? (optional)"
							maxlength="200"
							rows="3"
						></textarea>
					</div>

					<div class="form-group">
						<label class="checkbox-label">
							<input 
								type="checkbox" 
								bind:checked={isPublicGroup}
							/>
							<span class="checkbox-text">Make this group public</span>
						</label>
						<p class="help-text">
							Public groups can be discovered and joined by anyone with an invite link.
						</p>
					</div>

					<div class="form-actions">
						<button type="button" class="cancel-button" on:click={handleClose}>
							Cancel
						</button>
						<button 
							type="submit" 
							class="create-button"
							disabled={!groupName.trim() || loading}
						>
							{#if loading}
								<div class="button-spinner"></div>
								Creating...
							{:else}
								Create Group
							{/if}
						</button>
					</div>
				</form>
			{/if}
		</div>
	</div>
</div>

<style>
	.modal-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: 1rem;
	}

	.modal-content {
		background: var(--color-surface);
		border-radius: 0.75rem;
		width: 100%;
		max-width: 500px;
		max-height: 80vh;
		display: flex;
		flex-direction: column;
		box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1.5rem 1.5rem 0 1.5rem;
	}

	.modal-header h2 {
		margin: 0;
		font-size: 1.25rem;
		font-weight: 600;
		color: var(--color-text-primary);
	}

	.close-button {
		background: none;
		border: none;
		color: var(--color-text-secondary);
		cursor: pointer;
		padding: 0.5rem;
		border-radius: 0.375rem;
		transition: all 0.2s ease;
	}

	.close-button:hover {
		background: var(--color-surface-hover);
		color: var(--color-text-primary);
	}

	.modal-tabs {
		display: flex;
		padding: 1rem 1.5rem 0 1.5rem;
		border-bottom: 1px solid var(--color-border);
	}

	.tab-button {
		background: none;
		border: none;
		padding: 0.75rem 1rem;
		cursor: pointer;
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--color-text-secondary);
		border-bottom: 2px solid transparent;
		transition: all 0.2s ease;
	}

	.tab-button.active {
		color: var(--color-primary-600);
		border-bottom-color: var(--color-primary-600);
	}

	.tab-button:hover:not(.active) {
		color: var(--color-text-primary);
	}

	.modal-body {
		flex: 1;
		overflow-y: auto;
		padding: 1.5rem;
	}

	.search-section {
		margin-bottom: 1rem;
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

	.search-results {
		max-height: 300px;
		overflow-y: auto;
	}

	.loading-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 2rem;
		color: var(--color-text-secondary);
	}

	.loading-spinner {
		width: 24px;
		height: 24px;
		border: 2px solid var(--color-border);
		border-top: 2px solid var(--color-primary-500);
		border-radius: 50%;
		animation: spin 1s linear infinite;
		margin-bottom: 0.5rem;
	}

	@keyframes spin {
		0% { transform: rotate(0deg); }
		100% { transform: rotate(360deg); }
	}

	.empty-state {
		text-align: center;
		padding: 2rem;
		color: var(--color-text-secondary);
	}

	.search-prompt {
		text-align: center;
		padding: 3rem 2rem;
		color: var(--color-text-secondary);
	}

	.search-icon-large {
		margin-bottom: 1rem;
		opacity: 0.5;
	}

	.search-prompt h3 {
		margin: 0 0 0.5rem 0;
		color: var(--color-text-primary);
		font-size: 1.125rem;
	}

	.search-prompt p {
		margin: 0;
		font-size: 0.875rem;
		line-height: 1.4;
	}

	.user-item {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem;
		background: none;
		border: none;
		cursor: pointer;
		text-align: left;
		border-radius: 0.5rem;
		transition: background-color 0.2s ease;
	}

	.user-item:hover {
		background: var(--color-surface-hover);
	}

	.user-item:disabled {
		opacity: 0.5;
		cursor: not-allowed;
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
		font-size: 1rem;
	}

	.user-info {
		flex: 1;
		min-width: 0;
	}

	.user-name {
		font-weight: 500;
		color: var(--color-text-primary);
		font-size: 0.875rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.username {
		font-size: 0.75rem;
		color: var(--color-text-secondary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.group-form {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.form-group {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.form-group label {
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--color-text-primary);
	}

	.form-group input,
	.form-group textarea {
		padding: 0.75rem;
		border: 1px solid var(--color-border);
		border-radius: 0.5rem;
		background: var(--color-background);
		color: var(--color-text-primary);
		font-size: 0.875rem;
		transition: border-color 0.2s ease;
	}

	.form-group input:focus,
	.form-group textarea:focus {
		outline: none;
		border-color: var(--color-primary-500);
	}

	.form-group textarea {
		resize: vertical;
		min-height: 80px;
	}

	.checkbox-label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		cursor: pointer;
	}

	.checkbox-text {
		font-size: 0.875rem;
		color: var(--color-text-primary);
	}

	.help-text {
		margin: 0;
		font-size: 0.75rem;
		color: var(--color-text-secondary);
		line-height: 1.4;
	}

	.form-actions {
		display: flex;
		gap: 0.75rem;
		justify-content: flex-end;
		padding-top: 1rem;
		border-top: 1px solid var(--color-border);
	}

	.cancel-button {
		background: none;
		border: 1px solid var(--color-border);
		color: var(--color-text-secondary);
		padding: 0.75rem 1.5rem;
		border-radius: 0.5rem;
		cursor: pointer;
		font-size: 0.875rem;
		font-weight: 500;
		transition: all 0.2s ease;
	}

	.cancel-button:hover {
		background: var(--color-surface-hover);
		color: var(--color-text-primary);
	}

	.create-button {
		background: var(--color-primary-600);
		color: white;
		border: none;
		padding: 0.75rem 1.5rem;
		border-radius: 0.5rem;
		cursor: pointer;
		font-size: 0.875rem;
		font-weight: 500;
		transition: background-color 0.2s ease;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.create-button:hover:not(:disabled) {
		background: var(--color-primary-700);
	}

	.create-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.button-spinner {
		width: 16px;
		height: 16px;
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-top: 2px solid white;
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}
</style>