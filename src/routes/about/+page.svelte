<script>
	import { t } from '$lib/stores/i18n.js';
	
	/** @type {import('./$types').PageData} */
	export let data;
	
	// Define team member roles and social links
	const teamMemberInfo = {
		profullstack: {
			role: 'Sponsoring Company',
			bio: 'Full-stack developer passionate about privacy, security, and building tools that empower users. Committed to creating a quantum-safe future for digital communication.',
			socialLinks: [
				{ type: 'github', url: 'https://github.com/profullstack' },
				{ type: 'twitter', url: 'https://x.com/profullstackinc' },
			]
		},
		chovy: {
			role: 'Co-Founder & Developer',
			bio: 'Experienced developer focused on creating secure, user-friendly applications. Passionate about privacy technology and building tools that protect user data.',
			socialLinks: [
				{ type: 'bluesky', url: 'https://bsky.app/profile/chovy.bsky.social' },
				{ type: 'nostr', url: 'https://primal.net/p/nprofile1qqsd3xe2yc2whqtzkck22l80kst9wgk25ud90lv9mc7fwg7ynwdv53c465es2' }
			]
		},
		mrpthedev: {
			role: 'Developer',
			bio: 'Talented developer contributing to QryptChat\'s mission of secure communication. Dedicated to building robust and reliable software solutions.',
			socialLinks: []
		}
	};
	
	// Get social link icon SVG
	function getSocialIcon(type) {
		const icons = {
			github: `<svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24">
				<path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
			</svg>`,
			twitter: `<svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24">
				<path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z"/>
			</svg>`,
			bluesky: `<svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24">
				<path d="M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944 1.561 1.266.902 1.565.139 1.908 0 3.08 0 3.768c0 .69.378 5.65.624 6.479.815 2.736 3.713 3.66 6.383 3.364.136-.02.275-.039.415-.056-.138.017-.275.036-.415.056-2.67-.296-5.568.628-6.383 3.364C.378 17.902 0 22.862 0 23.55c0 .688.139 1.86.902 2.203.659.299 1.664.621 4.3-1.239 2.752-1.942 5.711-5.881 6.798-7.995 1.087 2.114 4.046 6.053 6.798 7.995 2.636 1.86 3.641 1.538 4.3 1.239.763-.343.902-1.515.902-2.203 0-.688-.378-5.648-.624-6.479-.815-2.736-3.713-3.66-6.383-3.364-.14.017-.277.039-.415.056.138-.017.275-.036.415-.056 2.67.296 5.568-.628 6.383-3.364.246-.829.624-5.789.624-6.479 0-.688-.139-1.86-.902-2.203-.659-.299-1.664-.621-4.3 1.239-2.752 1.942-5.711 5.881-6.798 7.995Z"/>
			</svg>`,
			nostr: `<svg width="20" height="20" viewBox="0 0 256 256">
				<path fill="currentColor" d="M210.8 199.4c0 3.1-2.5 5.7-5.7 5.7h-68c-3.1 0-5.7-2.5-5.7-5.7v-15.5c.3-19 2.3-37.2 6.5-45.5 2.5-5 6.7-7.7 11.5-9.1 9.1-2.7 24.9-.9 31.7-1.2 0 0 20.4.8 20.4-10.7s-9.1-8.6-9.1-8.6c-10 .3-17.7-.4-22.6-2.4-8.3-3.3-8.6-9.2-8.6-11.2-.4-23.1-34.5-25.9-64.5-20.1-32.8 6.2.4 53.3.4 116.1v8.4c0 3.1-2.6 5.6-5.7 5.6H57.7c-3.1 0-5.7-2.5-5.7-5.7v-144c0-3.1 2.5-5.7 5.7-5.7h31.7c3.1 0 5.7 2.5 5.7 5.7 0 4.7 5.2 7.2 9 4.5 11.4-8.2 26-12.5 42.4-12.5 36.6 0 64.4 21.4 64.4 68.7v83.2ZM150 99.3c0-6.7-5.4-12.1-12.1-12.1s-12.1 5.4-12.1 12.1 5.4 12.1 12.1 12.1S150 106 150 99.3Z"/>
			</svg>`
		};
		return icons[type] || '';
	}
	
	// Get social link label
	function getSocialLabel(type) {
		const labels = {
			github: 'GitHub',
			twitter: 'X (Twitter)',
			bluesky: 'Bluesky',
			nostr: 'Nostr'
		};
		return labels[type] || type;
	}
