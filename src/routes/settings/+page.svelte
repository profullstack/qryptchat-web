<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { isAuthenticated } from '$lib/stores/auth.js';

	// State
	let defaultMessageRetentionDays = $state(30);
	let loading = $state(false);
	let saving = $state(false);
	let message = $state('');
	let messageType = $state(''); // 'success' or 'error'

	// Predefined options for message retention
	const retentionOptions = [
		{ value: 0, label: 'Never (messages never expire)' },
		{ value: 1, label: '1 day' },
		{ value: 7, label: '1 week' },
		{ value: 30, label: '30 days (default)' },
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

	// Load current settings
	async function loadSettings() {
		const token = getAuthToken();
		if (!token) return;

		loading = true;
		try {
			const response = await fetch('/api/settings/disappearing-messages', {
				headers: {
					'Authorization': `Bearer ${token}`
				}
			});

			const data = await response.json();
			if (response.ok) {
				defaultMessageRetentionDays = data.default_message_retention_days;
			} else {
				console.error('Failed to load settings:', data.error);
			}
		} catch (error) {
			console.error('Error loading settings:', error);
		} finally {
			loading = false;
		}
	}

	// Save settings
	async function saveSettings() {
		const token = getAuthToken();
		if (!token) return;

		saving = true;
		message = '';
		try {
			const response = await fetch('/api/settings/disappearing-messages', {
				method: 'PUT',
				headers: {
					'Authorization': `Bearer ${token}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					default_message_retention_days: defaultMessageRetentionDays
				})
			});

			const data = await response.json();
			if (response.ok) {
				message = 'Settings saved successfully!';
				messageType = 'success';
			} else {
				message = data.error || 'Failed to save settings';
				messageType = 'error';
			}
		} catch (error) {
			console.error('Error saving settings:', error);
			message = 'Failed to save settings';
			messageType = 'error';
		} finally {
			saving = false;
			// Clear message after 3 seconds
			setTimeout(() => {
				message = '';
				messageType = '';
			}, 3000);
		}
	}

	// Redirect to auth if not authenticated
	onMount(() => {
		if (!$isAuthenticated) {
			goto('/auth');
		} else {
			loadSettings();
		}
	});
</script>

<svelte:head>
	<title>Settings - QryptChat</title>
	<meta name="description" content="Manage your QryptChat account settings" />
</svelte:head>

<main class="settings-page">
	<div class="container">
		<header class="page-header">
			<h1>Settings</h1>
			<p class="subtitle">Manage your account preferences</p>
		</header>

		<div class="settings-content">
			{#if message}
				<div class="message {messageType}">
					{message}
				</div>
			{/if}

			<div class="settings-section">
				<h2>Privacy & Security</h2>
				
				<div class="setting-item">
					<div class="setting-header">
						<h3>Disappearing Messages</h3>
						<p class="setting-description">
							Set how long messages should be kept before they automatically disappear.
							This applies to new conversations by default, but can be overridden per conversation.
						</p>
					</div>
					
					<div class="setting-control">
						<label for="retention-select">Default message retention:</label>
						<select
							id="retention-select"
							bind:value={defaultMessageRetentionDays}
							disabled={loading || saving}
						>
							{#each retentionOptions as option}
								<option value={option.value}>{option.label}</option>
							{/each}
						</select>
						
						<button
							onclick={saveSettings}
							disabled={saving || loading}
							class="save-button"
						>
							{#if saving}
								<div class="spinner"></div>
								Saving...
							{:else}
								Save Changes
							{/if}
						</button>
					</div>
					
					<div class="setting-info">
						<p>
							<strong>Note:</strong> Changing this setting only affects new messages.
							Existing messages will keep their current expiration settings.
							You can also set disappearing messages per conversation from the chat menu.
						</p>
					</div>
				</div>
			</div>

			<div class="settings-section">
				<h2>Account Settings</h2>
				<p>Additional account settings coming soon...</p>
			</div>

			<div class="settings-section">
				<h2>Notifications</h2>
				<p>Notification preferences coming soon...</p>
			</div>
		</div>
	</div>
</main>

<style>
	.settings-page {
		min-height: 100vh;
		padding: var(--space-8) 0;
		background: var(--color-bg-primary);
	}

	.page-header {
		text-align: center;
		margin-bottom: var(--space-8);
	}

	.page-header h1 {
		font-size: 3rem;
		font-weight: 700;
		color: var(--color-text-primary);
		margin-bottom: var(--space-4);
	}

	.subtitle {
		font-size: 1.25rem;
		color: var(--color-text-secondary);
		margin: 0;
	}

	.settings-content {
		max-width: 800px;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
	}

	.settings-section {
		background: var(--color-bg-secondary);
		border: 1px solid var(--color-border-primary);
		border-radius: var(--radius-lg);
		padding: var(--space-6);
	}

	.settings-section h2 {
		font-size: 1.5rem;
		font-weight: 600;
		color: var(--color-text-primary);
		margin-bottom: var(--space-4);
	}

	.settings-section p {
		color: var(--color-text-secondary);
		line-height: 1.6;
		margin: 0;
	}

	.message {
		padding: 1rem;
		border-radius: 0.5rem;
		margin-bottom: 1.5rem;
		font-weight: 500;
	}

	.message.success {
		background: #d1fae5;
		color: #065f46;
		border: 1px solid #a7f3d0;
	}

	.message.error {
		background: #fee2e2;
		color: #991b1b;
		border: 1px solid #fca5a5;
	}

	.setting-item {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.setting-header h3 {
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
		max-width: 300px;
	}

	.setting-control select:focus {
		outline: none;
		border-color: var(--color-brand-primary);
		box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
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
		max-width: fit-content;
	}

	.save-button:hover:not(:disabled) {
		background: var(--color-brand-primary-dark);
	}

	.save-button:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.spinner {
		width: 16px;
		height: 16px;
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-top: 2px solid white;
		border-radius: 50%;
		animation: spin 1s linear infinite;
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

	@media (max-width: 768px) {
		.page-header h1 {
			font-size: 2rem;
		}

		.settings-content {
			padding: 0 var(--space-4);
		}

		.settings-section {
			padding: var(--space-4);
		}

		.setting-control {
			align-items: stretch;
		}

		.setting-control select,
		.save-button {
			max-width: none;
		}
	}
</style>