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
				<div class="feature-grid">
					<div class="feature-card">
						<div class="feature-icon">
							<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
								<circle cx="12" cy="16" r="1"/>
								<path d="M7 11V7a5 5 0 0 1 10 0v4"/>
							</svg>
						</div>
						<h3>Quantum-Resistant</h3>
						<p>Protected against future quantum computing threats</p>
					</div>
					<div class="feature-card">
						<div class="feature-icon">
							<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
							</svg>
						</div>
						<h3>End-to-End Encrypted</h3>
						<p>Your messages are encrypted before leaving your device</p>
					</div>
					<div class="feature-card">
						<div class="feature-icon">
							<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
							</svg>
						</div>
						<h3>Privacy First</h3>
						<p>No data collection, no tracking, complete privacy</p>
					</div>
				</div>
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
				<p>Uses CRYSTALS-Kyber and CRYSTALS-Dilithium algorithms approved by NIST for quantum resistance.</p>
			</div>
			<div class="feature-item">
				<div class="feature-number">02</div>
				<h3>Phone Number Authentication</h3>
				<p>Simple and secure registration using your phone number with SMS verification.</p>
			</div>
			<div class="feature-item">
				<div class="feature-number">03</div>
				<h3>Real-time Messaging</h3>
				<p>Instant message delivery with typing indicators and read receipts.</p>
			</div>
			<div class="feature-item">
				<div class="feature-number">04</div>
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
	
	.feature-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: var(--space-6);
	}
	
	.feature-card {
		background: rgba(255, 255, 255, 0.1);
		backdrop-filter: blur(10px);
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: var(--radius-xl);
		padding: var(--space-6);
		text-align: center;
		transition: transform 0.3s ease, box-shadow 0.3s ease;
	}
	
	.feature-card:hover {
		transform: translateY(-5px);
		box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
	}
	
	.feature-icon {
		width: 48px;
		height: 48px;
		background: rgba(255, 255, 255, 0.2);
		border-radius: var(--radius-xl);
		display: flex;
		align-items: center;
		justify-content: center;
		margin: 0 auto var(--space-4);
		color: white;
	}
	
	.feature-card h3 {
		font-size: 1.125rem;
		font-weight: 600;
		margin-bottom: var(--space-2);
	}
	
	.feature-card p {
		font-size: 0.875rem;
		opacity: 0.8;
		line-height: 1.5;
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
		
		.feature-grid {
			grid-template-columns: 1fr;
		}
		
		.features-grid {
			grid-template-columns: 1fr;
		}
		
		.section-header h2 {
			font-size: 2rem;
		}
	}
</style>
