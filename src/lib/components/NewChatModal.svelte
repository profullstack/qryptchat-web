<script>
	import { createEventDispatcher } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	
	const dispatch = createEventDispatcher();
	
	// Props using Svelte 5 runes
	let { isOpen = $bindable(false) } = $props();
	
	// State using Svelte 5 runes
	let activeTab = $state('direct'); // 'direct', 'group', 'channel'
	let searchQuery = $state('');
	let searchResults = $state([]);
	let selectedUsers = $state([]);
	let groupName = $state('');
	let isSearching = $state(false);
	let isCreating = $state(false);
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
	
	function setActiveTab(tab) {
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
	
	function toggleUserSelection(user) {
		const index = selectedUsers.findIndex(u => u.id === user.id);
		if (index >= 0) {
			selectedUsers = selectedUsers.filter(u => u.id !== user.id);
		} else {
			selectedUsers = [...selectedUsers, user];
		}
	}
	
	function isUserSelected(user) {
		return selectedUsers.some(u => u.id === user.id);
	}
	
	async function startDirectConversation(otherUser) {
		isCreating = true;
		try {
			const response = await fetch('/api/chat/conversations', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					type: 'direct',
					participant_ids: [otherUser.id]
				})
			});
			
			const data = await response.json();
			
			if (response.ok) {
				dispatch('conversationCreated', {
					conversationId: data.conversation_id,
					type: 'direct',
					otherUser
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
	
	function handleSubmit(event) {
		event.preventDefault();
		
		if (activeTab === 'direct' && selectedUsers.length === 1) {
			startDirectConversation(selectedUsers[0]);
		} else if ((activeTab === 'group' || activeTab === 'channel') && selectedUsers.length > 0) {
			createGroupConversation();
		}
	}
	
	// Derived state using Svelte 5 runes
	const canCreate = $derived(activeTab === 'direct'
		? selectedUsers.length === 1
		: selectedUsers.length > 0 && (activeTab === 'channel' || groupName.trim()));
</script>

{#if isOpen}
	<div
		class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
		transition:fade={{ duration: 200 }}
		onclick={closeModal}
		onkeydown={(e) => e.key === 'Escape' && closeModal()}
		role="dialog"
		aria-modal="true"
		aria-labelledby="modal-title"
		tabindex="0"
	>
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<div
			class="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-hidden"
			transition:fly={{ y: 20, duration: 200 }}
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
			role="document"
		>
			<!-- Header -->
			<div class="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
				<h2 id="modal-title" class="text-lg font-semibold text-gray-900 dark:text-white">
					New Chat
				</h2>
				<button
					onclick={closeModal}
					class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
					aria-label="Close modal"
				>
					<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>
			
			<!-- Tabs -->
			<div class="flex border-b border-gray-200 dark:border-gray-700">
				<button
					class="flex-1 py-3 px-4 text-sm font-medium transition-colors {activeTab === 'direct'
						? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400'
						: 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}"
					onclick={() => setActiveTab('direct')}
				>
					Direct Message
				</button>
				<button
					class="flex-1 py-3 px-4 text-sm font-medium transition-colors {activeTab === 'group'
						? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400'
						: 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}"
					onclick={() => setActiveTab('group')}
				>
					Group Chat
				</button>
				<button
					class="flex-1 py-3 px-4 text-sm font-medium transition-colors {activeTab === 'channel'
						? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400'
						: 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}"
					onclick={() => setActiveTab('channel')}
				>
					Channel
				</button>
			</div>
			
			<!-- Content -->
			<form onsubmit={handleSubmit} class="p-4 space-y-4">
				<!-- Group/Channel Name Input -->
				{#if activeTab === 'group'}
					<div>
						<label for="groupName" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
							Group Name
						</label>
						<input
							id="groupName"
							type="text"
							bind:value={groupName}
							placeholder="Enter group name..."
							class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
							required
						/>
					</div>
				{/if}
				
				<!-- User Search -->
				<div>
					<label for="userSearch" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
						{activeTab === 'direct' ? 'Find User' : 'Add Participants'}
					</label>
					<div class="relative">
						<input
							id="userSearch"
							type="text"
							bind:value={searchQuery}
							oninput={handleSearchInput}
							placeholder="Search by username, name, or phone..."
							class="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
						/>
						{#if isSearching}
							<div class="absolute right-3 top-2.5">
								<div class="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
							</div>
						{/if}
					</div>
				</div>
				
				<!-- Selected Users (for group/channel) -->
				{#if (activeTab === 'group' || activeTab === 'channel') && selectedUsers.length > 0}
					<div>
						<p class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
							Selected ({selectedUsers.length})
						</p>
						<div class="flex flex-wrap gap-2">
							{#each selectedUsers as user (user.id)}
								<span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
									{user.display_name || user.username}
									<button
										type="button"
										onclick={() => toggleUserSelection(user)}
										class="ml-1 text-blue-600 hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-100"
										aria-label="Remove user from selection"
									>
										<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
										</svg>
									</button>
								</span>
							{/each}
						</div>
					</div>
				{/if}
				
				<!-- Search Results -->
				{#if searchResults.length > 0}
					<div class="max-h-48 overflow-y-auto border border-gray-200 dark:border-gray-600 rounded-md">
						{#each searchResults as searchUser (searchUser.id)}
							<button
								type="button"
								class="w-full flex items-center p-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors {isUserSelected(searchUser) ? 'bg-blue-50 dark:bg-blue-900/20' : ''}"
								onclick={() => {
									if (activeTab === 'direct') {
										selectedUsers = [searchUser];
									} else {
										toggleUserSelection(searchUser);
									}
								}}
							>
								<div class="flex-shrink-0 w-10 h-10 bg-gray-300 dark:bg-gray-600 rounded-full flex items-center justify-center">
									{#if searchUser.avatar_url}
										<img src={searchUser.avatar_url} alt="" class="w-10 h-10 rounded-full object-cover" />
									{:else}
										<span class="text-sm font-medium text-gray-600 dark:text-gray-300">
											{(searchUser.display_name || searchUser.username || '?').charAt(0).toUpperCase()}
										</span>
									{/if}
								</div>
								<div class="ml-3 flex-1 text-left">
									<p class="text-sm font-medium text-gray-900 dark:text-white">
										{searchUser.display_name || searchUser.username}
									</p>
									{#if searchUser.username && searchUser.display_name}
										<p class="text-xs text-gray-500 dark:text-gray-400">@{searchUser.username}</p>
									{/if}
								</div>
								{#if isUserSelected(searchUser)}
									<div class="flex-shrink-0 text-blue-600 dark:text-blue-400">
										<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
											<path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
										</svg>
									</div>
								{/if}
							</button>
						{/each}
					</div>
				{:else if searchQuery.length >= 2 && !isSearching}
					<div class="text-center py-4 text-gray-500 dark:text-gray-400">
						No users found
					</div>
				{/if}
				
				<!-- Actions -->
				<div class="flex justify-end space-x-3 pt-4">
					<button
						type="button"
						onclick={closeModal}
						class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
					>
						Cancel
					</button>
					<button
						type="submit"
						disabled={!canCreate || isCreating}
						class="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
					>
						{#if isCreating}
							<div class="flex items-center">
								<div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
								Creating...
							</div>
						{:else}
							{activeTab === 'direct' ? 'Start Chat' : `Create ${activeTab === 'group' ? 'Group' : 'Channel'}`}
						{/if}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}