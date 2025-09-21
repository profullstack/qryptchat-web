<script>
	import { createEventDispatcher } from 'svelte';
	import { postQuantumEncryption } from '$lib/crypto/post-quantum-encryption.js';
	import { publicKeyService } from '$lib/crypto/public-key-service.js';
	
	const dispatch = createEventDispatcher();
	
	let { user } = $props();
	
	let loading = $state(false);
	let error = $state('');
	let success = $state('');
	let keyStatus = $state('checking');
	let hasEncryptionKeys = $state(false);
	let userPublicKey = $state('');
	let publicKeyCopied = $state(false);
	let syncingPublicKey = $state(false);
	let publicKeyInDatabase = $state(false);
	
	// Check if user has encryption keys on component mount
	$effect(() => {
		if (user) {
			checkEncryptionStatus();
		}
	});
	
	async function checkEncryptionStatus() {
		try {
			keyStatus = 'checking';
			await postQuantumEncryption.initialize();
			await publicKeyService.initialize();
			
			// Check if user has post-quantum encryption keys stored
			const userKeys = await postQuantumEncryption.getUserKeys();
			hasEncryptionKeys = !!(userKeys && userKeys.publicKey && userKeys.privateKey);
			keyStatus = hasEncryptionKeys ? 'enabled' : 'disabled';
			
			// Store the public key for display
			if (hasEncryptionKeys && userKeys.publicKey) {
				userPublicKey = userKeys.publicKey;
				
				// Check if public key is in database
				if (user?.id) {
					console.log('🔑 Checking if public key exists in database for user:', user.id);
					const dbPublicKey = await publicKeyService.getUserPublicKey(user.id);
					publicKeyInDatabase = !!dbPublicKey;
					
					console.log('🔑 Database public key check result:', {
						hasLocalKey: !!userKeys.publicKey,
						hasDbKey: !!dbPublicKey,
						publicKeyInDatabase
					});
					
					if (!publicKeyInDatabase) {
						console.log('🔑 ⚠️ Public key exists locally but not in database - sync needed');
					}
				} else {
					console.log('🔑 No user ID available for database check');
					publicKeyInDatabase = false; // Force sync button to show if no user ID
				}
			}
			
		} catch (err) {
			console.error('Failed to check post-quantum encryption status:', err);
			keyStatus = 'error';
			error = 'Failed to check encryption status';
		}
	}
	
	async function generateEncryptionKeys() {
		try {
			loading = true;
			error = '';
			success = '';
			
			// Initialize post-quantum encryption services
			await postQuantumEncryption.initialize();
			await publicKeyService.initialize();
			
			// Generate user's post-quantum encryption keys
			await postQuantumEncryption.getUserKeys(); // This will generate keys if they don't exist
			
			// Initialize user encryption (uploads public key to database)
			await publicKeyService.initializeUserEncryption();
			
			// Load the generated public key for display
			const userKeys = await postQuantumEncryption.getUserKeys();
			if (userKeys && userKeys.publicKey) {
				userPublicKey = userKeys.publicKey;
			}
			
			hasEncryptionKeys = true;
			keyStatus = 'enabled';
			success = 'Post-quantum encryption keys generated successfully! Your messages are now quantum-resistant end-to-end encrypted.';
			
			dispatch('updated', { encryptionEnabled: true });
			
		} catch (err) {
			console.error('Failed to generate post-quantum encryption keys:', err);
			error = (err instanceof Error ? err.message : String(err)) || 'Failed to generate encryption keys';
		} finally {
			loading = false;
		}
	}
	
	async function regenerateKeys() {
		if (!confirm('Are you sure you want to regenerate your post-quantum encryption keys? This will make old encrypted messages unreadable.')) {
			return;
		}
		
		try {
			loading = true;
			error = '';
			success = '';
			
			// Clear existing post-quantum keys and generate new ones
			await postQuantumEncryption.clearUserKeys();
			await postQuantumEncryption.getUserKeys(); // This will generate new keys
			
			// Re-initialize user encryption (uploads new public key to database)
			await publicKeyService.initializeUserEncryption();
			
			// Load the new public key for display
			const userKeys = await postQuantumEncryption.getUserKeys();
			if (userKeys && userKeys.publicKey) {
				userPublicKey = userKeys.publicKey;
			}
			
			success = 'Post-quantum encryption keys regenerated successfully! Note: Previous encrypted messages may no longer be readable.';
			
			dispatch('updated', { encryptionEnabled: true, keysRegenerated: true });
			
		} catch (err) {
			console.error('Failed to regenerate post-quantum encryption keys:', err);
			error = (err instanceof Error ? err.message : String(err)) || 'Failed to regenerate encryption keys';
		} finally {
			loading = false;
		}
	}
	
	async function copyPublicKey() {
		try {
			await navigator.clipboard.writeText(userPublicKey);
			publicKeyCopied = true;
			setTimeout(() => {
				publicKeyCopied = false;
			}, 2000);
		} catch (err) {
			console.error('Failed to copy public key:', err);
			error = 'Failed to copy public key to clipboard';
		}
	}
	
	async function syncPublicKey() {
		try {
			syncingPublicKey = true;
			error = '';
			success = '';
			
			// Upload public key to database
			const uploaded = await publicKeyService.uploadMyPublicKey();
			
			if (uploaded) {
				publicKeyInDatabase = true;
				success = 'Public key synced to database successfully! You can now send and receive encrypted messages.';
			} else {
				error = 'Failed to sync public key to database. Please try again.';
			}
			
		} catch (err) {
			console.error('Failed to sync public key:', err);
			error = (err instanceof Error ? err.message : String(err)) || 'Failed to sync public key';
		} finally {
			syncingPublicKey = false;
		}
	}
