<script>
	import { onMount } from 'svelte';
	import { clientEncryption } from '$lib/crypto/client-encryption.js';

	let testText = $state('Hello, this is a test message! 🔐');
	let conversationId = $state('test-conversation-' + Date.now());
	let encryptedResult = $state('');
	let decryptedResult = $state('');
	let isLoading = $state(false);
	let error = $state('');
	let success = $state('');
	let encryptionStatus = $state({
		isInitialized: false,
		keyCount: 0,
		storageKeys: []
	});

	onMount(async () => {
		await updateEncryptionStatus();
	});

	async function updateEncryptionStatus() {
		try {
			// Check if encryption service is initialized
			const isInitialized = clientEncryption.isInitialized;
			
			// Check localStorage keys
			const storageKeys = [];
			const keysToCheck = [
				'qryptchat_conversation_keys',
				'qryptchat_keys',
				'qrypt_encryption_keys'
			];
			
			for (const key of keysToCheck) {
				const value = localStorage.getItem(key);
				if (value) {
					try {
						const parsed = JSON.parse(value);
						storageKeys.push({
							key,
							count: Object.keys(parsed).length,
							conversations: Object.keys(parsed)
						});
					} catch {
						storageKeys.push({
							key,
							count: 0,
							error: 'Invalid JSON'
						});
					}
				}
			}

			// Get in-memory key count
			const keyCount = clientEncryption.conversationKeys?.size || 0;

			encryptionStatus = {
				isInitialized,
				keyCount,
				storageKeys
			};
		} catch (err) {
			console.error('Failed to get encryption status:', err);
		}
	}

	async function testEncrypt() {
		if (!testText.trim()) {
			error = 'Please enter some text to encrypt';
			return;
		}

		isLoading = true;
		error = '';
		success = '';
		encryptedResult = '';

		try {
			// Initialize encryption service if not already done
			if (!clientEncryption.isInitialized) {
				await clientEncryption.initialize();
			}

			// Encrypt the message
			const encrypted = await clientEncryption.encryptMessage(conversationId, testText);
			encryptedResult = encrypted;
			success = '✅ Encryption successful!';
			
			// Update status
			await updateEncryptionStatus();
		} catch (err) {
			error = `❌ Encryption failed: ${err.message}`;
			console.error('Encryption error:', err);
		} finally {
			isLoading = false;
		}
	}

	async function testDecrypt() {
		if (!encryptedResult.trim()) {
			error = 'Please encrypt some text first, or paste encrypted content';
			return;
		}

		isLoading = true;
		error = '';
		success = '';
		decryptedResult = '';

		try {
			// Initialize encryption service if not already done
			if (!clientEncryption.isInitialized) {
				await clientEncryption.initialize();
			}

			// Decrypt the message
			const decrypted = await clientEncryption.decryptMessage(conversationId, encryptedResult);
			decryptedResult = decrypted;
			
			// Check if decryption was successful
			if (decrypted === testText) {
				success = '✅ Decryption successful! Text matches original.';
			} else if (decrypted === '[Encrypted message - decryption failed]') {
				error = '❌ Decryption failed - unable to decrypt the message';
			} else {
				success = '⚠️ Decryption completed, but result differs from original text';
			}
		} catch (err) {
			error = `❌ Decryption failed: ${err.message}`;
			console.error('Decryption error:', err);
		} finally {
			isLoading = false;
		}
	}

	async function clearAllKeys() {
		if (!confirm('Are you sure you want to clear all encryption keys? This will require re-generating keys for all conversations.')) {
			return;
		}

		isLoading = true;
		error = '';
		success = '';

		try {
			await clientEncryption.clearAllKeys();
			success = '✅ All encryption keys cleared successfully!';
			encryptedResult = '';
			decryptedResult = '';
			await updateEncryptionStatus();
		} catch (err) {
			error = `❌ Failed to clear keys: ${err.message}`;
			console.error('Clear keys error:', err);
		} finally {
			isLoading = false;
		}
	}

	function generateNewConversationId() {
		conversationId = 'test-conversation-' + Date.now();
		encryptedResult = '';
		decryptedResult = '';
		success = '';
		error = '';
	}
</script>

