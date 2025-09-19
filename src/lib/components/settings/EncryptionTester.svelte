<script>
	import { onMount } from 'svelte';
	import { postQuantumEncryption } from '$lib/crypto/post-quantum-encryption.js';
	import { clientEncryption } from '$lib/crypto/client-encryption.js';

	let testText = '';
	let encryptedResult = '';
	let decryptedResult = '';
	let conversationId = generateConversationId();
	let status = '';
	let encryptionInProgress = false;
	let decryptionInProgress = false;

	onMount(async () => {
		// Initialize encryption services
		await postQuantumEncryption.initialize();
		await clientEncryption.initialize();
	});

	function generateConversationId() {
		return 'test-' + Math.random().toString(36).substring(2, 15);
	}

	async function encrypt() {
		try {
			status = '';
			encryptionInProgress = true;
			
			if (!testText) {
				status = 'Please enter some text to encrypt';
				return;
			}
			
			// Get user's own public key for encryption test
			const publicKey = await postQuantumEncryption.getPublicKey();
			console.log(`🔐 [TEST] Using ML-KEM-1024 public key for encryption test`);
			
			// Encrypt using post-quantum encryption
			encryptedResult = await postQuantumEncryption.encryptForRecipient(testText, publicKey);
			
			console.log(`🔐 [TEST] Encryption successful`);
			console.log(`🔐 [TEST] Result:`, encryptedResult);
		} catch (error) {
			console.error(`🔐 [TEST] Encryption failed:`, error);
			status = `Encryption error: ${error instanceof Error ? error.message : String(error)}`;
		} finally {
			encryptionInProgress = false;
		}
	}

	async function decrypt() {
		try {
			status = '';
			decryptionInProgress = true;
			
			if (!encryptedResult) {
				status = 'Please encrypt some text first';
				return;
			}
			
			// Decrypt using post-quantum encryption
			decryptedResult = await postQuantumEncryption.decryptFromSender(encryptedResult, '');
			
			console.log(`🔐 [TEST] Decryption successful`);
			console.log(`🔐 [TEST] Result:`, decryptedResult);
			
			// Verify result matches original text
			if (decryptedResult === testText) {
				status = '✅ Decryption successful! Text matches original.';
			} else {
				status = '⚠️ Decrypted text does not match original text.';
			}
		} catch (error) {
			console.error(`🔐 [TEST] Decryption failed:`, error);
			status = `Decryption error: ${error instanceof Error ? error.message : String(error)}`;
		} finally {
			decryptionInProgress = false;
		}
	}

	function clearKeys() {
		postQuantumEncryption.clearUserKeys();
		clientEncryption.clearAllKeys();
		conversationId = generateConversationId();
		status = 'All encryption keys cleared';
	}
</script>

<div class="encryption-tester">
	<h2>Encryption Test</h2>
	
	<div class="test-input">
		<label for="test-text">Test Text:</label>
		<textarea id="test-text" bind:value={testText} rows="4" placeholder="Enter text to encrypt"></textarea>
	</div>
	
	<div class="test-controls">
		<div class="conversation-id">
			<span>Conversation ID:</span>
			<code>{conversationId}</code>
			<button on:click={() => conversationId = generateConversationId()}>Generate New</button>
		</div>
		
		<div class="buttons">
			<button on:click={encrypt} disabled={encryptionInProgress || !testText}>
				{#if encryptionInProgress}
					Encrypting...
				{:else}
					🔒 Encrypt
				{/if}
			</button>
			
			<button on:click={decrypt} disabled={decryptionInProgress || !encryptedResult}>
				{#if decryptionInProgress}
					Decrypting...
				{:else}
					🔓 Decrypt
				{/if}
			</button>
			
			<button on:click={clearKeys} class="clear-keys">
				🗑️ Clear All Keys
			</button>
		</div>
	</div>
	
	{#if status}
		<div class="status" class:success={status.includes('✅')} class:error={status.includes('error')}>
			{status}
		</div>
	{/if}
	
	<div class="results">
		<div class="result-panel">
			<h3>Encrypted Result:</h3>
			<pre>{encryptedResult || 'No encrypted content yet'}</pre>
		</div>
		
		<div class="result-panel">
			<h3>Decrypted Result:</h3>
			<pre>{decryptedResult || 'No decrypted content yet'}</pre>
		</div>
	</div>
</div>

<style>
	.encryption-tester {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 8px;
		padding: 1.5rem;
		margin: 1rem 0;
		max-width: 800px;
	}
	
	h2 {
		margin-top: 0;
		margin-bottom: 1rem;
		font-size: 1.5rem;
	}
	
	.test-input {
		margin-bottom: 1rem;
	}
	
	label {
		display: block;
		margin-bottom: 0.5rem;
		font-weight: 500;
	}
	
	textarea {
		width: 100%;
		padding: 0.75rem;
		border: 1px solid var(--color-border);
		border-radius: 4px;
		font-family: inherit;
		font-size: 0.9rem;
		resize: vertical;
	}
	
	.test-controls {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		margin-bottom: 1.5rem;
	}
	
	.conversation-id {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.9rem;
	}
	
	code {
		background: var(--color-surface-variant);
		padding: 0.25rem 0.5rem;
		border-radius: 4px;
		font-family: monospace;
	}
	
	.buttons {
		display: flex;
		gap: 0.75rem;
		flex-wrap: wrap;
	}
	
	button {
		padding: 0.5rem 1rem;
		background: var(--color-primary);
		color: white;
		border: none;
		border-radius: 4px;
		font-weight: 500;
		cursor: pointer;
		transition: background 0.2s;
	}
	
	button:hover {
		background: var(--color-primary-dark);
	}
	
	button:disabled {
		background: var(--color-disabled);
		cursor: not-allowed;
	}
	
	.clear-keys {
		background: var(--color-danger);
	}
	
	.clear-keys:hover {
		background: var(--color-danger-dark);
	}
	
	.status {
		margin: 1rem 0;
		padding: 0.75rem;
		border-radius: 4px;
		background: var(--color-info-bg);
		color: var(--color-info-text);
	}
	
	.status.success {
		background: var(--color-success-bg);
		color: var(--color-success-text);
	}
	
	.status.error {
		background: var(--color-error-bg);
		color: var(--color-error-text);
	}
	
	.results {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
	}
	
	.result-panel {
		border: 1px solid var(--color-border);
		border-radius: 4px;
		padding: 1rem;
	}
	
	.result-panel h3 {
		margin-top: 0;
		margin-bottom: 0.75rem;
		font-size: 1rem;
	}
	
	pre {
		background: var(--color-surface-variant);
		padding: 0.75rem;
		border-radius: 4px;
		overflow: auto;
		max-height: 200px;
		font-family: monospace;
		font-size: 0.85rem;
		white-space: pre-wrap;
		word-break: break-all;
	}
	
	@media (max-width: 600px) {
		.results {
			grid-template-columns: 1fr;
		}
	}
</style>