</script>

<svelte:head>
	<title>About Us - QryptChat</title>
	<meta name="description" content="Learn about the team behind QryptChat and our mission to build quantum-safe messaging for everyone." />
</svelte:head>

<div class="about-page">
	<div class="container">
		<header class="page-header">
			<h1>About Us</h1>
			<p class="subtitle">Building the future of secure communication</p>
			<p class="last-updated">Meet the team behind QryptChat</p>
		</header>

		<div class="content">
			<section class="about-section">
				<h2>🚀 Our Mission</h2>
				<p>
					At QryptChat, we believe that privacy is a fundamental human right. In an era where quantum computers 
					threaten traditional encryption methods, we're building the next generation of secure messaging that 
					will remain safe even in a post-quantum world.
				</p>
				<p>
					Our mission is to make quantum-safe encryption accessible to everyone, ensuring that your private 
					conversations remain private, no matter what technological advances the future holds.
				</p>
			</section>

			<section class="about-section">
				<h2>🛡️ What Makes Us Different</h2>
				<ul>
					<li><strong>Post-Quantum Security:</strong> We use NIST-approved quantum-resistant algorithms</li>
					<li><strong>Zero-Knowledge Architecture:</strong> We can't read your messages, even if we wanted to</li>
					<li><strong>Open Source:</strong> Our code is transparent and auditable by security experts</li>
					<li><strong>Privacy First:</strong> No ads, no tracking, no data mining</li>
					<li><strong>Future-Proof:</strong> Built to withstand the quantum computing revolution</li>
				</ul>
			</section>

			<section class="about-section team-section">
				<h2>👥 Meet the Team</h2>
				<p>QryptChat is built by a passionate team of developers, cryptographers, and privacy advocates.</p>
				
				<div class="team-grid">
					{#each data.teamMembers as member}
						{@const memberInfo = teamMemberInfo[member.username]}
						<div class="team-member">
							<div class="member-avatar">
								{#if member.avatarUrl}
									<img src={member.avatarUrl} alt={member.displayName || member.username} class="avatar-image" />
								{:else}
									<div class="avatar-placeholder">
										{(member.displayName || member.username).charAt(0).toUpperCase()}
									</div>
								{/if}
							</div>
							<div class="member-info">
								<h3>{member.displayName || member.username}</h3>
								<p class="member-role">{memberInfo?.role || 'Team Member'}</p>
								<p class="member-bio">
									{member.bio || memberInfo?.bio || 'Contributing to QryptChat\'s mission of secure communication.'}
								</p>
								<div class="member-links">
									<!-- Profile link -->
									<a href="/u/{member.username}" class="social-link profile">
										<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
											<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
											<circle cx="12" cy="7" r="4"/>
										</svg>
										View Profile
									</a>
									
									<!-- Social links -->
									{#each (memberInfo?.socialLinks || []) as socialLink}
										<a href={socialLink.url} target="_blank" rel="noopener noreferrer" class="social-link {socialLink.type}">
											{@html getSocialIcon(socialLink.type)}
											{getSocialLabel(socialLink.type)}
										</a>
									{/each}
									
									<!-- Website link if available -->
									{#if member.website}
										<a href={member.website} target="_blank" rel="noopener noreferrer" class="social-link website">
											<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
												<circle cx="12" cy="12" r="10"/>
												<line x1="2" y1="12" x2="22" y2="12"/>
												<path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
											</svg>
											Website
										</a>
									{/if}
								</div>
							</div>
						</div>
					{/each}
				</div>
			</section>

			<section class="about-section">
				<h2>🌟 Join Our Community</h2>
				<p>
					QryptChat is more than just a messaging app - it's a community of privacy-conscious individuals 
					who believe in the importance of secure communication. Join us on our journey to build a more 
					private and secure digital world.
				</p>
				<div class="community-links">
					<a href="https://discord.gg/w5nHdzpQ29" target="_blank" rel="noopener noreferrer" class="community-link discord">
						<svg width="24" height="24" fill="currentColor" viewBox="0 0 24 24">
							<path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z"/>
						</svg>
						Join our Discord
					</a>
					<a href="https://github.com/profullstack" target="_blank" rel="noopener noreferrer" class="community-link github">
						<svg width="24" height="24" fill="currentColor" viewBox="0 0 24 24">
							<path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
						</svg>
						Contribute on GitHub
					</a>
				</div>
			</section>

			<section class="about-section">
				<h2>📧 Get in Touch</h2>
				<p>Have questions, suggestions, or want to collaborate? We'd love to hear from you!</p>
				<ul>
					<li>Email: <a href="mailto:hello@qrypt.chat">hello@qrypt.chat</a></li>
					<li>Support: <a href="mailto:support@qrypt.chat">support@qrypt.chat</a></li>
					<li>Security: <a href="mailto:security@qrypt.chat">security@qrypt.chat</a></li>
				</ul>
			</section>
		</div>
	</div>
</div>

<style>
	.about-page {
		min-height: 100vh;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		padding: 2rem 0;
	}

	.container {
		max-width: 900px;
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
		margin: 0 0 0.5rem 0;
	}

	.last-updated {
		font-size: 0.875rem;
		opacity: 0.8;
		margin: 0;
	}

	.content {
		display: grid;
		gap: 2rem;
	}

	.about-section {
		background: rgba(255, 255, 255, 0.95);
		border-radius: 1rem;
		padding: 2rem;
		box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
		backdrop-filter: blur(10px);
	}

	.about-section h2 {
		font-size: 1.5rem;
		font-weight: 600;
		margin: 0 0 1rem 0;
		color: #1e293b;
	}

	.about-section p {
		color: #475569;
		line-height: 1.6;
		margin: 0 0 1rem 0;
	}

	.about-section p:last-child {
		margin-bottom: 0;
	}

	.about-section ul {
		color: #475569;
		line-height: 1.6;
		margin: 0 0 1rem 0;
		padding-left: 1.5rem;
	}

	.about-section ul:last-child {
		margin-bottom: 0;
	}

	.about-section li {
		margin-bottom: 0.5rem;
	}

	.about-section strong {
		color: #1e293b;
		font-weight: 600;
	}

	.about-section a {
		color: #6366f1;
		text-decoration: none;
		font-weight: 500;
	}

	.about-section a:hover {
		text-decoration: underline;
	}

	/* Team Section */
	.team-section {
		background: linear-gradient(135deg, rgba(255, 255, 255, 0.98), rgba(248, 250, 252, 0.95));
	}

	.team-grid {
		display: grid;
		gap: 2rem;
		margin-top: 1.5rem;
	}

	.team-member {
		display: flex;
		gap: 1.5rem;
		align-items: flex-start;
	}

	.member-avatar {
		flex-shrink: 0;
	}

	.avatar-placeholder {
		width: 80px;
		height: 80px;
		background: linear-gradient(135deg, #6366f1, #8b5cf6);
		color: white;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 2rem;
		font-weight: bold;
		box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
	}

	.avatar-image {
		width: 80px;
		height: 80px;
		border-radius: 50%;
		object-fit: cover;
		box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
	}

	.member-info h3 {
		font-size: 1.25rem;
		font-weight: 600;
		color: #1e293b;
		margin: 0 0 0.25rem 0;
	}

	.member-role {
		font-size: 0.875rem;
		color: #6366f1;
		font-weight: 500;
		margin: 0 0 0.75rem 0;
	}

	.member-bio {
		font-size: 0.875rem;
		color: #64748b;
		line-height: 1.5;
		margin: 0 0 1rem 0;
	}

	.member-links {
		display: flex;
		gap: 0.75rem;
		flex-wrap: wrap;
	}

	.social-link {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		background: rgba(99, 102, 241, 0.1);
		color: #6366f1;
		text-decoration: none;
		border-radius: 0.5rem;
		font-size: 0.875rem;
		font-weight: 500;
		transition: all 0.2s ease;
		border: 1px solid rgba(99, 102, 241, 0.2);
	}

	.social-link:hover {
		background: #6366f1;
		color: white;
		transform: translateY(-1px);
		box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
	}

	.social-link.github {
		background: rgba(36, 41, 47, 0.1);
		color: #24292f;
		border-color: rgba(36, 41, 47, 0.2);
	}

	.social-link.github:hover {
		background: #24292f;
		color: white;
	}

	.social-link.twitter {
		background: rgba(29, 155, 240, 0.1);
		color: #1d9bf0;
		border-color: rgba(29, 155, 240, 0.2);
	}

	.social-link.twitter:hover {
		background: #1d9bf0;
		color: white;
	}

	.social-link.bluesky {
		background: rgba(0, 133, 255, 0.1);
		color: #0085ff;
		border-color: rgba(0, 133, 255, 0.2);
	}

	.social-link.bluesky:hover {
		background: #0085ff;
		color: white;
	}

	.social-link.nostr {
		background: rgba(139, 69, 19, 0.1);
		color: #8b4513;
		border-color: rgba(139, 69, 19, 0.2);
	}

	.social-link.nostr:hover {
		background: #8b4513;
		color: white;
	}

	.social-link.profile {
		background: rgba(99, 102, 241, 0.1);
		color: #6366f1;
		border-color: rgba(99, 102, 241, 0.2);
	}

	.social-link.profile:hover {
		background: #6366f1;
		color: white;
	}

	.social-link.website {
		background: rgba(34, 197, 94, 0.1);
		color: #22c55e;
		border-color: rgba(34, 197, 94, 0.2);
	}

	.social-link.website:hover {
		background: #22c55e;
		color: white;
	}

	/* Community Links */
	.community-links {
		display: flex;
		gap: 1rem;
		margin-top: 1.5rem;
		flex-wrap: wrap;
	}

	.community-link {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem 1.5rem;
		background: linear-gradient(135deg, #6366f1, #8b5cf6);
		color: #ffffff;
		text-decoration: none;
		border-radius: 0.75rem;
		font-weight: 600;
		font-size: 0.95rem;
		transition: all 0.3s ease;
		box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
		text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
	}

	.community-link:hover {
		transform: translateY(-2px);
		box-shadow: 0 8px 20px rgba(99, 102, 241, 0.4);
		color: #ffffff;
	}

	.community-link.discord {
		background: linear-gradient(135deg, #5865f2, #7289da);
		color: #ffffff;
		text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
	}

	.community-link.discord:hover {
		color: #ffffff;
	}

	.community-link.github {
		background: linear-gradient(135deg, #24292f, #4a5568);
		color: #ffffff;
		text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
	}

	.community-link.github:hover {
		color: #ffffff;
	}

	@media (max-width: 768px) {
		.page-header h1 {
			font-size: 2rem;
		}

		.about-section {
			padding: 1.5rem;
		}

		.team-member {
			flex-direction: column;
			text-align: center;
		}

		.member-links {
			justify-content: center;
		}

		.community-links {
			flex-direction: column;
		}

		.community-link {
			justify-content: center;
		}
	}

	@media (max-width: 480px) {
		.member-links {
			flex-direction: column;
		}

		.social-link {
			justify-content: center;
		}
	}
</style>