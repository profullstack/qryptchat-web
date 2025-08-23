<script>
	import { t } from '$lib/stores/i18n.js';
</script>

<svelte:head>
	<title>Security - QryptChat</title>
	<meta name="description" content="Learn about QryptChat's quantum-safe security measures and encryption protocols." />
</svelte:head>

<div class="security-page">
	<div class="container">
		<header class="page-header">
			<h1>Security</h1>
			<p class="subtitle">Quantum-safe encryption for the future</p>
		</header>

		<div class="content">
			<section class="security-section">
				<h2>🔒 Post-Quantum Cryptography</h2>
				<p>QryptChat uses NIST-approved post-quantum cryptographic algorithms to protect your messages against both classical and quantum computer attacks.</p>
				<ul>
					<li>CRYSTALS-Kyber for key encapsulation</li>
					<li>CRYSTALS-Dilithium for digital signatures</li>
					<li>SPHINCS+ for hash-based signatures</li>
				</ul>
			</section>

			<section class="security-section">
				<h2>🛡️ End-to-End Encryption</h2>
				<p>All messages are encrypted on your device before transmission and can only be decrypted by the intended recipient.</p>
				<ul>
					<li>Zero-knowledge architecture</li>
					<li>Perfect forward secrecy</li>
					<li>No server-side message storage</li>
				</ul>
			</section>

			<section class="security-section">
				<h2>🔐 Authentication</h2>
				<p>Secure phone number-based authentication with SMS verification ensures only you can access your account.</p>
				<ul>
					<li>Multi-factor authentication</li>
					<li>Device verification</li>
					<li>Session management</li>
				</ul>
			</section>

			<section class="security-section">
				<h2>🏆 Security Audits</h2>
				<p>QryptChat undergoes regular security audits by independent third-party security firms to ensure the highest level of protection.</p>
				<ul>
					<li>Annual penetration testing</li>
					<li>Code security reviews</li>
					<li>Vulnerability disclosure program</li>
				</ul>
			</section>
		</div>
	</div>
</div>

<style>
	.security-page {
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
		margin: 0;
	}

	.content {
		display: grid;
		gap: 2rem;
	}

	.security-section {
		background: rgba(255, 255, 255, 0.95);
		border-radius: 1rem;
		padding: 2rem;
		box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
		backdrop-filter: blur(10px);
	}

	.security-section h2 {
		font-size: 1.5rem;
		font-weight: 600;
		margin: 0 0 1rem 0;
		color: #1e293b;
	}

	.security-section p {
		color: #475569;
		line-height: 1.6;
		margin: 0 0 1rem 0;
	}

	.security-section ul {
		color: #475569;
		line-height: 1.6;
		margin: 0;
		padding-left: 1.5rem;
	}

	.security-section li {
		margin-bottom: 0.5rem;
	}

	@media (max-width: 768px) {
		.page-header h1 {
			font-size: 2rem;
		}

		.security-section {
			padding: 1.5rem;
		}
	}
</style>