<script>
	import { t } from '$lib/stores/i18n.js';
</script>

<svelte:head>
	<title>Privacy Policy - QryptChat</title>
	<meta name="description" content="QryptChat's privacy policy - learn how we protect your data and respect your privacy." />
</svelte:head>

<div class="privacy-page">
	<div class="container">
		<header class="page-header">
			<h1>Privacy Policy</h1>
			<p class="subtitle">Your privacy is our priority</p>
			<p class="last-updated">Last updated: January 2025</p>
		</header>

		<div class="content">
			<section class="privacy-section">
				<h2>🔒 Data Collection</h2>
				<p>QryptChat follows a zero-knowledge architecture. We collect minimal data necessary for service operation:</p>
				<ul>
					<li><strong>Phone Number:</strong> Used for authentication and account verification</li>
					<li><strong>Device Information:</strong> Basic device metadata for security purposes</li>
					<li><strong>Usage Analytics:</strong> Anonymous usage statistics to improve our service</li>
				</ul>
				<p><strong>We do NOT collect:</strong> Message content, contact lists, or personal conversations.</p>
			</section>

			<section class="privacy-section">
				<h2>🛡️ Data Protection</h2>
				<p>Your data is protected using industry-leading security measures:</p>
				<ul>
					<li>End-to-end encryption for all messages</li>
					<li>Post-quantum cryptographic algorithms</li>
					<li>No server-side message storage</li>
					<li>Regular security audits and penetration testing</li>
				</ul>
			</section>

			<section class="privacy-section">
				<h2>📱 Message Privacy</h2>
				<p>Your messages are completely private:</p>
				<ul>
					<li>Messages are encrypted on your device before transmission</li>
					<li>Only you and the recipient can decrypt messages</li>
					<li>Messages are automatically deleted from our servers after delivery</li>
					<li>Perfect forward secrecy ensures past messages remain secure</li>
				</ul>
			</section>

			<section class="privacy-section">
				<h2>🍪 Cookies and Tracking</h2>
				<p>We use minimal cookies and tracking:</p>
				<ul>
					<li>Essential cookies for authentication and session management</li>
					<li>No third-party advertising cookies</li>
					<li>No cross-site tracking</li>
					<li>Anonymous analytics to improve user experience</li>
				</ul>
			</section>

			<section class="privacy-section">
				<h2>🌍 Data Sharing</h2>
				<p>We do not sell, rent, or share your personal data with third parties, except:</p>
				<ul>
					<li>When required by law or legal process</li>
					<li>To protect our rights, property, or safety</li>
					<li>With your explicit consent</li>
				</ul>
			</section>

			<section class="privacy-section">
				<h2>⚖️ Your Rights</h2>
				<p>You have the right to:</p>
				<ul>
					<li>Access your personal data</li>
					<li>Correct inaccurate information</li>
					<li>Delete your account and associated data</li>
					<li>Export your data</li>
					<li>Opt-out of non-essential communications</li>
				</ul>
			</section>

			<section class="privacy-section">
				<h2>📧 Contact Us</h2>
				<p>If you have questions about this Privacy Policy, please contact us:</p>
				<ul>
					<li>Email: privacy@qrypt.chat</li>
					<li>Address: Profullstack, Inc.</li>
				</ul>
			</section>
		</div>
	</div>
</div>

<style>
	.privacy-page {
		min-height: 100vh;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		padding: 2rem 0;
	}

	.container {
		max-width: 800px;
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

	.privacy-section {
		background: rgba(255, 255, 255, 0.95);
		border-radius: 1rem;
		padding: 2rem;
		box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
		backdrop-filter: blur(10px);
	}

	.privacy-section h2 {
		font-size: 1.5rem;
		font-weight: 600;
		margin: 0 0 1rem 0;
		color: #1e293b;
	}

	.privacy-section p {
		color: #475569;
		line-height: 1.6;
		margin: 0 0 1rem 0;
	}

	.privacy-section p:last-child {
		margin-bottom: 0;
	}

	.privacy-section ul {
		color: #475569;
		line-height: 1.6;
		margin: 0 0 1rem 0;
		padding-left: 1.5rem;
	}

	.privacy-section ul:last-child {
		margin-bottom: 0;
	}

	.privacy-section li {
		margin-bottom: 0.5rem;
	}

	.privacy-section strong {
		color: #1e293b;
		font-weight: 600;
	}

	@media (max-width: 768px) {
		.page-header h1 {
			font-size: 2rem;
		}

		.privacy-section {
			padding: 1.5rem;
		}
	}
</style>