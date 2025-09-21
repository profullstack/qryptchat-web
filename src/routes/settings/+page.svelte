<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { createSupabaseClient } from '$lib/supabase.js';
	import { currentTheme, themeUtils, themes } from '$lib/stores/theme.js';
	import SMSNotificationSettings from '$lib/components/settings/SMSNotificationSettings.svelte';
	import EncryptionSettings from '$lib/components/settings/EncryptionSettings.svelte';
	import PrivateKeyManager from '$lib/components/settings/PrivateKeyManager.svelte';
	import EncryptionTester from '$lib/components/settings/EncryptionTester.svelte';
	import KeyDiagnostic from '$lib/components/settings/KeyDiagnostic.svelte';
	import KeyMigrationFix from '$lib/components/settings/KeyMigrationFix.svelte';
	import AdvancedKeyDiagnostic from '$lib/components/settings/AdvancedKeyDiagnostic.svelte';
	import CompleteKeyReset from '$lib/components/settings/CompleteKeyReset.svelte';
	import KeyResetStatus from '$lib/components/settings/KeyResetStatus.svelte';
	
	const supabase = createSupabaseClient();
	
	let user = $state(null);
	let loading = $state(true);
	let error = $state('');
	let selectedTheme = $state($currentTheme);
	
	// Nuclear delete state
	let showNuclearConfirm = $state(false);
	let nuclearConfirmation = $state('');
	let isDeleting = $state(false);
	let deleteResult = $state(null);
	
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
	
	/**
	 * Perform nuclear delete of all user data
	 */
	async function performNuclearDelete() {
		if (nuclearConfirmation !== 'DELETE_ALL_MY_DATA') {
			return;
		}
		
		isDeleting = true;
		deleteResult = null;
		
		try {
			const response = await fetch('/api/user/nuclear-delete', {
				method: 'DELETE',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					confirmation: nuclearConfirmation
				})
			});
			
			const result = await response.json();
			
			if (response.ok && result.success) {
				deleteResult = {
					success: true,
					message: result.message,
					summary: result.deletion_summary
				};
				
				// Reset form after success
				showNuclearConfirm = false;
				nuclearConfirmation = '';
				
				// After 3 seconds, redirect to home or login page
				setTimeout(() => {
					window.location.href = '/';
				}, 3000);
				
			} else {
				deleteResult = {
					success: false,
					error: result.error || 'Nuclear delete failed'
				};
			}
		} catch (error) {
			console.error('Nuclear delete error:', error);
			deleteResult = {
				success: false,
				error: 'Network error occurred'
			};
		} finally {
			isDeleting = false;
		}
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
				
				<section class="settings-section">
					<KeyDiagnostic />
				</section>
				
				<section class="settings-section">
					<KeyMigrationFix />
				</section>
				
				<section class="settings-section">
					<AdvancedKeyDiagnostic />
				</section>
				
				<section class="settings-section">
					<KeyResetStatus />
				</section>
				
				<section class="settings-section">
					<CompleteKeyReset />
				</section>
				
				<section class="settings-section danger-zone">
					<div class="setting-group">
						<h2>☢️ Danger Zone</h2>
						<p>The following actions are <strong>irreversible</strong> and will permanently delete all your data.</p>
						
						<div class="nuclear-delete-container">
							<h3>Nuclear Delete</h3>
							<p>This will permanently delete <strong>ALL</strong> of your data including:</p>
							<ul>
								<li>All your messages and conversations</li>
								<li>All your uploaded files and attachments</li>
								<li>Your encryption keys and backups</li>
								<li>Your account and profile information</li>
								<li>All SMS notifications and history</li>
							</ul>
							
							<div class="warning-box">
								<p><strong>⚠️ WARNING:</strong> This action cannot be undone. Your account and all associated data will be permanently removed from our servers.</p>
							</div>
							
							{#if !showNuclearConfirm}
								<button
									class="btn-nuclear"
									onclick={() => showNuclearConfirm = true}
								>
									🚨 Nuclear Delete All My Data
								</button>
							{:else}
								<div class="confirm-nuclear">
									<p>Are you absolutely sure? Type <code>DELETE_ALL_MY_DATA</code> to confirm:</p>
									<input
										type="text"
										bind:value={nuclearConfirmation}
										placeholder="Type confirmation here..."
										class="nuclear-input"
									/>
									<div class="nuclear-buttons">
										<button
											class="btn-cancel"
											onclick={() => { showNuclearConfirm = false; nuclearConfirmation = ''; }}
										>
											Cancel
										</button>
										<button
											class="btn-confirm-nuclear"
											disabled={nuclearConfirmation !== 'DELETE_ALL_MY_DATA' || isDeleting}
											onclick={performNuclearDelete}
										>
											{isDeleting ? 'Deleting...' : '💥 Confirm Nuclear Delete'}
										</button>
									</div>
								</div>
							{/if}
							
							{#if deleteResult}
								<div class="delete-result">
									{#if deleteResult.success}
										<div class="success-message">
											<p>✅ Nuclear delete completed successfully!</p>
											<p>All your data has been permanently removed.</p>
										</div>
									{:else}
										<div class="error-message">
											<p>❌ Nuclear delete failed:</p>
											<p>{deleteResult.error}</p>
										</div>
									{/if}
								</div>
							{/if}
						</div>
					</div>
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
	
	.danger-zone {
		border: 2px solid #ef4444;
		background: rgba(239, 68, 68, 0.05);
	}

	.danger-zone h2 {
		color: #dc2626;
	}

	.nuclear-delete-container {
		margin-top: 1.5rem;
	}

	.nuclear-delete-container h3 {
		color: #dc2626;
		font-size: 1.125rem;
		margin-bottom: 1rem;
	}

	.warning-box {
		background: rgba(239, 68, 68, 0.1);
		border: 1px solid #ef4444;
		border-radius: 0.375rem;
		padding: 1rem;
		margin: 1rem 0;
	}

	.warning-box p {
		color: #dc2626;
		margin: 0;
		font-weight: 500;
	}

	.btn-nuclear {
		background: #dc2626;
		color: white;
		border: none;
		padding: 0.75rem 1.5rem;
		border-radius: 0.375rem;
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
		transition: background-color 0.2s;
	}

	.btn-nuclear:hover {
		background: #b91c1c;
	}

	.confirm-nuclear {
		margin-top: 1rem;
		padding: 1rem;
		background: rgba(239, 68, 68, 0.05);
		border-radius: 0.375rem;
		border: 1px solid #ef4444;
	}

	.confirm-nuclear p {
		color: #dc2626;
		font-weight: 500;
		margin-bottom: 0.5rem;
	}

	.confirm-nuclear code {
		background: rgba(0, 0, 0, 0.1);
		padding: 0.25rem 0.5rem;
		border-radius: 0.25rem;
		font-family: monospace;
	}

	.nuclear-input {
		width: 100%;
		padding: 0.5rem 0.75rem;
		margin: 0.5rem 0;
		border: 2px solid #ef4444;
		border-radius: 0.375rem;
		font-size: 0.875rem;
		background: var(--bg-primary);
		color: var(--text-primary);
	}

	.nuclear-input:focus {
		outline: none;
		border-color: #dc2626;
		box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.1);
	}

	.nuclear-buttons {
		display: flex;
		gap: 0.75rem;
		margin-top: 1rem;
	}

	.btn-cancel {
		background: #6b7280;
		color: white;
		border: none;
		padding: 0.5rem 1rem;
		border-radius: 0.375rem;
		cursor: pointer;
		transition: background-color 0.2s;
		font-size: 0.875rem;
	}

	.btn-cancel:hover {
		background: #4b5563;
	}

	.btn-confirm-nuclear {
		background: #dc2626;
		color: white;
		border: none;
		padding: 0.5rem 1rem;
		border-radius: 0.375rem;
		cursor: pointer;
		transition: background-color 0.2s;
		font-weight: 600;
		font-size: 0.875rem;
	}

	.btn-confirm-nuclear:hover:not(:disabled) {
		background: #b91c1c;
	}

	.btn-confirm-nuclear:disabled {
		background: #9ca3af;
		cursor: not-allowed;
	}

	.delete-result {
		margin-top: 1rem;
		padding: 1rem;
		border-radius: 0.375rem;
	}

	.success-message {
		background: rgba(34, 197, 94, 0.1);
		border: 1px solid #22c55e;
		color: #15803d;
	}

	.error-message {
		background: rgba(239, 68, 68, 0.1);
		border: 1px solid #ef4444;
		color: #dc2626;
	}

	.success-message p,
	.error-message p {
		margin: 0.5rem 0;
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
		
		.nuclear-buttons {
			flex-direction: column;
		}
		
		.nuclear-input {
			font-size: 16px; /* Prevent zoom on iOS */
		}
	}
</style>