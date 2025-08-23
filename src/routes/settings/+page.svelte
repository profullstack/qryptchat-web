<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { isAuthenticated } from '$lib/stores/auth.js';

	// Redirect to auth if not authenticated
	onMount(() => {
		if (!$isAuthenticated) {
			goto('/auth');
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
			<div class="settings-section">
				<h2>Account Settings</h2>
				<p>Account settings functionality coming soon...</p>
			</div>

			<div class="settings-section">
				<h2>Privacy & Security</h2>
				<p>Privacy and security settings coming soon...</p>
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
	}
</style>