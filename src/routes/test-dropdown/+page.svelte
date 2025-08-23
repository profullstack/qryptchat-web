<script>
	import { onMount } from 'svelte';
	import { testAuth, testUser, testIsAuthenticated } from '$lib/stores/test-auth.js';
	import TestNavbar from './TestNavbar.svelte';

	// Initialize test authentication on mount
	onMount(() => {
		testAuth.initialize();
	});

	function toggleAuth() {
		if ($testIsAuthenticated) {
			testAuth.logout();
		} else {
			testAuth.login();
		}
	}
</script>

<svelte:head>
	<title>Test Dropdown - QryptChat</title>
	<meta name="description" content="Test page for dropdown functionality" />
</svelte:head>

<!-- Use test navbar that uses test auth stores -->
<TestNavbar />

<main class="test-page">
	<div class="container">
		<header class="page-header">
			<h1>Dropdown Test Page</h1>
			<p class="subtitle">Testing the username dropdown functionality</p>
		</header>

		<div class="test-content">
			<div class="test-section">
				<h2>Authentication Status</h2>
				<p><strong>Authenticated:</strong> {$testIsAuthenticated ? 'Yes' : 'No'}</p>
				{#if $testUser}
					<p><strong>Username:</strong> {$testUser.username}</p>
					<p><strong>Display Name:</strong> {$testUser.displayName}</p>
				{/if}
			</div>

			<div class="test-section">
				<h2>Test Controls</h2>
				<button class="btn btn-primary" on:click={toggleAuth}>
					{$testIsAuthenticated ? 'Logout' : 'Login'} (Test)
				</button>
			</div>

			<div class="test-section">
				<h2>Instructions</h2>
				<ol>
					<li>Click "Login (Test)" to simulate authentication</li>
					<li>Look at the navbar - you should see the username with a dropdown arrow</li>
					<li>Click on the username to open the dropdown menu</li>
					<li>The dropdown should contain: Settings, Upgrade to Premium, and Logout</li>
					<li>Test each menu item to verify navigation works</li>
				</ol>
			</div>
		</div>
	</div>
</main>

<style>
	.test-page {
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

	.test-content {
		max-width: 800px;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
	}

	.test-section {
		background: var(--color-bg-secondary);
		border: 1px solid var(--color-border-primary);
		border-radius: var(--radius-lg);
		padding: var(--space-6);
	}

	.test-section h2 {
		font-size: 1.5rem;
		font-weight: 600;
		color: var(--color-text-primary);
		margin-bottom: var(--space-4);
	}

	.test-section p {
		color: var(--color-text-secondary);
		line-height: 1.6;
		margin-bottom: var(--space-3);
	}

	.test-section p:last-child {
		margin-bottom: 0;
	}

	.test-section ol {
		color: var(--color-text-secondary);
		line-height: 1.6;
		padding-left: var(--space-6);
	}

	.test-section li {
		margin-bottom: var(--space-2);
	}

	@media (max-width: 768px) {
		.page-header h1 {
			font-size: 2rem;
		}

		.test-content {
			padding: 0 var(--space-4);
		}

		.test-section {
			padding: var(--space-4);
		}
	}
</style>