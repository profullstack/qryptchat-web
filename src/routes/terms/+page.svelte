<script>
	import { t } from '$lib/stores/i18n.js';
</script>

<svelte:head>
	<title>Terms of Service - QryptChat</title>
	<meta name="description" content="QryptChat's terms of service - understand your rights and responsibilities when using our platform." />
</svelte:head>

<div class="terms-page">
	<div class="container">
		<header class="page-header">
			<h1>Terms of Service</h1>
			<p class="subtitle">Agreement for using QryptChat</p>
			<p class="last-updated">Last updated: January 2025</p>
		</header>

		<div class="content">
			<section class="terms-section">
				<h2>📋 Acceptance of Terms</h2>
				<p>By accessing and using QryptChat, you accept and agree to be bound by the terms and provision of this agreement. If you do not agree to abide by the above, please do not use this service.</p>
			</section>

			<section class="terms-section">
				<h2>📱 Service Description</h2>
				<p>QryptChat is a quantum-safe messaging platform that provides:</p>
				<ul>
					<li>End-to-end encrypted messaging</li>
					<li>Post-quantum cryptographic protection</li>
					<li>Phone number-based authentication</li>
					<li>Real-time message delivery</li>
					<li>Multi-language support</li>
				</ul>
			</section>

			<section class="terms-section">
				<h2>👤 User Accounts</h2>
				<p>To use QryptChat, you must:</p>
				<ul>
					<li>Be at least 13 years of age</li>
					<li>Provide a valid phone number for verification</li>
					<li>Maintain the security of your account</li>
					<li>Not share your account with others</li>
					<li>Notify us immediately of any unauthorized use</li>
				</ul>
			</section>

			<section class="terms-section">
				<h2>✅ Acceptable Use</h2>
				<p>You agree to use QryptChat only for lawful purposes. You may not:</p>
				<ul>
					<li>Send spam, harassment, or abusive messages</li>
					<li>Share illegal, harmful, or offensive content</li>
					<li>Attempt to hack, reverse engineer, or compromise the service</li>
					<li>Impersonate others or create fake accounts</li>
					<li>Violate any applicable laws or regulations</li>
				</ul>
			</section>

			<section class="terms-section">
				<h2>🔒 Privacy and Security</h2>
				<p>We are committed to protecting your privacy:</p>
				<ul>
					<li>Messages are end-to-end encrypted</li>
					<li>We cannot read your messages</li>
					<li>Messages are not stored on our servers after delivery</li>
					<li>Your data is protected by post-quantum cryptography</li>
				</ul>
				<p>Please review our <a href="/privacy">Privacy Policy</a> for detailed information.</p>
			</section>

			<section class="terms-section">
				<h2>🚫 Service Availability</h2>
				<p>We strive to provide reliable service, but:</p>
				<ul>
					<li>Service may be temporarily unavailable for maintenance</li>
					<li>We do not guarantee 100% uptime</li>
					<li>Features may be added, modified, or removed</li>
					<li>We may suspend accounts that violate these terms</li>
				</ul>
			</section>

			<section class="terms-section">
				<h2>⚖️ Limitation of Liability</h2>
				<p>QryptChat and Profullstack, Inc. shall not be liable for:</p>
				<ul>
					<li>Any indirect, incidental, or consequential damages</li>
					<li>Loss of data, profits, or business opportunities</li>
					<li>Service interruptions or technical issues</li>
					<li>Actions of other users on the platform</li>
				</ul>
			</section>

			<section class="terms-section">
				<h2>🔄 Changes to Terms</h2>
				<p>We reserve the right to modify these terms at any time. Changes will be effective immediately upon posting. Continued use of the service constitutes acceptance of the modified terms.</p>
			</section>

			<section class="terms-section">
				<h2>🏛️ Governing Law</h2>
				<p>These terms shall be governed by and construed in accordance with the laws of the jurisdiction where Profullstack, Inc. is incorporated, without regard to conflict of law principles.</p>
			</section>

			<section class="terms-section">
				<h2>📧 Contact Information</h2>
				<p>If you have questions about these Terms of Service, please contact us:</p>
				<ul>
					<li>Email: legal@qrypt.chat</li>
					<li>Company: Profullstack, Inc.</li>
				</ul>
			</section>
		</div>
	</div>
</div>

<style>
	.terms-page {
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

	.terms-section {
		background: rgba(255, 255, 255, 0.95);
		border-radius: 1rem;
		padding: 2rem;
		box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
		backdrop-filter: blur(10px);
	}

	.terms-section h2 {
		font-size: 1.5rem;
		font-weight: 600;
		margin: 0 0 1rem 0;
		color: #1e293b;
	}

	.terms-section p {
		color: #475569;
		line-height: 1.6;
		margin: 0 0 1rem 0;
	}

	.terms-section p:last-child {
		margin-bottom: 0;
	}

	.terms-section ul {
		color: #475569;
		line-height: 1.6;
		margin: 0 0 1rem 0;
		padding-left: 1.5rem;
	}

	.terms-section ul:last-child {
		margin-bottom: 0;
	}

	.terms-section li {
		margin-bottom: 0.5rem;
	}

	.terms-section a {
		color: #6366f1;
		text-decoration: none;
		font-weight: 500;
	}

	.terms-section a:hover {
		text-decoration: underline;
	}

	@media (max-width: 768px) {
		.page-header h1 {
			font-size: 2rem;
		}

		.terms-section {
			padding: 1.5rem;
		}
	}
</style>