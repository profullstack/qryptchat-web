<script>
	import { t } from '$lib/stores/i18n.js';
	import { browser } from '$app/environment';
	import { PUBLIC_ONION_URL } from '$env/static/public';
	
	// Check if we're on a .onion domain
	$: isOnionSite = browser && window.location.hostname.endsWith('.onion');
	
	// Use PUBLIC_ONION_URL directly from environment
	const onionUrl = PUBLIC_ONION_URL;
	
	const socialLinks = [
		{
			name: 'Discord',
			url: 'https://discord.gg/w5nHdzpQ29',
			icon: `<svg fill="currentColor" viewBox="0 0 24 24" style="width: 100%; height: 100%;">
				<path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z"/>
			</svg>`
		},
		{
			name: 'GitHub',
			url: 'https://github.com/profullstack',
			icon: `<svg fill="currentColor" viewBox="0 0 24 24" style="width: 100%; height: 100%;">
				<path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
			</svg>`
		},
		{
			name: 'X (Twitter)',
			url: 'https://x.com/profullstackinc',
			icon: `<svg fill="currentColor" viewBox="0 0 24 24" style="width: 100%; height: 100%;">
				<path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z"/>
			</svg>`
		},
		{
			name: 'Bluesky',
			url: 'https://bsky.app/profile/chovyfu.bsky.social',
			icon: `<svg fill="currentColor" viewBox="0 0 24 24" style="width: 100%; height: 100%;">
				<path d="M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944 1.561 1.266.902 1.565.139 1.908 0 3.08 0 3.768c0 .69.378 5.65.624 6.479.815 2.736 3.713 3.66 6.383 3.364.136-.02.275-.039.415-.056-.138.017-.275.036-.415.056-2.67-.296-5.568.628-6.383 3.364C.378 17.902 0 22.862 0 23.55c0 .688.139 1.86.902 2.203.659.299 1.664.621 4.3-1.239 2.752-1.942 5.711-5.881 6.798-7.995 1.087 2.114 4.046 6.053 6.798 7.995 2.636 1.86 3.641 1.538 4.3 1.239.763-.343.902-1.515.902-2.203 0-.688-.378-5.648-.624-6.479-.815-2.736-3.713-3.66-6.383-3.364-.14.017-.277.039-.415.056.138-.017.275-.036.415-.056 2.67.296 5.568-.628 6.383-3.364.246-.829.624-5.789.624-6.479 0-.688-.139-1.86-.902-2.203-.659-.299-1.664-.621-4.3 1.239-2.752 1.942-5.711 5.881-6.798 7.995Z"/>
			</svg>`
		},
		{
			name: 'Nostr',
			url: 'https://primal.net/p/npub1profullstack',
			icon: `<svg viewBox="0 0 256 256" style="width: 100%; height: 100%;">
				<path fill="currentColor" d="M210.8 199.4c0 3.1-2.5 5.7-5.7 5.7h-68c-3.1 0-5.7-2.5-5.7-5.7v-15.5c.3-19 2.3-37.2 6.5-45.5 2.5-5 6.7-7.7 11.5-9.1 9.1-2.7 24.9-.9 31.7-1.2 0 0 20.4.8 20.4-10.7s-9.1-8.6-9.1-8.6c-10 .3-17.7-.4-22.6-2.4-8.3-3.3-8.6-9.2-8.6-11.2-.4-23.1-34.5-25.9-64.5-20.1-32.8 6.2.4 53.3.4 116.1v8.4c0 3.1-2.6 5.6-5.7 5.6H57.7c-3.1 0-5.7-2.5-5.7-5.7v-144c0-3.1 2.5-5.7 5.7-5.7h31.7c3.1 0 5.7 2.5 5.7 5.7 0 4.7 5.2 7.2 9 4.5 11.4-8.2 26-12.5 42.4-12.5 36.6 0 64.4 21.4 64.4 68.7v83.2ZM150 99.3c0-6.7-5.4-12.1-12.1-12.1s-12.1 5.4-12.1 12.1 5.4 12.1 12.1 12.1S150 106 150 99.3Z"/>
			</svg>`
		}
	];
	
	const currentYear = new Date().getFullYear();
