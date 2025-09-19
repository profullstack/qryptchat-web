<script>
	import EncryptionTester from '$lib/components/settings/EncryptionTester.svelte';
</script>

<div class="container">
	<h1>QryptChat Encryption Test</h1>
	<p class="description">
		This page allows you to test the ML-KEM-1024 post-quantum encryption used in QryptChat.
		You can encrypt a message, decrypt it, and verify that the decryption works correctly.
	</p>
	
	<EncryptionTester />
	
	<div class="info-panel">
		<h2>About ML-KEM-1024 Encryption</h2>
		<p>
			QryptChat uses ML-KEM-1024 (formerly known as Kyber1024) for post-quantum key encapsulation
			combined with ChaCha20-Poly1305 for symmetric encryption. This provides the highest level
			of security (NIST Level 5) against both classical and quantum computer attacks.
		</p>
		<p>
			If you experience issues with message decryption, please check that:
		</p>
		<ul>
			<li>Both users have generated ML-KEM-1024 keys</li>
			<li>The public keys are properly exchanged</li>
			<li>The message format is correct</li>
		</ul>
		<p>
			For optimal encryption compatibility, QryptChat always uses ML-KEM-1024 for new messages
			regardless of the recipient's key format.
		</p>
	</div>
</div>

<style>
	.container {
		max-width: 900px;
		margin: 0 auto;
		padding: 2rem 1rem;
	}
	
	h1 {
		font-size: 2rem;
		margin-bottom: 1rem;
	}
	
	.description {
		margin-bottom: 2rem;
		color: var(--text-secondary);
		font-size: 1.1rem;
		line-height: 1.5;
	}
	
	.info-panel {
		margin-top: 3rem;
		padding: 1.5rem;
		background: var(--bg-secondary);
		border: 1px solid var(--border-primary);
		border-radius: 8px;
	}
	
	.info-panel h2 {
		margin-top: 0;
		font-size: 1.4rem;
	}
	
	.info-panel p {
		line-height: 1.5;
	}
	
	.info-panel ul {
		margin: 1rem 0;
		padding-left: 1.5rem;
	}
	
	.info-panel li {
		margin-bottom: 0.5rem;
	}
</style>