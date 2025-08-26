<script>
	import { createEventDispatcher } from 'svelte';
	import { user } from '$lib/stores/auth.js';

	// Props
	let { isOpen = false, conversationId = null } = $props();

	// Event dispatcher
	const dispatch = createEventDispatcher();

	// State
	let searchQuery = $state('');
	let searchResults = $state(/** @type {any[]} */ ([]));
	let selectedUsers = $state(/** @type {any[]} */ ([]));
	let isSearching = $state(false);
	let isAdding = $state(false);
	let error = $state('');
	let success = $state('');

	// Search for users
	async function searchUsers() {
		if (!searchQuery.trim() || searchQuery.length < 2) {
			searchResults = [];
			return;
		}

		isSearching = true;
		error = '';

		try {
			const response = await fetch(`/api/users/search?q=${encodeURIComponent(searchQuery.trim())}`, {
				method: 'GET',
				headers: {
					'Content-Type': 'application/json'
				}
			});

			if (!response.ok) {
				throw new Error('Failed to search users');
			}

			const data = await response.json();
			// Filter out current user and already selected users
			searchResults = (data.users || []).filter((/** @type {any} */ u) => 
				u.id !== $user?.id && !selectedUsers.some((/** @type {any} */ selected) => selected.id === u.id)
			);
		} catch (err) {
			console.error('Search error:', err);
			error = 'Failed to search users. Please try again.';
			searchResults = [];
		} finally {
			isSearching = false;
		}
	}

	// Add user to selection
	function selectUser(/** @type {any} */ user) {
		selectedUsers = [...selectedUsers, user];
		searchResults = searchResults.filter(u => u.id !== user.id);
		searchQuery = '';
	}

	// Remove user from selection
	function removeUser(/** @type {string} */ userId) {
		selectedUsers = selectedUsers.filter(u => u.id !== userId);
	}

	// Add participants to conversation
	async function addParticipants() {
		if (selectedUsers.length === 0) {
			error = 'Please select at least one user to add.';
			return;
		}

		isAdding = true;
		error = '';
		success = '';

		try {
			const response = await fetch(`/api/chat/conversations/${conversationId}/participants`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					user_ids: selectedUsers.map(u => u.id)
				})
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.error || 'Failed to add participants');
			}

			const data = await response.json();
			success = data.message || 'Participants added successfully!';
			
			// Reset form
			selectedUsers = [];
			searchQuery = '';
			searchResults = [];

			// Dispatch success event
			dispatch('participantsAdded', {
				addedCount: data.added_count,
				participantIds: data.new_participant_ids
			});

			// Close modal after a short delay
			setTimeout(() => {
				handleClose();
			}, 1500);

		} catch (err) {
			console.error('Add participants error:', err);
			error = (err instanceof Error ? err.message : String(err)) || 'Failed to add participants. Please try again.';
		} finally {
			isAdding = false;
		}
	}

	// Handle modal close
	function handleClose() {
		// Reset state
		searchQuery = '';
		searchResults = [];
		selectedUsers = [];
		error = '';
		success = '';
		isSearching = false;
		isAdding = false;

		dispatch('close');
	}

	// Handle search input with debouncing
	let searchTimeout = /** @type {ReturnType<typeof setTimeout> | undefined} */ (undefined);
	function handleSearchInput() {
		if (searchTimeout) {
			clearTimeout(searchTimeout);
		}
		searchTimeout = setTimeout(searchUsers, 300);
	}

	// Handle keyboard events
	function handleKeydown(/** @type {KeyboardEvent} */ event) {
		if (event.key === 'Escape') {
			handleClose();
		}
	}
</script>

<svelte:window on:keydown={handleKeydown} />

