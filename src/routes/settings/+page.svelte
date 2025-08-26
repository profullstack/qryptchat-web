<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { createSupabaseClient } from '$lib/supabase.js';
	import SMSNotificationSettings from '$lib/components/settings/SMSNotificationSettings.svelte';
	
	const supabase = createSupabaseClient();
	
	let user = $state(null);
	let loading = $state(true);
	let error = $state('');
	
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
			error = err.message || 'Failed to load settings';
		} finally {
			loading = false;
		}
	});
	
	function handleSMSSettingsUpdated(event) {
		console.log('SMS settings updated:', event.detail);
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
					<SMSNotificationSettings 
						bind:user={user}
						on:updated={handleSMSSettingsUpdated}
					/>
				</section>
				
				<!-- Future settings sections can be added here -->
				<section class="settings-section">
					<div class="placeholder-section">
						<h3>More Settings Coming Soon</h3>
						<p>Additional notification and privacy settings will be available here.</p>
					</div>
				</section>
			</div>
		{/if}
	</div>
</div>

<style>
	.settings-page {
		min-height: 100vh;
		background: var(--bg-primary, #f7fafc);
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
		color: var(--text-primary, #1a202c);
	}
	
	.page-header p {
		margin: 0;
		color: var(--text-secondary, #4a5568);
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
		border: 3px solid var(--border-color, #e2e8f0);
		border-top: 3px solid var(--primary-color, #3182ce);
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
		color: var(--text-secondary, #4a5568);
		font-size: 1rem;
	}
	
	.error-state button {
		margin-top: 1rem;
		padding: 0.5rem 1rem;
		background: var(--primary-color, #3182ce);
		color: white;
		border: none;
		border-radius: 0.375rem;
		cursor: pointer;
		font-size: 0.875rem;
		font-weight: 500;
		transition: background-color 0.2s ease;
	}
	
	.error-state button:hover {
		background: var(--primary-color-hover, #2c5aa0);
	}
	
	.settings-sections {
		display: flex;
		flex-direction: column;
		gap: 2rem;
	}
	
	.settings-section {
		background: white;
		border-radius: 0.5rem;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
		overflow: hidden;
	}
	
	.placeholder-section {
		padding: 2rem;
		text-align: center;
		border: 2px dashed var(--border-color, #e2e8f0);
		border-radius: 0.5rem;
		background: var(--bg-secondary, #f8f9fa);
	}
	
	.placeholder-section h3 {
		margin: 0 0 0.5rem 0;
		font-size: 1.25rem;
		font-weight: 600;
		color: var(--text-primary, #1a202c);
	}
	
	.placeholder-section p {
		margin: 0;
		color: var(--text-secondary, #4a5568);
		font-size: 0.875rem;
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
	}
</style>