<div class="encryption-tester">
	<h3>🔐 Encryption Tester</h3>
	<p class="description">
		Test the encryption and decryption functionality to debug any issues.
	</p>

	<!-- Encryption Status -->
	<div class="status-section">
		<h4>Encryption Status</h4>
		<div class="status-grid">
			<div class="status-item">
				<span class="label">Service Initialized:</span>
				<span class="value {encryptionStatus.isInitialized ? 'success' : 'error'}">
					{encryptionStatus.isInitialized ? '✅ Yes' : '❌ No'}
				</span>
			</div>
			<div class="status-item">
				<span class="label">Keys in Memory:</span>
				<span class="value">{encryptionStatus.keyCount}</span>
			</div>
		</div>

		{#if encryptionStatus.storageKeys.length > 0}
			<div class="storage-keys">
				<h5>LocalStorage Keys:</h5>
				{#each encryptionStatus.storageKeys as storageKey}
					<div class="storage-key-item">
						<strong>{storageKey.key}:</strong>
						{#if storageKey.error}
							<span class="error">{storageKey.error}</span>
						{:else}
							<span>{storageKey.count} conversations</span>
							{#if storageKey.conversations.length > 0}
								<div class="conversation-list">
									{#each storageKey.conversations.slice(0, 3) as conv}
										<code>{conv}</code>
									{/each}
									{#if storageKey.conversations.length > 3}
										<span>... and {storageKey.conversations.length - 3} more</span>
									{/if}
								</div>
							{/if}
						{/if}
					</div>
				{/each}
			</div>
		{:else}
			<p class="no-keys">No encryption keys found in localStorage</p>
		{/if}
	</div>

	<!-- Test Controls -->
	<div class="test-section">
		<h4>Encryption Test</h4>
		
		<div class="input-group">
			<label for="test-text">Test Text:</label>
			<textarea
				id="test-text"
				bind:value={testText}
				placeholder="Enter text to encrypt/decrypt..."
				rows="3"
			></textarea>
		</div>

		<div class="input-group">
			<label for="conversation-id">Conversation ID:</label>
			<div class="conversation-id-input">
				<input
					id="conversation-id"
					type="text"
					bind:value={conversationId}
					placeholder="test-conversation-123"
				/>
				<button type="button" onclick={generateNewConversationId} class="secondary">
					Generate New
				</button>
			</div>
		</div>

		<div class="button-group">
			<button
				type="button"
				onclick={testEncrypt}
				disabled={isLoading || !testText.trim()}
				class="primary"
			>
				{isLoading ? 'Processing...' : '🔒 Encrypt'}
			</button>
			
			<button
				type="button"
				onclick={testDecrypt}
				disabled={isLoading || !encryptedResult.trim()}
				class="primary"
			>
				{isLoading ? 'Processing...' : '🔓 Decrypt'}
			</button>
			
			<button
				type="button"
				onclick={clearAllKeys}
				disabled={isLoading}
				class="danger"
			>
				🗑️ Clear All Keys
			</button>
		</div>

		<!-- Results -->
		{#if error}
			<div class="result error">
				{error}
			</div>
		{/if}

		{#if success}
			<div class="result success">
				{success}
			</div>
		{/if}

		{#if encryptedResult}
			<div class="result-section">
				<h5>Encrypted Result:</h5>
				<textarea readonly value={encryptedResult} rows="4"></textarea>
			</div>
		{/if}

		{#if decryptedResult}
			<div class="result-section">
				<h5>Decrypted Result:</h5>
				<textarea readonly value={decryptedResult} rows="3"></textarea>
			</div>
		{/if}
	</div>
</div>

<style>
	.encryption-tester {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 0.5rem;
		padding: 1.5rem;
		margin-top: 1rem;
	}

	.encryption-tester h3 {
		margin: 0 0 0.5rem 0;
		color: var(--color-text-primary);
	}

	.description {
		color: var(--color-text-secondary);
		margin-bottom: 1.5rem;
		font-size: 0.875rem;
	}

	.status-section {
		margin-bottom: 2rem;
		padding: 1rem;
		background: var(--color-background);
		border-radius: 0.375rem;
		border: 1px solid var(--color-border);
	}

	.status-section h4 {
		margin: 0 0 1rem 0;
		color: var(--color-text-primary);
		font-size: 1rem;
	}

	.status-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 1rem;
		margin-bottom: 1rem;
	}

	.status-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.5rem;
		background: var(--color-surface);
		border-radius: 0.25rem;
		border: 1px solid var(--color-border);
	}

	.label {
		font-weight: 500;
		color: var(--color-text-primary);
	}

	.value {
		font-family: monospace;
		font-size: 0.875rem;
	}

	.value.success {
		color: var(--color-success);
	}

	.value.error {
		color: var(--color-error);
	}

	.storage-keys {
		margin-top: 1rem;
	}

	.storage-keys h5 {
		margin: 0 0 0.5rem 0;
		font-size: 0.875rem;
		color: var(--color-text-primary);
	}

	.storage-key-item {
		margin-bottom: 0.5rem;
		padding: 0.5rem;
		background: var(--color-surface);
		border-radius: 0.25rem;
		font-size: 0.875rem;
	}

	.conversation-list {
		margin-top: 0.25rem;
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
	}

	.conversation-list code {
		background: var(--color-background);
		padding: 0.125rem 0.25rem;
		border-radius: 0.125rem;
		font-size: 0.75rem;
		border: 1px solid var(--color-border);
	}

	.no-keys {
		color: var(--color-text-secondary);
		font-style: italic;
		margin: 0;
	}

	.test-section h4 {
		margin: 0 0 1rem 0;
		color: var(--color-text-primary);
		font-size: 1rem;
	}

	.input-group {
		margin-bottom: 1rem;
	}

	.input-group label {
		display: block;
		margin-bottom: 0.5rem;
		font-weight: 500;
		color: var(--color-text-primary);
	}

	.input-group textarea,
	.input-group input {
		width: 100%;
		padding: 0.75rem;
		border: 1px solid var(--color-border);
		border-radius: 0.375rem;
		background: var(--color-background);
		color: var(--color-text-primary);
		font-family: inherit;
		resize: vertical;
	}

	.conversation-id-input {
		display: flex;
		gap: 0.5rem;
	}

	.conversation-id-input input {
		flex: 1;
	}

	.button-group {
		display: flex;
		gap: 0.75rem;
		margin-bottom: 1.5rem;
		flex-wrap: wrap;
	}

	button {
		padding: 0.75rem 1rem;
		border: none;
		border-radius: 0.375rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s ease;
		font-size: 0.875rem;
	}

	button:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	button.primary {
		background: var(--color-primary);
		color: white;
	}

	button.primary:hover:not(:disabled) {
		background: var(--color-primary-dark);
	}

	button.secondary {
		background: var(--color-surface);
		color: var(--color-text-primary);
		border: 1px solid var(--color-border);
	}

	button.secondary:hover:not(:disabled) {
		background: var(--color-background);
	}

	button.danger {
		background: var(--color-error);
		color: white;
	}

	button.danger:hover:not(:disabled) {
		background: var(--color-error-dark);
	}

	.result {
		padding: 0.75rem;
		border-radius: 0.375rem;
		margin-bottom: 1rem;
		font-weight: 500;
	}

	.result.success {
		background: var(--color-success-bg, #d4edda);
		color: var(--color-success-text, #155724);
		border: 1px solid var(--color-success, #28a745);
	}

	.result.error {
		background: var(--color-error-bg, #f8d7da);
		color: var(--color-error-text, #721c24);
		border: 1px solid var(--color-error, #dc3545);
	}

	.result-section {
		margin-bottom: 1rem;
	}

	.result-section h5 {
		margin: 0 0 0.5rem 0;
		font-size: 0.875rem;
		color: var(--color-text-primary);
	}

	.result-section textarea {
		width: 100%;
		padding: 0.75rem;
		border: 1px solid var(--color-border);
		border-radius: 0.375rem;
		background: var(--color-background);
		color: var(--color-text-primary);
		font-family: monospace;
		font-size: 0.8125rem;
		resize: vertical;
	}

	/* Responsive */
	@media (max-width: 768px) {
		.button-group {
			flex-direction: column;
		}

		.conversation-id-input {
			flex-direction: column;
		}

		.status-grid {
			grid-template-columns: 1fr;
		}
	}
</style>