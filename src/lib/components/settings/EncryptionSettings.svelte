<script>
	import { createEventDispatcher } from 'svelte';
	import { keyManager } from '$lib/crypto/key-manager.js';
	import { clientEncryption } from '$lib/crypto/client-encryption.js';
	
	const dispatch = createEventDispatcher();
	
	let { user } = $props();
	
	let loading = $state(false);
	let error = $state('');
	let success = $state('');
	let keyStatus = $state('checking');
	let hasEncryptionKeys = $state(false);
	
	// Check if user has encryption keys on component mount
	$effect(() => {
		if (user) {
			checkEncryptionStatus();
		}
	});
	
	async function checkEncryptionStatus() {
		try {
			keyStatus = 'checking';
			await keyManager.initialize();
			
			// Check if user has any encryption keys stored
			const hasKeys = await keyManager.hasUserKeys();
			hasEncryptionKeys = hasKeys;
			keyStatus = hasKeys ? 'enabled' : 'disabled';
			
		} catch (err) {
			console.error('Failed to check encryption status:', err);
			keyStatus = 'error';
			error = 'Failed to check encryption status';
		}
	}
	
	async function generateEncryptionKeys() {
		try {
			loading = true;
			error = '';
			success = '';
			
			// Initialize encryption services
			await clientEncryption.initialize();
			await keyManager.initialize();
			
			// Generate user's master encryption keys
			await keyManager.generateUserKeys();
			
			hasEncryptionKeys = true;
			keyStatus = 'enabled';
			success = 'Encryption keys generated successfully! Your messages are now end-to-end encrypted.';
			
			dispatch('updated', { encryptionEnabled: true });
			
		} catch (err) {
			console.error('Failed to generate encryption keys:', err);
			error = (err instanceof Error ? err.message : String(err)) || 'Failed to generate encryption keys';
		} finally {
			loading = false;
		}
	}
	
	async function regenerateKeys() {
		if (!confirm('Are you sure you want to regenerate your encryption keys? This will make old encrypted messages unreadable.')) {
			return;
		}
		
		try {
			loading = true;
			error = '';
			success = '';
			
			// Clear existing keys and generate new ones
			await keyManager.clearUserKeys();
			await keyManager.generateUserKeys();
			
			success = 'Encryption keys regenerated successfully! Note: Previous encrypted messages may no longer be readable.';
			
			dispatch('updated', { encryptionEnabled: true, keysRegenerated: true });
			
		} catch (err) {
			console.error('Failed to regenerate encryption keys:', err);
			error = (err instanceof Error ? err.message : String(err)) || 'Failed to regenerate encryption keys';
		} finally {
			loading = false;
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
	
	<div class="encryption-info">
		<h4>About End-to-End Encryption</h4>
		<ul>
			<li><strong>Quantum-Resistant:</strong> Uses ChaCha20-Poly1305 encryption that's secure against quantum computers</li>
			<li><strong>Client-Side:</strong> All encryption happens in your browser - the server never sees your messages</li>
			<li><strong>Per-Conversation:</strong> Each conversation has its own unique encryption key</li>
			<li><strong>Forward Secrecy:</strong> Keys are automatically shared securely between participants</li>
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
</style>