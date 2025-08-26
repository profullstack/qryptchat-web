<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { createSupabaseClient } from '$lib/supabase.js';
	import { currentTheme, themeUtils, themes } from '$lib/stores/theme.js';
	import SMSNotificationSettings from '$lib/components/settings/SMSNotificationSettings.svelte';
	import EncryptionSettings from '$lib/components/settings/EncryptionSettings.svelte';
	import PrivateKeyManager from '$lib/components/settings/PrivateKeyManager.svelte';
	import EncryptionTester from '$lib/components/settings/EncryptionTester.svelte';
	
	const supabase = createSupabaseClient();
	
	let user = $state(null);
	let loading = $state(true);
	let error = $state('');
	let selectedTheme = $state($currentTheme);
	
	// Subscribe to theme changes
	$effect(() => {
		selectedTheme = $currentTheme;
	});
	
	onMount(async () => {
		try {
			// Get current user
			const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
			
			if (authError || !authUser) {
				goto('/auth');
				return;
			}
			
			// Get user profile with SMS preferences
			const { data: userProfile, error: profileError } = await supabase
				.from('users')
				.select('*')
				.eq('auth_user_id', authUser.id)
				.single();
			
			if (profileError) {
				throw profileError;
			}
			
			user = userProfile;
			
		} catch (err) {
			console.error('Failed to load user settings:', err);
			error = (err instanceof Error ? err.message : String(err)) || 'Failed to load settings';
		} finally {
			loading = false;
		}
	});
	
	/**
	 * @param {CustomEvent} event
	 */
	function handleSMSSettingsUpdated(event) {
		console.log('SMS settings updated:', event.detail);
	}
	
	/**
	 * @param {CustomEvent} event
	 */
	function handleEncryptionSettingsUpdated(event) {
		console.log('Encryption settings updated:', event.detail);
	}
	
	/**
	 * @param {CustomEvent} event
	 */
	function handlePrivateKeyExported(event) {
		console.log('Private keys exported:', event.detail);
	}
	
	/**
	 * @param {CustomEvent} event
	 */
	function handlePrivateKeyImported(event) {
		console.log('Private keys imported:', event.detail);
		// No need to reload the page - the component handles its own state updates
	}
	
	/**
	 * Handle theme change
	 * @param {Event} event
	 */
	function handleThemeChange(event) {
		const target = /** @type {HTMLSelectElement} */ (event.target);
		const newTheme = target.value;
		themeUtils.setTheme(newTheme);
		selectedTheme = newTheme;
	}
</script>

<svelte:head>
	<title>Settings - QryptChat</title>
</svelte:head>

<div class="settings-page">
	<div class="container">
		<header class="page-header">
			<h1>Settings</h1>
			<p>Manage your account preferences and notification settings</p>
		</header>
		
		{#if loading}
			<div class="loading-state">
				<div class="spinner"></div>
				<p>Loading settings...</p>
			</div>
		{:else if error}
			<div class="error-state">
				<p>Error: {error}</p>
				<button onclick={() => window.location.reload()}>
					Retry
				</button>
			</div>
		{:else if user}
			<div class="settings-sections">
				<section class="settings-section">
					<div class="setting-group">
						<h2>Appearance</h2>
						<div class="setting-item">
							<label for="theme-select">Theme</label>
							<select
								id="theme-select"
								value={selectedTheme}
								onchange={handleThemeChange}
								class="theme-select"
							>
								{#each Object.entries(themes) as [key, theme]}
									<option value={key}>{theme.name}</option>
								{/each}
							</select>
						</div>
					</div>
				</section>
				
				<section class="settings-section">
					<SMSNotificationSettings
						bind:user={user}
						on:updated={handleSMSSettingsUpdated}
					/>
				</section>
				
				<section class="settings-section">
					<EncryptionSettings
						{user}
						on:updated={handleEncryptionSettingsUpdated}
					/>
				</section>
				
				<section class="settings-section">
					<PrivateKeyManager
						{user}
						on:exported={handlePrivateKeyExported}
						on:imported={handlePrivateKeyImported}
					/>
				</section>
				
				<section class="settings-section">
					<EncryptionTester />
				</section>
			</div>
		{/if}
	</div>
</div>

<style>
	.settings-page {
		min-height: 100vh;
		background: var(--bg-primary);
		padding: 2rem 1rem;
	}
	
	.container {
		max-width: 800px;
		margin: 0 auto;
	}
	
	.page-header {
		margin-bottom: 2rem;
		text-align: center;
	}
	
	.page-header h1 {
		margin: 0 0 0.5rem 0;
		font-size: 2rem;
		font-weight: 700;
		color: var(--text-primary);
	}
	
	.page-header p {
		margin: 0;
		color: var(--text-secondary);
		font-size: 1rem;
	}
	
	.loading-state,
	.error-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 3rem;
		text-align: center;
	}
	
	.loading-state .spinner {
		width: 2rem;
		height: 2rem;
		border: 3px solid var(--border-primary);
		border-top: 3px solid var(--brand-primary);
		border-radius: 50%;
		animation: spin 1s linear infinite;
		margin-bottom: 1rem;
	}
	
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	
	.loading-state p,
	.error-state p {
		margin: 0;
		color: var(--text-secondary);
		font-size: 1rem;
	}
	
	.error-state button {
		margin-top: 1rem;
		padding: 0.5rem 1rem;
		background: var(--brand-primary);
		color: var(--bg-primary);
		border: none;
		border-radius: 0.375rem;
		cursor: pointer;
		font-size: 0.875rem;
		font-weight: 500;
		transition: background-color 0.2s ease;
	}
	
	.error-state button:hover {
		background: var(--brand-secondary);
	}
	
	.settings-sections {
		display: flex;
		flex-direction: column;
		gap: 2rem;
	}
	
	.settings-section {
		background: var(--bg-secondary);
		border: 1px solid var(--border-primary);
		border-radius: 0.5rem;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
		overflow: hidden;
	}
	
	.setting-group {
		padding: 1.5rem;
	}
	
	.setting-group h2 {
		margin: 0 0 1rem 0;
		font-size: 1.25rem;
		font-weight: 600;
		color: var(--text-primary);
	}
	
	.setting-item {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	
	.setting-item label {
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--text-secondary);
	}
	
	.theme-select {
		padding: 0.5rem 0.75rem;
		border: 1px solid var(--border-primary);
		border-radius: 0.375rem;
		background: var(--bg-primary);
		color: var(--text-primary);
		font-size: 0.875rem;
		cursor: pointer;
		transition: border-color 0.2s ease;
	}
	
	.theme-select:focus {
		outline: none;
		border-color: var(--brand-primary);
		box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
	}
	
	.theme-select:hover {
		border-color: var(--border-secondary);
	}
	
	@media (max-width: 640px) {
		.settings-page {
			padding: 1rem 0.5rem;
		}
		
		.page-header h1 {
			font-size: 1.75rem;
		}
		
		.settings-sections {
			gap: 1.5rem;
		}
		
		.setting-group {
			padding: 1rem;
		}
	}
</style>