{#if isOpen}
	<div
		class="modal-overlay"
		onclick={handleClose}
		onkeydown={handleKeydown}
		role="dialog"
		aria-modal="true"
		aria-labelledby="modal-title"
		tabindex="-1"
	>
		<div
			class="modal-content"
			role="document"
		>
			<div class="modal-header">
				<h2 id="modal-title">Add Participants</h2>
				<button class="close-button" onclick={handleClose} aria-label="Close modal">
					<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
						<path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
					</svg>
				</button>
			</div>

			<div class="modal-body">
				{#if error}
					<div class="error-message">
						<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
							<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
						</svg>
						{error}
					</div>
				{/if}

				{#if success}
					<div class="success-message">
						<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
							<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
						</svg>
						{success}
					</div>
				{/if}

				<!-- Search Input -->
				<div class="search-section">
					<label for="user-search">Search for users to add:</label>
					<div class="search-input">
						<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" class="search-icon">
							<path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
						</svg>
						<input
							id="user-search"
							type="text"
							placeholder="Search by username or display name..."
							bind:value={searchQuery}
							oninput={handleSearchInput}
							disabled={isAdding}
						/>
						{#if isSearching}
							<div class="search-loading">
								<div class="spinner"></div>
							</div>
						{/if}
					</div>
				</div>

				<!-- Selected Users -->
				{#if selectedUsers.length > 0}
					<div class="selected-section">
						<h3>Selected Users ({selectedUsers.length})</h3>
						<div class="selected-users">
							{#each selectedUsers as user (user.id)}
								<div class="selected-user">
									<div class="user-info">
										{#if user.avatar_url}
											<img src={user.avatar_url} alt={user.display_name || user.username} class="user-avatar" />
										{:else}
											<div class="user-avatar-placeholder">
												{(user.display_name || user.username).charAt(0).toUpperCase()}
											</div>
										{/if}
										<div class="user-details">
											<div class="user-name">{user.display_name || user.username}</div>
											{#if user.display_name && user.username}
												<div class="user-username">@{user.username}</div>
											{/if}
										</div>
									</div>
									<button 
										class="remove-button" 
										onclick={() => removeUser(user.id)}
										disabled={isAdding}
										aria-label="Remove {user.display_name || user.username}"
									>
										<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
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
					<div class="results-section">
						<h3>Search Results</h3>
						<div class="search-results">
							{#each searchResults as user (user.id)}
								<button class="user-result" onclick={() => selectUser(user)} disabled={isAdding}>
									<div class="user-info">
										{#if user.avatar_url}
											<img src={user.avatar_url} alt={user.display_name || user.username} class="user-avatar" />
										{:else}
											<div class="user-avatar-placeholder">
												{(user.display_name || user.username).charAt(0).toUpperCase()}
											</div>
										{/if}
										<div class="user-details">
											<div class="user-name">{user.display_name || user.username}</div>
											{#if user.display_name && user.username}
												<div class="user-username">@{user.username}</div>
											{/if}
										</div>
									</div>
									<div class="add-icon">
										<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
											<path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
										</svg>
									</div>
								</button>
							{/each}
						</div>
					</div>
				{:else if searchQuery.length >= 2 && !isSearching}
					<div class="no-results">
						<p>No users found matching "{searchQuery}"</p>
					</div>
				{/if}
			</div>

			<div class="modal-footer">
				<button class="cancel-button" onclick={handleClose} disabled={isAdding}>
					Cancel
				</button>
				<button 
					class="add-button" 
					onclick={addParticipants} 
					disabled={selectedUsers.length === 0 || isAdding}
				>
					{#if isAdding}
						<div class="spinner"></div>
						Adding...
					{:else}
						Add {selectedUsers.length} Participant{selectedUsers.length !== 1 ? 's' : ''}
					{/if}
				</button>
			</div>
		</div>
	</div>
{/if}

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
		background: var(--color-bg-primary);
		border-radius: 0.75rem;
		box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
		width: 100%;
		max-width: 500px;
		max-height: 80vh;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1.5rem;
		border-bottom: 1px solid var(--color-border-primary);
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
		background: var(--color-bg-secondary);
		color: var(--color-text-primary);
	}

	.modal-body {
		flex: 1;
		padding: 1.5rem;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.error-message,
	.success-message {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem 1rem;
		border-radius: 0.5rem;
		font-size: 0.875rem;
	}

	.error-message {
		background: #fef2f2;
		color: #dc2626;
		border: 1px solid #fecaca;
	}

	.success-message {
		background: #f0fdf4;
		color: #16a34a;
		border: 1px solid #bbf7d0;
	}

	.search-section label {
		display: block;
		font-weight: 500;
		color: var(--color-text-primary);
		margin-bottom: 0.5rem;
		font-size: 0.875rem;
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
		border: 1px solid var(--color-border-primary);
		border-radius: 0.5rem;
		background: var(--color-bg-secondary);
		color: var(--color-text-primary);
		font-size: 0.875rem;
		transition: border-color 0.2s ease;
	}

	.search-input input:focus {
		outline: none;
		border-color: var(--color-brand-primary);
	}

	.search-input input::placeholder {
		color: var(--color-text-secondary);
	}

	.search-loading {
		position: absolute;
		right: 0.75rem;
	}

	.selected-section h3,
	.results-section h3 {
		margin: 0 0 0.75rem 0;
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--color-text-primary);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.selected-users,
	.search-results {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.selected-user,
	.user-result {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem;
		border: 1px solid var(--color-border-primary);
		border-radius: 0.5rem;
		background: var(--color-bg-secondary);
	}

	.user-result {
		cursor: pointer;
		transition: all 0.2s ease;
		width: 100%;
		text-align: left;
	}

	.user-result:hover:not(:disabled) {
		background: var(--color-bg-tertiary);
		border-color: var(--color-brand-primary);
	}

	.user-result:disabled {
		opacity: 0.5;
		cursor: not-allowed;
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
		object-fit: cover;
		flex-shrink: 0;
	}

	.user-avatar-placeholder {
		width: 40px;
		height: 40px;
		border-radius: 50%;
		background: var(--color-brand-primary);
		color: white;
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 600;
		font-size: 1rem;
		flex-shrink: 0;
	}

	.user-details {
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

	.user-username {
		font-size: 0.75rem;
		color: var(--color-text-secondary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.remove-button {
		background: none;
		border: none;
		color: var(--color-text-secondary);
		cursor: pointer;
		padding: 0.25rem;
		border-radius: 0.25rem;
		transition: all 0.2s ease;
		flex-shrink: 0;
	}

	.remove-button:hover:not(:disabled) {
		background: var(--color-error);
		color: white;
	}

	.remove-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.add-icon {
		color: var(--color-brand-primary);
		flex-shrink: 0;
	}

	.no-results {
		text-align: center;
		padding: 2rem;
		color: var(--color-text-secondary);
		font-style: italic;
	}

	.modal-footer {
		display: flex;
		gap: 0.75rem;
		padding: 1.5rem;
		border-top: 1px solid var(--color-border-primary);
		justify-content: flex-end;
	}

	.cancel-button,
	.add-button {
		padding: 0.75rem 1.5rem;
		border-radius: 0.5rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s ease;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.875rem;
	}

	.cancel-button {
		background: var(--color-bg-secondary);
		color: var(--color-text-primary);
		border: 1px solid var(--color-border-primary);
	}

	.cancel-button:hover:not(:disabled) {
		background: var(--color-bg-tertiary);
	}

	.add-button {
		background: var(--color-brand-primary);
		color: white;
		border: none;
	}

	.add-button:hover:not(:disabled) {
		background: var(--color-brand-secondary);
	}

	.add-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.spinner {
		width: 16px;
		height: 16px;
		border: 2px solid transparent;
		border-top: 2px solid currentColor;
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		0% { transform: rotate(0deg); }
		100% { transform: rotate(360deg); }
	}

	/* Mobile responsive */
	@media (max-width: 640px) {
		.modal-content {
			margin: 0;
			height: 100vh;
			max-height: 100vh;
			border-radius: 0;
		}

		.modal-header,
		.modal-body,
		.modal-footer {
			padding: 1rem;
		}

		.modal-footer {
			flex-direction: column;
		}

		.cancel-button,
		.add-button {
			width: 100%;
			justify-content: center;
		}
	}
</style>