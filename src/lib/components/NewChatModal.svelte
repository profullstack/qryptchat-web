<script>
	import { createEventDispatcher } from 'svelte';
	import { fade, fly } from 'svelte/transition';

import ChatRequestPromptModal from './ChatRequestPromptModal.svelte';
let showChatPrompt = $state(false);
let chatPromptResolve;
function showChatRequestPrompt() {
	return new Promise((resolve) => {
		showChatPrompt = true;
		chatPromptResolve = resolve;
	});
}

// Chat request prompt setting
let promptChatRequests = false;
if (typeof window !== 'undefined') {
	const saved = localStorage.getItem('promptChatRequests');
	promptChatRequests = saved === 'true';
}
	
	const dispatch = createEventDispatcher();
	
	// Props using Svelte 5 runes
	let { isOpen = $bindable(false) } = $props();
	
	// State using Svelte 5 runes
	let activeTab = $state('direct'); // 'direct', 'group', 'channel'
	let searchQuery = $state('');
	/** @type {any[]} */
	let searchResults = $state([]);
	/** @type {any[]} */
	let selectedUsers = $state([]);
	let groupName = $state('');
	let isSearching = $state(false);
	let isCreating = $state(false);
	/** @type {ReturnType<typeof setTimeout> | null} */
	let searchTimeout = $state(null);
	
	// Functions
	function closeModal() {
		isOpen = false;
		resetForm();
		dispatch('close');
	}
	
	function resetForm() {
		searchQuery = '';
		searchResults = [];
		selectedUsers = [];
		groupName = '';
		activeTab = 'direct';
		isSearching = false;
		isCreating = false;
	}
	
	function setActiveTab(/** @type {string} */ tab) {
		activeTab = tab;
		selectedUsers = [];
		searchQuery = '';
		searchResults = [];
		groupName = '';
	}
	
	async function searchUsers() {
		if (searchQuery.trim().length < 2) {
			searchResults = [];
			return;
		}
		
		isSearching = true;
		try {
			const response = await fetch(`/api/users/search?q=${encodeURIComponent(searchQuery)}`);
			const data = await response.json();
			
			if (response.ok) {
				searchResults = data.users || [];
			} else {
				console.error('Search error:', data.error);
				searchResults = [];
			}
		} catch (error) {
			console.error('Search error:', error);
			searchResults = [];
		} finally {
			isSearching = false;
		}
	}
	
	function handleSearchInput() {
		if (searchTimeout) {
			clearTimeout(searchTimeout);
		}
		searchTimeout = setTimeout(searchUsers, 300);
	}
	
	function toggleUserSelection(/** @type {any} */ user) {
		const index = selectedUsers.findIndex(u => u.id === user.id);
		if (index >= 0) {
			selectedUsers = selectedUsers.filter(u => u.id !== user.id);
		} else {
			selectedUsers = [...selectedUsers, user];
		}
	}
	
	function isUserSelected(/** @type {any} */ user) {
		return selectedUsers.some(u => u.id === user.id);
	}
	
	async function startDirectConversation() {
		if (selectedUsers.length === 0) {
			alert('Please select at least one user');
			return;
		}
		
		isCreating = true;
		try {

		 // If chat request prompt is enabled, show custom modal before creating
		 if (promptChatRequests) {
			 const accepted = await showChatRequestPrompt();
			 if (!accepted) {
				 isCreating = false;
				 return;
			 }
		 }

		 const response = await fetch('/api/chat/conversations', {
			 method: 'POST',
			 headers: {
				 'Content-Type': 'application/json'
			 },
			 body: JSON.stringify({
				 type: selectedUsers.length === 1 ? 'direct' : 'group',
				 participant_ids: selectedUsers.map(u => u.id),
				 name: selectedUsers.length > 1 ? `Chat with ${selectedUsers.map(u => u.display_name || u.username).join(', ')}` : undefined
			 })
		 });

		 const data = await response.json();

		 if (response.ok) {
			 dispatch('conversationCreated', {
				 conversationId: data.conversation_id,
				 type: selectedUsers.length === 1 ? 'direct' : 'group',
				 participants: selectedUsers
			 });
			 closeModal();
		 } else {
			 console.error('Create conversation error:', data.error);
			 alert('Failed to create conversation: ' + data.error);
		 }
		} catch (error) {
			console.error('Create conversation error:', error);
			alert('Failed to create conversation');
		} finally {
			isCreating = false;
		}
	}
	
	async function createGroupConversation() {
		if (selectedUsers.length === 0) {
			alert('Please select at least one user');
			return;
		}
		
		if (activeTab === 'group' && !groupName.trim()) {
			alert('Please enter a group name');
			return;
		}
		
		isCreating = true;
		try {
			const response = await fetch('/api/chat/conversations', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					type: activeTab === 'channel' ? 'room' : 'group',
					name: groupName.trim() || undefined,
					participant_ids: selectedUsers.map(u => u.id)
				})
			});
			
			const data = await response.json();
			
			if (response.ok) {
				dispatch('conversationCreated', {
					conversationId: data.conversation_id,
					type: activeTab,
					name: groupName.trim(),
					participants: selectedUsers
				});
				closeModal();
			} else {
				console.error('Create conversation error:', data.error);
				alert('Failed to create conversation: ' + data.error);
			}
		} catch (error) {
			console.error('Create conversation error:', error);
			alert('Failed to create conversation');
		} finally {
			isCreating = false;
		}
	}
	
	function handleSubmit(/** @type {Event} */ event) {
		event.preventDefault();
		
		if (activeTab === 'direct' && selectedUsers.length > 0) {
			startDirectConversation();
		} else if ((activeTab === 'group' || activeTab === 'channel') && selectedUsers.length > 0) {
			createGroupConversation();
		}
	}
	
	// Derived state using Svelte 5 runes
	const canCreate = $derived(activeTab === 'direct'
		? selectedUsers.length > 0
		: selectedUsers.length > 0 && (activeTab === 'channel' || groupName.trim()));
