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

	function handleUpgrade() {
		// Placeholder for upgrade functionality
		alert('Premium upgrade functionality coming soon!');
	}
</script>

<svelte:head>
	<title>Upgrade to Premium - QryptChat</title>
	<meta name="description" content="Upgrade to QryptChat Premium for enhanced features" />
</svelte:head>

<main class="premium-page">
	<div class="container">
		<header class="page-header">
			<div class="premium-badge">
				<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/>
				</svg>
				Premium
			</div>
			<h1>Upgrade to Premium</h1>
			<p class="subtitle">Unlock advanced quantum-safe encryption and premium features</p>
		</header>

		<div class="pricing-section">
			<div class="pricing-card">
				<div class="pricing-header">
					<h2>QryptChat Premium</h2>
					<div class="price">
						<span class="currency">$</span>
						<span class="amount">9.99</span>
						<span class="period">/month</span>
					</div>
				</div>

				<div class="features-list">
					<div class="feature-item">
						<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<polyline points="20,6 9,17 4,12"/>
						</svg>
						<span>Advanced quantum-safe encryption</span>
					</div>
					<div class="feature-item">
						<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<polyline points="20,6 9,17 4,12"/>
						</svg>
						<span>Unlimited message history</span>
					</div>
					<div class="feature-item">
						<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<polyline points="20,6 9,17 4,12"/>
						</svg>
						<span>Priority customer support</span>
					</div>
					<div class="feature-item">
						<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<polyline points="20,6 9,17 4,12"/>
						</svg>
						<span>Advanced file sharing (up to 100MB)</span>
					</div>
					<div class="feature-item">
						<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<polyline points="20,6 9,17 4,12"/>
						</svg>
						<span>Custom themes and personalization</span>
					</div>
					<div class="feature-item">
						<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<polyline points="20,6 9,17 4,12"/>
						</svg>
						<span>Early access to new features</span>
					</div>
				</div>

				<button class="btn btn-primary upgrade-btn" on:click={handleUpgrade}>
					<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/>
					</svg>
					Upgrade Now
				</button>
			</div>
		</div>

		<div class="faq-section">
			<h2>Frequently Asked Questions</h2>
			<div class="faq-grid">
				<div class="faq-item">
					<h3>What is quantum-safe encryption?</h3>
					<p>Quantum-safe encryption uses algorithms that are resistant to attacks from quantum computers, ensuring your messages remain secure even in the future.</p>
				</div>
				<div class="faq-item">
					<h3>Can I cancel anytime?</h3>
					<p>Yes, you can cancel your Premium subscription at any time. Your premium features will remain active until the end of your billing period.</p>
				</div>
				<div class="faq-item">
					<h3>Is there a free trial?</h3>
					<p>We offer a 7-day free trial for new Premium subscribers. You can cancel before the trial ends without being charged.</p>
				</div>
				<div class="faq-item">
					<h3>How secure is my payment information?</h3>
					<p>All payment processing is handled securely through industry-standard encryption and we never store your payment details on our servers.</p>
				</div>
			</div>
		</div>
	</div>
</main>

<style>
	.premium-page {
		min-height: 100vh;
		padding: var(--space-8) 0;
		background: linear-gradient(135deg, var(--color-bg-primary) 0%, var(--color-bg-secondary) 100%);
	}

	.page-header {
		text-align: center;
		margin-bottom: var(--space-8);
	}

	.premium-badge {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		background: var(--color-brand-primary);
		color: white;
		padding: var(--space-2) var(--space-4);
		border-radius: var(--radius-full);
		font-size: 0.875rem;
		font-weight: 600;
		margin-bottom: var(--space-4);
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
		max-width: 600px;
		margin: 0 auto;
	}

	.pricing-section {
		max-width: 500px;
		margin: 0 auto var(--space-12);
	}

	.pricing-card {
		background: var(--color-bg-primary);
		border: 2px solid var(--color-brand-primary);
		border-radius: var(--radius-xl);
		padding: var(--space-8);
		box-shadow: var(--shadow-xl);
		position: relative;
		overflow: hidden;
	}

	.pricing-card::before {
		content: '';
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 4px;
		background: linear-gradient(90deg, var(--color-brand-primary), var(--color-brand-secondary));
	}

	.pricing-header {
		text-align: center;
		margin-bottom: var(--space-6);
	}

	.pricing-header h2 {
		font-size: 1.5rem;
		font-weight: 600;
		color: var(--color-text-primary);
		margin-bottom: var(--space-4);
	}

	.price {
		display: flex;
		align-items: baseline;
		justify-content: center;
		gap: var(--space-1);
	}

	.currency {
		font-size: 1.5rem;
		font-weight: 600;
		color: var(--color-brand-primary);
	}

	.amount {
		font-size: 3rem;
		font-weight: 700;
		color: var(--color-brand-primary);
	}

	.period {
		font-size: 1rem;
		color: var(--color-text-secondary);
	}

	.features-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		margin-bottom: var(--space-8);
	}

	.feature-item {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}

	.feature-item svg {
		color: var(--color-success);
		flex-shrink: 0;
	}

	.feature-item span {
		color: var(--color-text-primary);
		font-weight: 500;
	}

	.upgrade-btn {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		padding: var(--space-4) var(--space-6);
		font-size: 1.125rem;
		font-weight: 600;
	}

	.faq-section {
		max-width: 800px;
		margin: 0 auto;
	}

	.faq-section h2 {
		text-align: center;
		font-size: 2rem;
		font-weight: 600;
		color: var(--color-text-primary);
		margin-bottom: var(--space-8);
	}

	.faq-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
		gap: var(--space-6);
	}

	.faq-item {
		background: var(--color-bg-primary);
		border: 1px solid var(--color-border-primary);
		border-radius: var(--radius-lg);
		padding: var(--space-6);
	}

	.faq-item h3 {
		font-size: 1.125rem;
		font-weight: 600;
		color: var(--color-text-primary);
		margin-bottom: var(--space-3);
	}

	.faq-item p {
		color: var(--color-text-secondary);
		line-height: 1.6;
		margin: 0;
	}

	@media (max-width: 768px) {
		.page-header h1 {
			font-size: 2rem;
		}

		.pricing-section,
		.faq-section {
			padding: 0 var(--space-4);
		}

		.pricing-card {
			padding: var(--space-6);
		}

		.amount {
			font-size: 2.5rem;
		}

		.faq-grid {
			grid-template-columns: 1fr;
		}
	}
</style>