<script>
	import { createEventDispatcher } from 'svelte';
	import { browser } from '$app/environment';

	// Props
	const { conversation = null, isOpen = false } = $props();

	// State
	let disappearingMessagesEnabled = $state(false);
	let disappearingMessagesDuration = $state(30);
	let loading = $state(false);
	let saving = $state(false);

	// Event dispatcher
	const dispatch = createEventDispatcher();

	// Predefined duration options
	const durationOptions = [
		{ value: 1, label: '1 day' },
		{ value: 7, label: '1 week' },
		{ value: 30, label: '30 days' },
		{ value: 90, label: '3 months' },
		{ value: 365, label: '1 year' }
	];

	// Get JWT token for API calls
	function getAuthToken() {
		if (!browser) return null;
		const token = localStorage.getItem('supabase.auth.token');
		if (!token) return null;
		try {
			const parsedToken = JSON.parse(token);
			return parsedToken.access_token;
		} catch {
			return null;
		}
	}

	// Load conversation settings when conversation changes
	$effect(() => {
		if (conversation?.id && isOpen) {
			loadConversationSettings();
		}
	});

	// Load conversation disappearing messages settings
	async function loadConversationSettings() {
		const token = getAuthToken();
		if (!token || !conversation?.id) return;

		loading = true;
		try {
			const response = await fetch(`/api/conversations/${conversation.id}/disappearing-messages`, {
				headers: {
					'Authorization': `Bearer ${token}`
				}
			});

			const data = await response.json();
			if (response.ok) {
				disappearingMessagesEnabled = data.disappearing_messages_enabled;
				disappearingMessagesDuration = data.disappearing_messages_duration_days || 30;
			} else {
				console.error('Failed to load conversation settings:', data.error);
			}
		} catch (error) {
			console.error('Error loading conversation settings:', error);
		} finally {
			loading = false;
		}
	}

	// Save disappearing messages settings
	async function saveDisappearingMessages() {
		const token = getAuthToken();
		if (!token || !conversation?.id) return;

		saving = true;
		try {
			const response = await fetch(`/api/conversations/${conversation.id}/disappearing-messages`, {
				method: 'PUT',
				headers: {
					'Authorization': `Bearer ${token}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					disappearing_messages_enabled: disappearingMessagesEnabled,
					disappearing_messages_duration_days: disappearingMessagesDuration
				})
			});

			const data = await response.json();
			if (response.ok) {
				dispatch('settingsUpdated', {
					disappearing_messages_enabled: disappearingMessagesEnabled,
					disappearing_messages_duration_days: disappearingMessagesDuration
				});
			} else {
				console.error('Failed to save settings:', data.error);
				dispatch('error', { message: data.error || 'Failed to save settings' });
			}
		} catch (error) {
			console.error('Error saving settings:', error);
			dispatch('error', { message: 'Failed to save settings' });
		} finally {
			saving = false;
		}
	}

	// Close menu
	function closeMenu() {
		dispatch('close');
	}

	// Handle backdrop click
	function handleBackdropClick(event) {
		if (event.target === event.currentTarget) {
			closeMenu();
		}
	}
</script>

{#if isOpen}
	<div class="menu-backdrop" onclick={handleBackdropClick}>
		<div class="menu-panel">
			<div class="menu-header">
				<h3>Conversation Settings</h3>
				<button onclick={closeMenu} class="close-button" aria-label="Close menu">
					<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<line x1="18" y1="6" x2="6" y2="18"></line>
						<line x1="6" y1="6" x2="18" y2="18"></line>
					</svg>
				</button>
			</div>

			<div class="menu-content">
				{#if loading}
					<div class="loading-state">
						<div class="spinner"></div>
						<p>Loading settings...</p>
					</div>
				{:else}
					<div class="setting-section">
						<div class="setting-header">
							<h4>Disappearing Messages</h4>
							<p class="setting-description">
								Messages will automatically disappear after the specified time period.
							</p>
						</div>

						<div class="setting-control">
							<label class="toggle-label">
								<input
									type="checkbox"
									bind:checked={disappearingMessagesEnabled}
									disabled={saving}
								/>
								<span class="toggle-slider"></span>
								Enable disappearing messages
							</label>
						</div>

						{#if disappearingMessagesEnabled}
							<div class="setting-control">
								<label for="duration-select">Messages disappear after:</label>
								<select
									id="duration-select"
									bind:value={disappearingMessagesDuration}
									disabled={saving}
								>
									{#each durationOptions as option}
										<option value={option.value}>{option.label}</option>
									{/each}
								</select>
							</div>
						{/if}

						<div class="setting-actions">
							<button
								onclick={saveDisappearingMessages}
								disabled={saving}
								class="save-button"
							>
								{#if saving}
									<div class="spinner small"></div>
									Saving...
								{:else}
									Save Changes
								{/if}
							</button>
						</div>

						<div class="setting-info">
							<p>
								<strong>Note:</strong> This setting only affects new messages. 
								Existing messages will keep their current expiration settings.
							</p>
						</div>
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.menu-backdrop {
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

	.menu-panel {
		background: var(--color-bg-primary);
		border: 1px solid var(--color-border-primary);
		border-radius: 0.75rem;
		box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
		max-width: 500px;
		width: 100%;
		max-height: 80vh;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	.menu-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1.5rem;
		border-bottom: 1px solid var(--color-border-secondary);
	}

	.menu-header h3 {
		font-size: 1.25rem;
		font-weight: 600;
		color: var(--color-text-primary);
		margin: 0;
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
		background: var(--color-bg-tertiary);
		color: var(--color-text-primary);
	}

	.menu-content {
		padding: 1.5rem;
		overflow-y: auto;
	}

	.loading-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
		padding: 2rem;
		color: var(--color-text-secondary);
	}

	.setting-section {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.setting-header h4 {
		font-size: 1.125rem;
		font-weight: 600;
		color: var(--color-text-primary);
		margin: 0 0 0.5rem 0;
	}

	.setting-description {
		font-size: 0.875rem;
		color: var(--color-text-secondary);
		line-height: 1.5;
		margin: 0;
	}

	.setting-control {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.toggle-label {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		cursor: pointer;
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--color-text-primary);
	}

	.toggle-label input[type="checkbox"] {
		display: none;
	}

	.toggle-slider {
		position: relative;
		width: 44px;
		height: 24px;
		background: var(--color-bg-tertiary);
		border-radius: 12px;
		transition: background-color 0.2s ease;
		border: 1px solid var(--color-border-primary);
	}

	.toggle-slider::before {
		content: '';
		position: absolute;
		top: 2px;
		left: 2px;
		width: 18px;
		height: 18px;
		background: white;
		border-radius: 50%;
		transition: transform 0.2s ease;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
	}

	.toggle-label input[type="checkbox"]:checked + .toggle-slider {
		background: var(--color-brand-primary);
		border-color: var(--color-brand-primary);
	}

	.toggle-label input[type="checkbox"]:checked + .toggle-slider::before {
		transform: translateX(20px);
	}

	.setting-control label {
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--color-text-primary);
	}

	.setting-control select {
		padding: 0.75rem;
		border: 1px solid var(--color-border-primary);
		border-radius: 0.5rem;
		background: var(--color-bg-primary);
		color: var(--color-text-primary);
		font-size: 0.875rem;
	}

	.setting-control select:focus {
		outline: none;
		border-color: var(--color-brand-primary);
		box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
	}

	.setting-actions {
		display: flex;
		justify-content: flex-end;
	}

	.save-button {
		background: var(--color-brand-primary);
		color: white;
		border: none;
		padding: 0.75rem 1.5rem;
		border-radius: 0.5rem;
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: background-color 0.2s ease;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.save-button:hover:not(:disabled) {
		background: var(--color-brand-primary-dark);
	}

	.save-button:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.spinner {
		width: 20px;
		height: 20px;
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-top: 2px solid white;
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	.spinner.small {
		width: 16px;
		height: 16px;
	}

	@keyframes spin {
		0% { transform: rotate(0deg); }
		100% { transform: rotate(360deg); }
	}

	.setting-info {
		background: var(--color-bg-tertiary);
		border: 1px solid var(--color-border-secondary);
		border-radius: 0.5rem;
		padding: 1rem;
	}

	.setting-info p {
		font-size: 0.8125rem;
		color: var(--color-text-secondary);
		margin: 0;
		line-height: 1.5;
	}

	@media (max-width: 640px) {
		.menu-backdrop {
			padding: 0.5rem;
		}

		.menu-header {
			padding: 1rem;
		}

		.menu-content {
			padding: 1rem;
		}
	}
</style>