</script>

{#if isOpen}
	<div
		class="modal-overlay"
		transition:fade={{ duration: 300 }}
		onclick={closeModal}
		onkeydown={(e) => e.key === 'Escape' && closeModal()}
		role="dialog"
		aria-modal="true"
		aria-labelledby="modal-title"
		tabindex="0"
	>
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<div
			class="modal-container"
			transition:fly={{ y: 30, duration: 300, opacity: 0 }}
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
			role="document"
		>
			<!-- Header with gradient -->
			<div class="modal-header">
				<div class="header-content">
					<div class="header-icon">
						<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
							<path d="M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h4l4 4 4-4h4c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/>
						</svg>
					</div>
					<div class="header-text">
						<h2 id="modal-title">Create New Chat</h2>
						<p>Start a conversation with your contacts</p>
					</div>
				</div>
				<button
					onclick={closeModal}
					class="close-button"
					aria-label="Close modal"
				>
					<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
						<path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
					</svg>
				</button>
			</div>
			
			<!-- Enhanced Tabs -->
			<div class="tabs-container">
				<div class="tabs-wrapper">
					<button
						class="tab-button {activeTab === 'direct' ? 'active' : ''}"
						onclick={() => setActiveTab('direct')}
					>
						<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
							<path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
						</svg>
						<span>Direct</span>
					</button>
					<button
						class="tab-button {activeTab === 'group' ? 'active' : ''}"
						onclick={() => setActiveTab('group')}
					>
						<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
							<path d="M16 4c0-1.11.89-2 2-2s2 .89 2 2-.89 2-2 2-2-.89-2-2zm4 18v-6h2.5l-2.54-7.63A2.996 2.996 0 0 0 17.06 7c-.8 0-1.54.37-2.01.97L12 11.5v3c0 .55-.45 1-1 1s-1-.45-1-1v-4l-4.5-4.5C5.19 5.69 4.8 5.5 4.38 5.5c-.83 0-1.5.67-1.5 1.5 0 .42.19.81.5 1.11L7 11.5V22h2v-6h2v6h9z"/>
						</svg>
						<span>Group</span>
					</button>
					<button
						class="tab-button {activeTab === 'channel' ? 'active' : ''}"
						onclick={() => setActiveTab('channel')}
					>
						<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
							<path d="M18 16v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/>
						</svg>
						<span>Channel</span>
					</button>
				</div>
				<div class="tab-indicator" style="transform: translateX({activeTab === 'direct' ? '0%' : activeTab === 'group' ? '100%' : '200%'})"></div>
			</div>
			
			<!-- Content -->
			<div class="modal-body">
				<form onsubmit={handleSubmit} class="form-container">
					<!-- Group/Channel Name Input -->
					{#if activeTab === 'group'}
						<div class="form-section">
							<div class="section-header">
								<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
									<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
								</svg>
								<h3>Group Details</h3>
							</div>
							<div class="input-group">
								<label for="groupName">Group Name</label>
								<input
									id="groupName"
									type="text"
									bind:value={groupName}
									placeholder="Enter a name for your group..."
									class="form-input"
									required
								/>
							</div>
						</div>
					{/if}
					
					<!-- User Search Section -->
					<div class="form-section">
						<div class="section-header">
							<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
								<path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
							</svg>
							<h3>Add Participants</h3>
						</div>
						<div class="search-container">
							<input
								id="userSearch"
								type="text"
								bind:value={searchQuery}
								oninput={handleSearchInput}
								placeholder="Search by username, name, or phone..."
								class="search-input"
							/>
							{#if isSearching}
								<div class="search-spinner">
									<div class="spinner"></div>
								</div>
							{/if}
						</div>
					</div>
					
					<!-- Selected Users (for all conversation types) -->
					{#if selectedUsers.length > 0}
						<div class="selected-users">
							<p class="selected-label">
								Selected Participants ({selectedUsers.length})
							</p>
							<div class="selected-chips">
								{#each selectedUsers as user (user.id)}
									<div class="user-chip">
										<span>{user.display_name || user.username}</span>
										<button
											type="button"
											onclick={() => toggleUserSelection(user)}
											class="chip-remove"
											aria-label="Remove user from selection"
										>
											<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
												<path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
											</svg>
										</button>
									</div>
								{/each}
							</div>
						</div>
					{/if}
					
					<!-- Search Results -->
					{#if searchResults.length > 0}
						<div class="search-results">
							{#each searchResults as searchUser (searchUser.id)}
								<button
									type="button"
									class="user-result {isUserSelected(searchUser) ? 'selected' : ''}"
									onclick={() => toggleUserSelection(searchUser)}
								>
									<div class="user-avatar">
										{#if searchUser.avatar_url}
											<img src={searchUser.avatar_url} alt="" />
										{:else}
											<span>
												{(searchUser.display_name || searchUser.username || '?').charAt(0).toUpperCase()}
											</span>
										{/if}
									</div>
									<div class="user-info">
										<p class="user-name">
											{searchUser.display_name || searchUser.username}
										</p>
										{#if searchUser.username && searchUser.display_name}
											<p class="user-handle">@{searchUser.username}</p>
										{/if}
									</div>
									{#if isUserSelected(searchUser)}
										<div class="selection-indicator">
											<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
												<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
											</svg>
										</div>
									{/if}
								</button>
							{/each}
						</div>
					{:else if searchQuery.length >= 2 && !isSearching}
						<div class="no-results">
							<svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
								<path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
							</svg>
							<p>No users found</p>
							<span>Try a different search term</span>
						</div>
					{/if}
					
					<!-- Actions -->
					<div class="form-actions">
						<button
							type="button"
							onclick={closeModal}
							class="cancel-button"
						>
							Cancel
						</button>
						<button
							type="submit"
							disabled={!canCreate || isCreating}
							class="create-button"
						>
							{#if isCreating}
								<div class="button-content">
									<div class="spinner"></div>
									<span>Creating...</span>
								</div>
							{:else}
								<div class="button-content">
									<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
										<path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
									</svg>
									<span>{activeTab === 'direct' ? 'Start Chat' : `Create ${activeTab === 'group' ? 'Group' : 'Channel'}`}</span>
								</div>
							{/if}
						</button>
					</div>
				</form>
			</div>
		</div>
	</div>
{/if}

{#if showChatPrompt}
	<ChatRequestPromptModal
		on:accept={() => { showChatPrompt = false; chatPromptResolve(true); }}
		on:reject={() => { showChatPrompt = false; chatPromptResolve(false); }}
	/>
{/if}

<style>
	/* Modal Overlay */
	.modal-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.6);
		backdrop-filter: blur(4px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: 1rem;
	}

	/* Modal Container */
	.modal-container {
		background: var(--color-surface, #ffffff);
		border-radius: 1rem;
		width: 100%;
		max-width: 520px;
		max-height: 85vh;
		display: flex;
		flex-direction: column;
		box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
		border: 1px solid var(--color-border, #e5e7eb);
		overflow: hidden;
	}

	/* Header */
	.modal-header {
		background: linear-gradient(135deg, var(--color-primary-500, #3b82f6) 0%, var(--color-primary-600, #2563eb) 100%);
		color: white;
		padding: 1.5rem;
		display: flex;
		align-items: center;
		justify-content: space-between;
		position: relative;
	}

	.modal-header::before {
		content: '';
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.05'%3E%3Ccircle cx='30' cy='30' r='2'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E") repeat;
		opacity: 0.3;
	}

	.header-content {
		display: flex;
		align-items: center;
		gap: 1rem;
		position: relative;
		z-index: 1;
	}

	.header-icon {
		width: 2.5rem;
		height: 2.5rem;
		background: rgba(255, 255, 255, 0.2);
		border-radius: 0.75rem;
		display: flex;
		align-items: center;
		justify-content: center;
		color: white;
	}

	.header-text h2 {
		margin: 0;
		font-size: 1.25rem;
		font-weight: 600;
		line-height: 1.2;
	}

	.header-text p {
		margin: 0.25rem 0 0 0;
		font-size: 0.875rem;
		opacity: 0.9;
		font-weight: 400;
	}

	.close-button {
		background: rgba(255, 255, 255, 0.1);
		border: none;
		color: white;
		cursor: pointer;
		padding: 0.5rem;
		border-radius: 0.5rem;
		transition: all 0.2s ease;
		position: relative;
		z-index: 1;
	}

	.close-button:hover {
		background: rgba(255, 255, 255, 0.2);
		transform: scale(1.05);
	}

	/* Tabs */
	.tabs-container {
		background: var(--color-surface, #ffffff);
		border-bottom: 1px solid var(--color-border, #e5e7eb);
		position: relative;
		padding: 0 1.5rem;
	}

	.tabs-wrapper {
		display: flex;
		position: relative;
	}

	.tab-button {
		flex: 1;
		background: none;
		border: none;
		padding: 1rem 0.75rem;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--color-text-secondary, #6b7280);
		transition: all 0.2s ease;
		position: relative;
		z-index: 2;
	}

	.tab-button.active {
		color: var(--color-primary-600, #2563eb);
	}

	.tab-button:hover:not(.active) {
		color: var(--color-text-primary, #111827);
		background: var(--color-surface-hover, #f9fafb);
	}

	.tab-indicator {
		position: absolute;
		bottom: 0;
		left: 0;
		width: 33.333%;
		height: 3px;
		background: linear-gradient(90deg, var(--color-primary-500, #3b82f6), var(--color-primary-600, #2563eb));
		border-radius: 2px 2px 0 0;
		transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		z-index: 1;
	}

	/* Modal Body */
	.modal-body {
		flex: 1;
		overflow-y: auto;
		padding: 1.5rem;
		background: var(--color-background, #f9fafb);
	}

	.form-container {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	/* Form Sections */
	.form-section {
		background: var(--color-surface, #ffffff);
		border-radius: 0.75rem;
		padding: 1.25rem;
		border: 1px solid var(--color-border, #e5e7eb);
		box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
	}

	.section-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 1rem;
		color: var(--color-primary-600, #2563eb);
	}

	.section-header h3 {
		margin: 0;
		font-size: 1rem;
		font-weight: 600;
		color: var(--color-text-primary, #111827);
	}

	/* Input Groups */
	.input-group {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.input-group label {
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--color-text-primary, #111827);
	}

	.form-input {
		padding: 0.75rem 1rem;
		border: 2px solid var(--color-border, #e5e7eb);
		border-radius: 0.5rem;
		background: var(--color-surface, #ffffff);
		color: var(--color-text-primary, #111827);
		font-size: 0.875rem;
		transition: all 0.2s ease;
	}

	.form-input:focus {
		outline: none;
		border-color: var(--color-primary-500, #3b82f6);
		box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
	}

	/* Search Container */
	.search-container {
		position: relative;
	}

	.search-input {
		width: 100%;
		padding: 0.875rem 1rem;
		padding-right: 2.5rem;
		border: 2px solid var(--color-border, #e5e7eb);
		border-radius: 0.75rem;
		background: var(--color-surface, #ffffff);
		color: var(--color-text-primary, #111827);
		font-size: 0.875rem;
		transition: all 0.2s ease;
	}

	.search-input:focus {
		outline: none;
		border-color: var(--color-primary-500, #3b82f6);
		box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
	}

	.search-spinner {
		position: absolute;
		right: 0.75rem;
		top: 50%;
		transform: translateY(-50%);
	}

	/* Selected Users */
	.selected-users {
		background: var(--color-surface, #ffffff);
		border-radius: 0.75rem;
		padding: 1rem;
		border: 1px solid var(--color-border, #e5e7eb);
	}

	.selected-label {
		margin: 0 0 0.75rem 0;
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--color-text-primary, #111827);
	}

	.selected-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.user-chip {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		background: var(--color-primary-50, #eff6ff);
		color: var(--color-primary-700, #1d4ed8);
		border-radius: 1rem;
		font-size: 0.75rem;
		font-weight: 500;
		border: 1px solid var(--color-primary-200, #bfdbfe);
	}

	.chip-remove {
		background: none;
		border: none;
		color: var(--color-primary-600, #2563eb);
		cursor: pointer;
		padding: 0.125rem;
		border-radius: 0.25rem;
		transition: all 0.2s ease;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.chip-remove:hover {
		background: var(--color-primary-100, #dbeafe);
		color: var(--color-primary-700, #1d4ed8);
	}

	/* Search Results */
	.search-results {
		background: var(--color-surface, #ffffff);
		border-radius: 0.75rem;
		border: 1px solid var(--color-border, #e5e7eb);
		max-height: 16rem;
		overflow-y: auto;
		box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
	}

	.user-result {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.875rem 1rem;
		background: none;
		border: none;
		cursor: pointer;
		transition: all 0.2s ease;
		border-bottom: 1px solid var(--color-border, #e5e7eb);
	}

	.user-result:last-child {
		border-bottom: none;
	}

	.user-result:hover {
		background: var(--color-surface-hover, #f9fafb);
	}

	.user-result.selected {
		background: var(--color-primary-50, #eff6ff);
		border-color: var(--color-primary-200, #bfdbfe);
	}

	.user-avatar {
		width: 2.5rem;
		height: 2.5rem;
		border-radius: 50%;
		background: var(--color-gray-200, #e5e7eb);
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
		flex-shrink: 0;
	}

	.user-avatar img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.user-avatar span {
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--color-text-secondary, #6b7280);
	}

	.user-info {
		flex: 1;
		text-align: left;
	}

	.user-name {
		margin: 0;
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--color-text-primary, #111827);
		line-height: 1.2;
	}

	.user-handle {
		margin: 0.125rem 0 0 0;
		font-size: 0.75rem;
		color: var(--color-text-secondary, #6b7280);
	}

	.selection-indicator {
		color: var(--color-primary-600, #2563eb);
		flex-shrink: 0;
	}

	/* No Results */
	.no-results {
		text-align: center;
		padding: 2rem 1rem;
		color: var(--color-text-secondary, #6b7280);
		background: var(--color-surface, #ffffff);
		border-radius: 0.75rem;
		border: 1px solid var(--color-border, #e5e7eb);
	}

	.no-results svg {
		opacity: 0.5;
		margin-bottom: 0.75rem;
	}

	.no-results p {
		margin: 0 0 0.25rem 0;
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--color-text-primary, #111827);
	}

	.no-results span {
		font-size: 0.75rem;
	}

	/* Form Actions */
	.form-actions {
		display: flex;
		gap: 0.75rem;
		justify-content: flex-end;
		padding-top: 0.5rem;
	}

	.cancel-button {
		background: var(--color-surface, #ffffff);
		border: 2px solid var(--color-border, #e5e7eb);
		color: var(--color-text-secondary, #6b7280);
		padding: 0.75rem 1.5rem;
		border-radius: 0.5rem;
		cursor: pointer;
		font-size: 0.875rem;
		font-weight: 500;
		transition: all 0.2s ease;
	}

	.cancel-button:hover {
		background: var(--color-surface-hover, #f9fafb);
		color: var(--color-text-primary, #111827);
		border-color: var(--color-gray-300, #d1d5db);
	}

	.create-button {
		background: linear-gradient(135deg, var(--color-primary-500, #3b82f6) 0%, var(--color-primary-600, #2563eb) 100%);
		color: white;
		border: none;
		padding: 0.75rem 1.5rem;
		border-radius: 0.5rem;
		cursor: pointer;
		font-size: 0.875rem;
		font-weight: 500;
		transition: all 0.2s ease;
		box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
	}

	.create-button:hover:not(:disabled) {
		background: linear-gradient(135deg, var(--color-primary-600, #2563eb) 0%, var(--color-primary-700, #1d4ed8) 100%);
		transform: translateY(-1px);
		box-shadow: 0 6px 8px -1px rgba(0, 0, 0, 0.15);
	}

	.create-button:disabled {
		opacity: 0.6;
		cursor: not-allowed;
		transform: none;
		box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
	}

	.button-content {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	/* Spinner */
	.spinner {
		width: 1rem;
		height: 1rem;
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-top: 2px solid currentColor;
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		0% { transform: rotate(0deg); }
		100% { transform: rotate(360deg); }
	}

	/* Responsive Design */
	@media (max-width: 640px) {
		.modal-overlay {
			padding: 0.5rem;
		}

		.modal-container {
			max-width: 100%;
			max-height: 95vh;
		}

		.modal-header {
			padding: 1rem;
		}

		.header-text h2 {
			font-size: 1.125rem;
		}

		.header-text p {
			font-size: 0.8125rem;
		}

		.modal-body {
			padding: 1rem;
		}

		.form-actions {
			flex-direction: column;
		}

		.cancel-button,
		.create-button {
			width: 100%;
			justify-content: center;
		}

		.tabs-container {
			padding: 0 1rem;
		}

		.tab-button {
			font-size: 0.8125rem;
			padding: 0.875rem 0.5rem;
		}

		.tab-button span {
			display: none;
		}
	}

	/* Dark mode support */
	@media (prefers-color-scheme: dark) {
		.modal-container {
			--color-surface: #1f2937;
			--color-background: #111827;
			--color-border: #374151;
			--color-text-primary: #f9fafb;
			--color-text-secondary: #9ca3af;
			--color-surface-hover: #4f617e;
			--color-gray-200: #4b5563;
			--color-gray-300: #6b7280;
			--color-primary-50: #1e3a8a;
			--color-primary-100: #1e40af;
			--color-primary-200: #2563eb;
		}
	}
</style>