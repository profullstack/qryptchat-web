<script>
	import { t } from '$lib/stores/i18n.js';
</script>

<div class="hero">
	<div class="container">
		<div class="hero-content">
			<div class="hero-text">
				<h1 class="hero-title">
					{$t('app.name')}
				</h1>
				<p class="hero-tagline">
					{$t('app.tagline')}
				</p>
				<p class="hero-description">
					{$t('app.description')}
				</p>
				<div class="hero-actions">
					<a href="/auth" class="btn btn-primary">
						{$t('nav.register')}
					</a>
					<a href="/auth" class="btn btn-secondary">
						{$t('nav.login')}
					</a>
				</div>
			</div>
			<div class="hero-visual">
				<img src="/hero.svg" alt="QryptChat Hero" class="hero-image" />
			</div>
		</div>
	</div>
</div>

<section class="features">
	<div class="container">
		<div class="section-header">
			<h2>Why Choose QryptChat?</h2>
			<p>Built for the future of secure communication</p>
		</div>
		<div class="features-grid">
			<div class="feature-item">
				<div class="feature-number">01</div>
				<h3>Post-Quantum Cryptography</h3>
				<p>Uses ML-KEM-1024 (CRYSTALS-Kyber) and CRYSTALS-Dilithium algorithms approved by NIST for quantum resistance.</p>
			</div>
			<div class="feature-item">
				<div class="feature-number">02</div>
				<h3>Phone Number Authentication</h3>
				<p>Simple and secure registration using your phone number with SMS verification.</p>
			</div>
			<div class="feature-item">
				<div class="feature-number">03</div>
				<h3>🔐 Encrypted Voice & Video Calls</h3>
				<p>Crystal-clear 1:1 and group calls protected with ML-KEM-1024 post-quantum encryption. Your conversations stay private, even against future quantum computers.</p>
			</div>
			<div class="feature-item">
				<div class="feature-number">04</div>
				<h3>Real-time Messaging</h3>
				<p>Instant message delivery with typing indicators and read receipts.</p>
			</div>
			<div class="feature-item">
				<div class="feature-number">05</div>
				<h3>Multi-language Support</h3>
				<p>Available in multiple languages with full internationalization support.</p>
			</div>
		</div>
	</div>
</section>

<style>
	.hero {
		background: linear-gradient(135deg, var(--color-brand-primary) 0%, var(--color-brand-secondary) 100%);
		color: white;
		padding: var(--space-20) 0;
		min-height: 80vh;
		display: flex;
		align-items: center;
	}
	
	.hero-content {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-16);
		align-items: center;
	}
	
	.hero-title {
		font-size: 3.5rem;
		font-weight: 800;
		line-height: 1.1;
		margin-bottom: var(--space-4);
		background: linear-gradient(45deg, #ffffff, #e2e8f0);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}
	
	.hero-tagline {
		font-size: 1.5rem;
		font-weight: 600;
		margin-bottom: var(--space-4);
		opacity: 0.9;
	}
	
	.hero-description {
		font-size: 1.125rem;
		line-height: 1.7;
		margin-bottom: var(--space-8);
		opacity: 0.8;
	}
	
	.hero-actions {
		display: flex;
		gap: var(--space-4);
	}
	
	.hero-actions .btn {
		padding: var(--space-4) var(--space-8);
		font-size: 1.125rem;
		font-weight: 600;
	}
	
	.hero-actions .btn-primary {
		background-color: white;
		color: var(--color-brand-primary);
		border-color: white;
	}
	
	.hero-actions .btn-primary:hover {
		background-color: var(--color-bg-secondary);
		transform: translateY(-2px);
		box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
	}
	
	.hero-actions .btn-secondary {
		background-color: transparent;
		color: white;
		border-color: rgba(255, 255, 255, 0.3);
	}
	
	.hero-actions .btn-secondary:hover {
		background-color: rgba(255, 255, 255, 0.1);
		border-color: white;
	}
	
	.hero-image {
		width: 100%;
		height: auto;
		max-width: 500px;
		opacity: 0.9;
		filter: drop-shadow(0 10px 30px rgba(0, 0, 0, 0.3));
	}
	
	.features {
		padding: var(--space-20) 0;
		background-color: var(--color-bg-secondary);
	}
	
	.section-header {
		text-align: center;
		margin-bottom: var(--space-16);
	}
	
	.section-header h2 {
		font-size: 2.5rem;
		font-weight: 700;
		color: var(--color-text-primary);
		margin-bottom: var(--space-4);
	}
	
	.section-header p {
		font-size: 1.25rem;
		color: var(--color-text-secondary);
	}
	
	.features-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
		gap: var(--space-8);
	}
	
	.feature-item {
		background-color: var(--color-bg-primary);
		border: 1px solid var(--color-border-primary);
		border-radius: var(--radius-xl);
		padding: var(--space-8);
		transition: transform 0.3s ease, box-shadow 0.3s ease;
	}
	
	.feature-item:hover {
		transform: translateY(-5px);
		box-shadow: var(--shadow-xl);
	}
	
	.feature-number {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		background: linear-gradient(135deg, var(--color-brand-primary), var(--color-brand-secondary));
		color: white;
		border-radius: var(--radius-xl);
		font-weight: 700;
		font-size: 1.125rem;
		margin-bottom: var(--space-4);
	}
	
	.feature-item h3 {
		font-size: 1.5rem;
		font-weight: 600;
		color: var(--color-text-primary);
		margin-bottom: var(--space-3);
	}
	
	.feature-item p {
		color: var(--color-text-secondary);
		line-height: 1.6;
	}
	
	/* Responsive Design */
	@media (max-width: 768px) {
		.hero {
			padding: var(--space-16) 0;
			min-height: 70vh;
		}
		
		.hero-content {
			grid-template-columns: 1fr;
			gap: var(--space-12);
			text-align: center;
		}
		
		.hero-title {
			font-size: 2.5rem;
		}
		
		.hero-tagline {
			font-size: 1.25rem;
		}
		
		.hero-actions {
			justify-content: center;
		}
		
		.hero-image {
			max-width: 400px;
		}
		
		.features-grid {
			grid-template-columns: 1fr;
		}
		
		.section-header h2 {
			font-size: 2rem;
		}
	}
</style>