</script>

<div class="encryption-settings">
	<div class="section-header">
		<h3>🔐 End-to-End Encryption</h3>
		<p>Secure your messages with quantum-resistant encryption</p>
	</div>
	
	<div class="encryption-status">
		{#if keyStatus === 'checking'}
			<div class="status-item checking">
				<div class="status-icon">
					<div class="spinner"></div>
				</div>
				<div class="status-content">
					<h4>Checking encryption status...</h4>
					<p>Please wait while we verify your encryption keys.</p>
				</div>
			</div>
		{:else if keyStatus === 'enabled'}
			<div class="status-item enabled">
				<div class="status-icon">✅</div>
				<div class="status-content">
					<h4>Encryption Enabled</h4>
					<p>Your messages are protected with quantum-resistant end-to-end encryption.</p>
				</div>
			</div>
		{:else if keyStatus === 'disabled'}
			<div class="status-item disabled">
				<div class="status-icon">⚠️</div>
				<div class="status-content">
					<h4>Encryption Not Set Up</h4>
					<p>Generate encryption keys to secure your messages with end-to-end encryption.</p>
				</div>
			</div>
		{:else if keyStatus === 'error'}
			<div class="status-item error">
				<div class="status-icon">❌</div>
				<div class="status-content">
					<h4>Encryption Status Unknown</h4>
					<p>Unable to check encryption status. Please try refreshing the page.</p>
				</div>
			</div>
		{/if}
	</div>
	
	{#if error}
		<div class="alert error">
			<strong>Error:</strong> {error}
		</div>
	{/if}
	
	{#if success}
		<div class="alert success">
			<strong>Success:</strong> {success}
		</div>
	{/if}
	
	<div class="encryption-actions">
		{#if !hasEncryptionKeys && keyStatus !== 'checking'}
			<button 
				class="btn primary"
				onclick={generateEncryptionKeys}
				disabled={loading}
			>
				{#if loading}
					<div class="btn-spinner"></div>
					Generating Keys...
				{:else}
					🔑 Generate Encryption Keys
				{/if}
			</button>
			<p class="help-text">
				This will generate quantum-resistant encryption keys stored securely in your browser. 
				Your keys never leave your device.
			</p>
		{:else if hasEncryptionKeys}
			<button 
				class="btn secondary"
				onclick={regenerateKeys}
				disabled={loading}
			>
				{#if loading}
					<div class="btn-spinner"></div>
					Regenerating...
				{:else}
					🔄 Regenerate Keys
				{/if}
			</button>
			<p class="help-text">
				⚠️ Warning: Regenerating keys will make previously encrypted messages unreadable.
			</p>
		{/if}
	</div>
	
	{#if hasEncryptionKeys && userPublicKey}
		<div class="public-key-section">
			<h4>📬 Your Public Key (Safe to Share)</h4>
			<p class="key-explanation">
				This is your "public address" that others can see. Think of it like your home address -
				everyone can know it, but only you have the private key (like your house key) to unlock messages sent to you.
			</p>
			
			<div class="key-display">
				<div class="key-content">
					<code class="public-key">{userPublicKey}</code>
				</div>
				<button
					class="btn copy-btn"
					onclick={copyPublicKey}
					title="Copy public key to clipboard"
				>
					{#if publicKeyCopied}
						✅ Copied!
					{:else}
						📋 Copy
					{/if}
				</button>
			</div>
			
			<div class="key-info">
				<p><strong>🔑 How Your Keys Work:</strong></p>
				<ul>
					<li><strong>Public Key:</strong> Like your mailbox address - everyone can see it and send you encrypted mail</li>
					<li><strong>Private Key:</strong> Like your house key - stays hidden in your browser and only you can use it to read your mail</li>
					<li><strong>Quantum-Safe:</strong> Uses ML-KEM-1024 algorithm that even quantum computers can't break</li>
				</ul>
			</div>
		</div>
	{/if}
	
	<div class="encryption-info">
		<h4>About End-to-End Encryption</h4>
		<ul>
			<li><strong>Quantum-Resistant:</strong> Uses ML-KEM-1024 + ChaCha20-Poly1305 encryption that's secure against quantum computers</li>
			<li><strong>Client-Side:</strong> All encryption happens in your browser - the server never sees your messages</li>
			<li><strong>Post-Quantum KEM:</strong> Uses FIPS 203 ML-KEM-1024 for quantum-resistant key exchange</li>
			<li><strong>Forward Secrecy:</strong> Public keys are automatically shared securely between participants</li>
		</ul>
	</div>
</div>

<style>
	.encryption-settings {
		padding: 1.5rem;
	}
	
	.section-header {
		margin-bottom: 1.5rem;
	}
	
	.section-header h3 {
		margin: 0 0 0.5rem 0;
		font-size: 1.25rem;
		font-weight: 600;
		color: var(--color-text-primary);
	}
	
	.section-header p {
		margin: 0;
		color: var(--color-text-secondary);
		font-size: 0.875rem;
	}
	
	.encryption-status {
		margin-bottom: 1.5rem;
	}
	
	.status-item {
		display: flex;
		align-items: flex-start;
		gap: 1rem;
		padding: 1rem;
		border-radius: 0.5rem;
		border: 1px solid;
	}
	
	.status-item.checking {
		background: var(--color-bg-secondary);
		border-color: var(--color-info);
	}
	
	.status-item.enabled {
		background: var(--color-bg-secondary);
		border-color: var(--color-success);
	}
	
	.status-item.disabled {
		background: var(--color-bg-secondary);
		border-color: var(--color-warning);
	}
	
	.status-item.error {
		background: var(--color-bg-secondary);
		border-color: var(--color-error);
	}
	
	.status-icon {
		font-size: 1.25rem;
		flex-shrink: 0;
	}
	
	.status-content h4 {
		margin: 0 0 0.25rem 0;
		font-size: 1rem;
		font-weight: 600;
		color: var(--color-text-primary);
	}
	
	.status-content p {
		margin: 0;
		font-size: 0.875rem;
		color: var(--color-text-secondary);
	}
	
	.spinner {
		width: 1.25rem;
		height: 1.25rem;
		border: 2px solid var(--color-border-primary);
		border-top: 2px solid var(--color-info);
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}
	
	@keyframes spin {
		to { transform: rotate(360deg); }
	}
	
	.alert {
		padding: 0.75rem 1rem;
		border-radius: 0.375rem;
		margin-bottom: 1rem;
		font-size: 0.875rem;
	}
	
	.alert.error {
		background: var(--color-bg-secondary);
		color: var(--color-error);
		border: 1px solid var(--color-border-primary);
	}
	
	.alert.success {
		background: var(--color-bg-secondary);
		color: var(--color-success);
		border: 1px solid var(--color-border-primary);
	}
	
	.encryption-actions {
		margin-bottom: 2rem;
	}
	
	.btn {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem 1.5rem;
		border: none;
		border-radius: 0.375rem;
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s ease;
		text-decoration: none;
	}
	
	.btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
	
	.btn.primary {
		background: var(--color-primary-500);
		color: white;
	}
	
	.btn.primary:hover:not(:disabled) {
		background: var(--color-primary-600);
	}
	
	.btn.secondary {
		background: var(--color-surface);
		color: var(--color-text-primary);
		border: 1px solid var(--color-border);
	}
	
	.btn.secondary:hover:not(:disabled) {
		background: var(--color-surface-hover);
	}
	
	.btn-spinner {
		width: 1rem;
		height: 1rem;
		border: 2px solid transparent;
		border-top: 2px solid currentColor;
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}
	
	.help-text {
		margin: 0.75rem 0 0 0;
		font-size: 0.8125rem;
		color: var(--color-text-secondary);
		line-height: 1.4;
	}
	
	.encryption-info {
		padding: 1rem;
		background: var(--color-surface);
		border-radius: 0.5rem;
		border: 1px solid var(--color-border);
	}
	
	.encryption-info h4 {
		margin: 0 0 0.75rem 0;
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--color-text-primary);
	}
	
	.encryption-info ul {
		margin: 0;
		padding-left: 1.25rem;
		font-size: 0.8125rem;
		color: var(--color-text-secondary);
		line-height: 1.5;
	}
	
	.encryption-info li {
		margin-bottom: 0.5rem;
	}
	
	.encryption-info li:last-child {
		margin-bottom: 0;
	}
	
	.public-key-section {
		margin-bottom: 2rem;
		padding: 1.5rem;
		background: var(--color-bg-secondary);
		border-radius: 0.5rem;
		border: 1px solid var(--color-border);
	}
	
	.public-key-section h4 {
		margin: 0 0 0.75rem 0;
		font-size: 1rem;
		font-weight: 600;
		color: var(--color-text-primary);
	}
	
	.key-explanation {
		margin: 0 0 1rem 0;
		font-size: 0.875rem;
		color: var(--color-text-secondary);
		line-height: 1.5;
	}
	
	.key-display {
		display: flex;
		gap: 0.75rem;
		margin-bottom: 1rem;
		align-items: flex-start;
	}
	
	.key-content {
		flex: 1;
		min-width: 0;
	}
	
	.public-key {
		display: block;
		width: 100%;
		padding: 0.75rem;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 0.375rem;
		font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
		font-size: 0.75rem;
		color: var(--color-text-primary);
		word-break: break-all;
		line-height: 1.4;
		white-space: pre-wrap;
	}
	
	.copy-btn {
		flex-shrink: 0;
		padding: 0.75rem 1rem;
		font-size: 0.8125rem;
		background: var(--color-primary-500);
		color: white;
		border: none;
		border-radius: 0.375rem;
		cursor: pointer;
		transition: all 0.2s ease;
		white-space: nowrap;
	}
	
	.copy-btn:hover {
		background: var(--color-primary-600);
	}
	
	.key-info {
		padding: 1rem;
		background: var(--color-surface);
		border-radius: 0.375rem;
		border: 1px solid var(--color-border);
	}
	
	.key-info p {
		margin: 0 0 0.5rem 0;
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--color-text-primary);
	}
	
	.key-info ul {
		margin: 0;
		padding-left: 1.25rem;
		font-size: 0.8125rem;
		color: var(--color-text-secondary);
		line-height: 1.5;
	}
	
	.key-info li {
		margin-bottom: 0.5rem;
	}
	
	.key-info li:last-child {
		margin-bottom: 0;
	}
</style>