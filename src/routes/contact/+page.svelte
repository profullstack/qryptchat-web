<script>
	import { t } from '$lib/stores/i18n.js';
</script>

<svelte:head>
	<title>Contact Us - QryptChat</title>
	<meta name="description" content="Get in touch with the QryptChat team - support, feedback, and business inquiries welcome." />
</svelte:head>

<div class="contact-page">
	<div class="container">
		<header class="page-header">
			<h1>Contact Us</h1>
			<p class="subtitle">We'd love to hear from you</p>
		</header>

		<div class="content">
			<div class="contact-grid">
				<section class="contact-section">
					<h2>📧 General Support</h2>
					<p>Need help with your account or have questions about QryptChat?</p>
					<div class="contact-info">
						<strong>Email:</strong> support@qrypt.chat<br>
						<strong>Response Time:</strong> Within 24 hours
					</div>
				</section>

				<section class="contact-section">
					<h2>🔒 Security & Privacy</h2>
					<p>Questions about our security measures or privacy practices?</p>
					<div class="contact-info">
						<strong>Email:</strong> security@qrypt.chat<br>
						<strong>PGP Key:</strong> Available on request
					</div>
				</section>

				<section class="contact-section">
					<h2>🏢 Business Inquiries</h2>
					<p>Interested in partnerships, enterprise solutions, or media inquiries?</p>
					<div class="contact-info">
						<strong>Email:</strong> business@qrypt.chat<br>
						<strong>Response Time:</strong> Within 48 hours
					</div>
				</section>

				<section class="contact-section">
					<h2>🐛 Bug Reports</h2>
					<p>Found a bug or security vulnerability? We appreciate responsible disclosure.</p>
					<div class="contact-info">
						<strong>Email:</strong> bugs@qrypt.chat<br>
						<strong>GitHub:</strong> <a href="https://github.com/profullstack" target="_blank" rel="noopener noreferrer">github.com/profullstack</a>
					</div>
				</section>

				<section class="contact-section">
					<h2>💡 Feature Requests</h2>
					<p>Have an idea for improving QryptChat? We'd love to hear it!</p>
					<div class="contact-info">
						<strong>Email:</strong> feedback@qrypt.chat<br>
						<strong>Community:</strong> Join our <a href="https://discord.gg/w5nHdzpQ29" target="_new">Discord</a> server
					</div>
				</section>

				<section class="contact-section">
					<h2>⚖️ Legal</h2>
					<p>Legal notices, DMCA requests, or compliance inquiries.</p>
					<div class="contact-info">
						<strong>Email:</strong> legal@qrypt.chat<br>
						<strong>Company:</strong> Profullstack, Inc.
					</div>
				</section>
			</div>

			<section class="social-section">
				<h2>🌐 Connect With Us</h2>
				<p>Follow us on social media for updates and community discussions:</p>
				<div class="social-links">
					<a href="https://discord.gg/w5nHdzpQ29" target="_blank" rel="noopener noreferrer" class="social-link discord">
						<svg fill="currentColor" viewBox="0 0 24 24">
							<path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z"/>
						</svg>
						Discord
					</a>
					<a href="https://github.com/profullstack" target="_blank" rel="noopener noreferrer" class="social-link github">
						<svg fill="currentColor" viewBox="0 0 24 24">
							<path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
						</svg>
						GitHub
					</a>
					<a href="https://x.com/profullstack" target="_blank" rel="noopener noreferrer" class="social-link twitter">
						<svg fill="currentColor" viewBox="0 0 24 24">
							<path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z"/>
						</svg>
						X (Twitter)
					</a>
					<a href="https://bsky.app/profile/profullstack.bsky.social" target="_blank" rel="noopener noreferrer" class="social-link bluesky">
						<svg fill="currentColor" viewBox="0 0 24 24">
							<path d="M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944 1.561 1.266.902 1.565.139 1.908 0 3.08 0 3.768c0 .69.378 5.65.624 6.479.815 2.736 3.713 3.66 6.383 3.364.136-.02.275-.039.415-.056-.138.017-.275.036-.415.056-2.67-.296-5.568.628-6.383 3.364C.378 17.902 0 22.862 0 23.55c0 .688.139 1.86.902 2.203.659.299 1.664.621 4.3-1.239 2.752-1.942 5.711-5.881 6.798-7.995 1.087 2.114 4.046 6.053 6.798 7.995 2.636 1.86 3.641 1.538 4.3 1.239.763-.343.902-1.515.902-2.203 0-.688-.378-5.648-.624-6.479-.815-2.736-3.713-3.66-6.383-3.364-.14.017-.277.039-.415.056.138-.017.275-.036.415-.056 2.67.296 5.568-.628 6.383-3.364.246-.829.624-5.789.624-6.479 0-.688-.139-1.86-.902-2.203-.659-.299-1.664-.621-4.3 1.239-2.752 1.942-5.711 5.881-6.798 7.995Z"/>
						</svg>
						Bluesky
					</a>
					<a href="https://primal.net/p/npub1profullstack" target="_blank" rel="noopener noreferrer" class="social-link nostr">
						<svg fill="currentColor" viewBox="0 0 256 256">
							<path d="M210.8 199.4c0 3.1-2.5 5.7-5.7 5.7h-68c-3.1 0-5.7-2.5-5.7-5.7v-15.5c.3-19 2.3-37.2 6.5-45.5 2.5-5 6.7-7.7 11.5-9.1 9.1-2.7 24.9-.9 31.7-1.2 0 0 20.4.8 20.4-10.7s-9.1-8.6-9.1-8.6c-10 .3-17.7-.4-22.6-2.4-8.3-3.3-8.6-9.2-8.6-11.2-.4-23.1-34.5-25.9-64.5-20.1-32.8 6.2.4 53.3.4 116.1v8.4c0 3.1-2.6 5.6-5.7 5.6H57.7c-3.1 0-5.7-2.5-5.7-5.7v-144c0-3.1 2.5-5.7 5.7-5.7h31.7c3.1 0 5.7 2.5 5.7 5.7 0 4.7 5.2 7.2 9 4.5 11.4-8.2 26-12.5 42.4-12.5 36.6 0 64.4 21.4 64.4 68.7v83.2ZM150 99.3c0-6.7-5.4-12.1-12.1-12.1s-12.1 5.4-12.1 12.1 5.4 12.1 12.1 12.1S150 106 150 99.3Z"/>
						</svg>
						Nostr
					</a>
				</div>
			</section>

			<section class="response-section">
				<h2>⏱️ Response Times</h2>
				<div class="response-grid">
					<div class="response-item">
						<strong>Support Requests</strong>
						<span>Within 24 hours</span>
					</div>
					<div class="response-item">
						<strong>Security Issues</strong>
						<span>Within 4 hours</span>
					</div>
					<div class="response-item">
						<strong>Business Inquiries</strong>
						<span>Within 48 hours</span>
					</div>
					<div class="response-item">
						<strong>Bug Reports</strong>
						<span>Within 12 hours</span>
					</div>
				</div>
			</section>
		</div>
	</div>