</script>

<footer class="footer">
	<div class="footer-content">
		<!-- Brand Section -->
		<div class="brand-section">
			<div class="brand-header">
				<div class="logo">
					<svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
					</svg>
				</div>
				<div class="brand-text">
					<h3>QryptChat</h3>
					<p>Quantum-Safe Messaging</p>
				</div>
			</div>
			
			<p class="brand-description">
				Built with <span class="heart">❤️</span> for a quantum-safe future
			</p>
		</div>

		<!-- Links Section -->
		<div class="links-section">
			<h4>Platform</h4>
			<div class="links-list">
				{#each [
					{ key: 'footer.about', href: '/about' },
					{ key: 'footer.security', href: '/security' },
					{ key: 'footer.privacy', href: '/privacy' },
					{ key: 'footer.terms', href: '/terms' },
					{ key: 'footer.contact', href: '/contact' },
					{ key: 'footer.warrantCanary', href: '/warrant-canary' }
				] as link}
					<a href={link.href} class="footer-link">
						{$t(link.key)}
					</a>
				{/each}
			</div>
		</div>

		<!-- Social Section -->
		<div class="social-section">
			<h4>Connect</h4>
			<p class="social-description">Join our community</p>
			
			<div class="social-grid">
				{#each socialLinks as social}
					<a
						href={social.url}
						target="_blank"
						rel="noopener noreferrer"
						class="social-link"
						aria-label={`Follow us on ${social.name}`}
						title={social.name}
					>
						<div class="social-icon">
							{@html social.icon}
						</div>
					</a>
				{/each}
			</div>
		</div>
	</div>

	<!-- Bottom bar -->
	<div class="footer-bottom">
		<div class="footer-bottom-content">
			<div class="copyright">
				<span>© {currentYear} Profullstack, Inc.</span>
				<span class="status">All systems operational</span>
			</div>
			
			<div class="badges">
				<div class="badge quantum-safe">
					<div class="badge-dot"></div>
					<span>Quantum-Safe</span>
				</div>
				
				<div class="badge nist-approved">
					<div class="badge-dot"></div>
					<span>NIST Approved</span>
				</div>
				
				{#if onionUrl && !isOnionSite}
					<a href="{onionUrl}" class="badge tor-available" title="Access via Tor Browser">
						<div class="badge-dot"></div>
						<span>🧅 Tor Available</span>
					</a>
				{:else if isOnionSite}
					<div class="badge tor-enabled">
						<div class="badge-dot"></div>
						<span>🧅 Tor Enabled</span>
					</div>
				{/if}
			</div>
		</div>
	</div>
</footer>

<style>
	.footer {
		position: relative;
		background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
		color: white;
		overflow: hidden;
		margin-top: auto;
	}

	.footer-content {
		max-width: 1200px;
		margin: 0 auto;
		padding: 3rem 1.5rem;
		display: grid;
		grid-template-columns: 1fr;
		gap: 2rem;
	}

	@media (min-width: 768px) {
		.footer-content {
			grid-template-columns: 1fr 1fr 1fr;
			gap: 3rem;
		}
	}

	/* Brand Section */
	.brand-section {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.brand-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.logo {
		width: 2.5rem;
		height: 2.5rem;
		background: linear-gradient(135deg, #6366f1, #8b5cf6, #ec4899);
		border-radius: 0.75rem;
		display: flex;
		align-items: center;
		justify-content: center;
		color: white;
	}

	.brand-text h3 {
		font-size: 1.5rem;
		font-weight: bold;
		margin: 0;
		background: linear-gradient(135deg, #ffffff, #e2e8f0);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}

	.brand-text p {
		font-size: 0.875rem;
		color: #94a3b8;
		margin: 0;
	}

	.brand-description {
		color: #cbd5e1;
		line-height: 1.6;
		max-width: 300px;
		margin: 0;
	}

	.heart {
		color: #f87171;
		animation: pulse 2s infinite;
	}

	@keyframes pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.7; }
	}

	/* Links Section */
	.links-section h4 {
		font-size: 1.125rem;
		font-weight: 600;
		color: white;
		margin: 0 0 1rem 0;
	}

	.links-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.footer-link {
		color: #94a3b8;
		text-decoration: none;
		font-weight: 500;
		transition: color 0.3s ease;
	}

	.footer-link:hover {
		color: white;
	}

	/* Social Section */
	.social-section h4 {
		font-size: 1.125rem;
		font-weight: 600;
		color: white;
		margin: 0 0 1rem 0;
	}

	.social-description {
		color: #94a3b8;
		font-size: 0.875rem;
		margin: 0 0 1.5rem 0;
	}

	.social-grid {
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		gap: 0.5rem;
	}

	.social-link {
		position: relative;
		padding: 0.625rem;
		background: rgba(30, 41, 59, 0.5);
		border: 1px solid rgba(71, 85, 105, 0.5);
		border-radius: 0.5rem;
		display: flex;
		align-items: center;
		justify-content: center;
		text-decoration: none;
		transition: all 0.3s ease;
		backdrop-filter: blur(4px);
	}

	.social-link:hover {
		transform: scale(1.05);
		border-color: rgba(99, 102, 241, 0.5);
		box-shadow: 0 10px 25px rgba(99, 102, 241, 0.2);
	}

	.social-icon {
		width: 16px;
		height: 16px;
		color: #94a3b8;
		transition: color 0.3s ease;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.social-link:hover .social-icon {
		color: white;
	}

	.social-icon :global(svg) {
		width: 100%;
		height: 100%;
	}

	/* Footer Bottom */
	.footer-bottom {
		border-top: 1px solid #334155;
	}

	.footer-bottom-content {
		max-width: 1200px;
		margin: 0 auto;
		padding: 1.5rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
	}

	@media (min-width: 768px) {
		.footer-bottom-content {
			flex-direction: row;
			justify-content: space-between;
		}
	}

	.copyright {
		display: flex;
		align-items: center;
		gap: 1rem;
		font-size: 0.875rem;
		color: #94a3b8;
	}

	.status {
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}

	.badges {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.badge {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.375rem 0.75rem;
		border-radius: 9999px;
		font-size: 0.75rem;
		font-weight: 500;
	}

	.quantum-safe {
		background: linear-gradient(135deg, rgba(34, 197, 94, 0.1), rgba(16, 185, 129, 0.1));
		border: 1px solid rgba(34, 197, 94, 0.2);
		color: #4ade80;
	}

	.nist-approved {
		background: linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(99, 102, 241, 0.1));
		border: 1px solid rgba(59, 130, 246, 0.2);
		color: #60a5fa;
	}

	.badge-dot {
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 50%;
		animation: pulse 2s infinite;
	}

	.quantum-safe .badge-dot {
		background-color: #4ade80;
	}

	.nist-approved .badge-dot {
		background-color: #60a5fa;
		animation-delay: 0.5s;
	}

	.tor-available {
		background: linear-gradient(135deg, rgba(139, 69, 19, 0.1), rgba(160, 82, 45, 0.1));
		border: 1px solid rgba(139, 69, 19, 0.2);
		color: #deb887;
		text-decoration: none;
		transition: all 0.3s ease;
	}

	.tor-available:hover {
		background: linear-gradient(135deg, rgba(139, 69, 19, 0.2), rgba(160, 82, 45, 0.2));
		border-color: rgba(139, 69, 19, 0.4);
		transform: scale(1.05);
	}

	.tor-available .badge-dot {
		background-color: #deb887;
		animation-delay: 1s;
	}

	.tor-enabled {
		background: linear-gradient(135deg, rgba(139, 69, 19, 0.1), rgba(160, 82, 45, 0.1));
		border: 1px solid rgba(139, 69, 19, 0.2);
		color: #deb887;
	}

	.tor-enabled .badge-dot {
		background-color: #deb887;
		animation-delay: 1s;
	}
</style>