</div>

<style>
	.contact-page {
		min-height: 100vh;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		padding: 2rem 0;
	}

	.container {
		max-width: 1000px;
		margin: 0 auto;
		padding: 0 1.5rem;
	}

	.page-header {
		text-align: center;
		margin-bottom: 3rem;
		color: white;
	}

	.page-header h1 {
		font-size: 3rem;
		font-weight: bold;
		margin: 0 0 1rem 0;
		text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
	}

	.subtitle {
		font-size: 1.25rem;
		opacity: 0.9;
		margin: 0;
	}

	.content {
		display: grid;
		gap: 3rem;
	}

	.contact-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
		gap: 2rem;
	}

	.contact-section {
		background: rgba(255, 255, 255, 0.95);
		border-radius: 1rem;
		padding: 2rem;
		box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
		backdrop-filter: blur(10px);
	}

	.contact-section h2 {
		font-size: 1.25rem;
		font-weight: 600;
		margin: 0 0 1rem 0;
		color: #1e293b;
	}

	.contact-section p {
		color: #475569;
		line-height: 1.6;
		margin: 0 0 1rem 0;
	}

	.contact-info {
		color: #475569;
		line-height: 1.6;
	}

	.contact-info strong {
		color: #1e293b;
		font-weight: 600;
	}

	/* Links will inherit global theme-aware styling */
	.contact-info a {
		font-weight: 500;
	}

	.social-section {
		background: rgba(255, 255, 255, 0.95);
		border-radius: 1rem;
		padding: 2rem;
		box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
		backdrop-filter: blur(10px);
		text-align: center;
	}

	.social-section h2 {
		font-size: 1.5rem;
		font-weight: 600;
		margin: 0 0 1rem 0;
		color: #1e293b;
	}

	.social-section p {
		color: #475569;
		line-height: 1.6;
		margin: 0 0 2rem 0;
	}

	.social-links {
		display: flex;
		justify-content: center;
		gap: 1rem;
		flex-wrap: wrap;
	}

	.social-link {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem 1.5rem;
		background: #1e293b;
		color: white;
		text-decoration: none;
		border-radius: 0.5rem;
		font-weight: 500;
		transition: all 0.3s ease;
	}

	.social-link:hover {
		transform: translateY(-2px);
		box-shadow: 0 5px 15px rgba(0, 0, 0, 0.2);
	}

	.social-link svg {
		width: 1.25rem;
		height: 1.25rem;
	}

	.social-link.discord:hover {
		background: #5865f2;
	}

	.social-link.github:hover {
		background: #333;
	}

	.social-link.twitter:hover {
		background: #1da1f2;
	}

	.social-link.bluesky:hover {
		background: #0085ff;
	}

	.social-link.nostr:hover {
		background: #662482;
	}

	.response-section {
		background: rgba(255, 255, 255, 0.95);
		border-radius: 1rem;
		padding: 2rem;
		box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
		backdrop-filter: blur(10px);
	}

	.response-section h2 {
		font-size: 1.5rem;
		font-weight: 600;
		margin: 0 0 1.5rem 0;
		color: #1e293b;
		text-align: center;
	}

	.response-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 1rem;
	}

	.response-item {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		padding: 1rem;
		background: rgba(99, 102, 241, 0.1);
		border-radius: 0.5rem;
		border: 1px solid rgba(99, 102, 241, 0.2);
	}

	.response-item strong {
		color: #1e293b;
		font-weight: 600;
		margin-bottom: 0.5rem;
	}

	.response-item span {
		color: #6366f1;
		font-weight: 500;
	}

	@media (max-width: 768px) {
		.page-header h1 {
			font-size: 2rem;
		}

		.contact-section {
			padding: 1.5rem;
		}

		.social-section {
			padding: 1.5rem;
		}

		.response-section {
			padding: 1.5rem;
		}

		.social-links {
			flex-direction: column;
			align-items: center;
		}

		.social-link {
			width: 100%;
			max-width: 200px;
			justify-content: center;
		}
	}
</style>