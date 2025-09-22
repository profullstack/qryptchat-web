<script>
	import { createEventDispatcher } from 'svelte';
	import { keyManager } from '$lib/crypto/key-manager.js';
	import { privateKeyManager } from '$lib/crypto/private-key-manager.js';
	
	const dispatch = createEventDispatcher();
	
	let { user } = $props();
	
	let loading = $state(false);
	let error = $state('');
	let success = $state('');
	let hasEncryptionKeys = $state(false);
	
	// Export state
	let exportPassword = $state('');
	let confirmExportPassword = $state('');
	let showExportPassword = $state(false);
	let useGPGEncryption = $state(false);
	let gpgPassword = $state('');
	let confirmGPGPassword = $state('');
	let showGPGPassword = $state(false);
	
	// Import state
	let importPassword = $state('');
	let showImportPassword = $state(false);
	let importFile = $state(null);
	let dragOver = $state(false);
	
	// Check if user has encryption keys on component mount
	$effect(() => {
		if (user) {
			checkEncryptionStatus();
		}
	});
	
	async function checkEncryptionStatus() {
		try {
			await keyManager.initialize();
			const hasKeys = await keyManager.hasUserKeys();
			hasEncryptionKeys = hasKeys;
		} catch (err) {
			console.error('Failed to check encryption status:', err);
			error = 'Failed to check encryption status';
		}
	}
	
	async function exportPrivateKeys() {
		if (!exportPassword || exportPassword.trim().length === 0) {
			error = 'Please enter a password to protect your exported keys';
			return;
		}
		
		if (exportPassword !== confirmExportPassword) {
			error = 'Passwords do not match';
			return;
		}
		
		if (exportPassword.length < 8) {
			error = 'Password must be at least 8 characters long';
			return;
		}

		try {
			loading = true;
			error = '';
			success = '';
			
			// Export with secure AES-GCM-256 encryption
			const exportedData = await privateKeyManager.exportPrivateKeys(exportPassword);
			privateKeyManager.downloadExportedKeys(exportedData);
			success = 'Private keys exported successfully! Keep your password safe - you\'ll need it to import your keys.';
			
			// Clear passwords
			exportPassword = '';
			confirmExportPassword = '';
			
			dispatch('exported', { timestamp: Date.now() });
			
		} catch (err) {
			console.error('Failed to export private keys:', err);
			error = err.message || 'Failed to export private keys';
		} finally {
			loading = false;
		}
	}
	
	async function importPrivateKeys() {
		if (!importPassword || importPassword.trim().length === 0) {
			error = 'Please enter the password used to protect your keys';
			return;
		}
		
		if (!importFile) {
			error = 'Please select a key file to import';
			return;
		}
		
		try {
			loading = true;
			error = '';
			success = '';
			
			const fileContent = await readFileAsText(importFile);
			await privateKeyManager.importPrivateKeys(fileContent, importPassword);
			
			// Update encryption status
			hasEncryptionKeys = true;
			
			success = 'Private keys imported successfully! Your encryption keys have been restored.';
			
			// Clear form
			importPassword = '';
			importFile = null;
			
			dispatch('imported', { timestamp: Date.now() });
			
		} catch (err) {
			console.error('Failed to import private keys:', err);
			error = err.message || 'Failed to import private keys';
		} finally {
			loading = false;
		}
	}
	
	function readFileAsText(file) {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = (e) => resolve(e.target.result);
			reader.onerror = (e) => reject(new Error('Failed to read file'));
			reader.readAsText(file);
		});
	}
	
	function handleFileSelect(event) {
		const files = event.target.files;
		if (files && files.length > 0) {
			importFile = files[0];
			error = '';
		}
	}
	
	function handleDragOver(event) {
		event.preventDefault();
		dragOver = true;
	}
	
	function handleDragLeave(event) {
		event.preventDefault();
		dragOver = false;
	}
	
	function handleDrop(event) {
		event.preventDefault();
		dragOver = false;
		
		const files = event.dataTransfer.files;
		if (files && files.length > 0) {
			importFile = files[0];
			error = '';
		}
	}
	
	function clearMessages() {
		error = '';
		success = '';
	}
	
	/**
	 * Generate encryption keys for new users
	 */
	async function generateKeys() {
		try {
			loading = true;
			error = '';
			success = '';
			
			// Generate user encryption keys
			await keyManager.generateUserKeys();
			
			// Update status
			hasEncryptionKeys = true;
			
			success = 'Encryption keys generated successfully! You can now export them for backup.';
			
			// Dispatch event for parent component
			dispatch('exported', { timestamp: Date.now(), generated: true });
			
		} catch (err) {
			console.error('Failed to generate encryption keys:', err);
			error = err.message || 'Failed to generate encryption keys';
		} finally {
			loading = false;
		}
	}

	/**
	 * Copy text to clipboard
	 */
	async function copyToClipboard(text) {
		try {
			await navigator.clipboard.writeText(text);
			success = 'CLI script copied to clipboard!';
			setTimeout(() => { success = ''; }, 3000);
		} catch (err) {
			console.error('Failed to copy to clipboard:', err);
			error = 'Failed to copy to clipboard';
		}
	}

	// No longer needed - using npm package instead

	// CLI decryption script
	const cliScript = `#!/usr/bin/env node
import { readFileSync } from 'fs';
import { createInterface } from 'readline';
import { webcrypto } from 'crypto';

// Polyfill for Node.js crypto
const { subtle } = webcrypto;

// Base64 utilities
const Base64 = {
	encode: (bytes) => Buffer.from(bytes).toString('base64'),
	decode: (str) => new Uint8Array(Buffer.from(str, 'base64'))
};

// HKDF implementation
async function hkdfDerive(password, salt, info, keyLength) {
	const encoder = new TextEncoder();
	const passwordKey = await subtle.importKey(
		'raw',
		encoder.encode(password),
		{ name: 'HKDF' },
		false,
		['deriveKey']
	);
	
	const derivedKey = await subtle.deriveKey(
		{
			name: 'HKDF',
			hash: 'SHA-256',
			salt: salt,
			info: encoder.encode(info)
		},
		passwordKey,
		{ name: 'AES-GCM', length: 256 },
		true,
		['decrypt']
	);
	
	return await subtle.exportKey('raw', derivedKey);
}

// Decrypt function
async function decryptKeys(exportedData, password) {
	const data = JSON.parse(exportedData);
	
	// Validate format
	if (!data.version || !data.encryptedKeys || !data.salt || !data.iv) {
		throw new Error('Invalid export format');
	}
	
	if (data.version !== '2.0') {
		throw new Error(\`Unsupported version: \${data.version}\`);
	}
	
	// Decode components
	const encryptedKeys = Base64.decode(data.encryptedKeys);
	const salt = Base64.decode(data.salt);
	const iv = Base64.decode(data.iv);
	
	// Derive key from password
	const keyBytes = await hkdfDerive(password, salt, 'PostQuantumKeyExport', 32);
	
	// Import key for decryption
	const cryptoKey = await subtle.importKey(
		'raw',
		keyBytes,
		{ name: 'AES-GCM', length: 256 },
		false,
		['decrypt']
	);
	
	// Decrypt
	const decryptedBuffer = await subtle.decrypt(
		{ name: 'AES-GCM', iv: iv },
		cryptoKey,
		encryptedKeys
	);
	
	// Convert to string and parse
	const decryptedJson = new TextDecoder().decode(decryptedBuffer);
	return JSON.parse(decryptedJson);
}

// Main function
async function main() {
	const filename = process.argv[2];
	if (!filename) {
		console.error('Usage: node decrypt-keys.js <key-file.json>');
		process.exit(1);
	}
	
	try {
		// Read file
		const fileContent = readFileSync(filename, 'utf8');
		
		// Get password
		const rl = createInterface({
			input: process.stdin,
			output: process.stdout
		});
		
		const password = await new Promise((resolve) => {
			rl.question('Enter password: ', (answer) => {
				rl.close();
				resolve(answer);
			});
		});
		
		// Decrypt
		const keys = await decryptKeys(fileContent, password);
		
		console.log('\\n✅ Keys decrypted successfully!');
		console.log('\\n📊 Key Information:');
		console.log(\`Version: \${keys.version}\`);
		console.log(\`Timestamp: \${new Date(keys.timestamp).toISOString()}\`);
		
		if (keys.keys1024) {
			console.log('\\n🔐 ML-KEM-1024 Keys:');
			console.log(\`Algorithm: \${keys.keys1024.algorithm}\`);
			console.log(\`Public Key: \${keys.keys1024.publicKey.substring(0, 50)}...\`);
			console.log(\`Private Key: [HIDDEN - \${keys.keys1024.privateKey.length} characters]\`);
		}
		
		if (keys.keys768) {
			console.log('\\n🔐 ML-KEM-768 Keys:');
			console.log(\`Algorithm: \${keys.keys768.algorithm}\`);
			console.log(\`Public Key: \${keys.keys768.publicKey.substring(0, 50)}...\`);
			console.log(\`Private Key: [HIDDEN - \${keys.keys768.privateKey.length} characters]\`);
		}
		
		console.log('\\n⚠️  Keep your private keys secure!');
		
	} catch (error) {
		if (error.message.includes('Invalid password')) {
			console.error('❌ Invalid password or corrupted data');
		} else {
			console.error(\`❌ Error: \${error.message}\`);
		}
		process.exit(1);
	}
}

main().catch(console.error);`;
</script>

<div class="private-key-manager">
	<div class="section-header">
		<h3>🔐 Private Key Management</h3>
		<p>Export and import your encryption keys for backup and device sync</p>
	</div>
	
	{#if error}
		<div class="alert error">
			<strong>Error:</strong> {error}
			<button class="close-btn" onclick={clearMessages}>×</button>
		</div>
	{/if}
	
	{#if success}
		<div class="alert success">
			<strong>Success:</strong> {success}
			<button class="close-btn" onclick={clearMessages}>×</button>
		</div>
	{/if}
	
	<!-- Key Generation Section for users without keys -->
	{#if !hasEncryptionKeys}
		<div class="key-section generate-section">
			<div class="section-title">
				<h4>🔐 Generate Encryption Keys</h4>
				<p>You need encryption keys to secure your messages. Generate them now to start using QryptChat securely.</p>
			</div>
			
			<div class="warning-box">
				<p><strong>⚠️ Important:</strong></p>
				<ul>
					<li>Your encryption keys will be generated locally and stored securely</li>
					<li>You'll be prompted to download a backup after generation</li>
					<li>Keep your backup safe - it's the only way to restore your keys</li>
				</ul>
			</div>
			
			<button
				type="button"
				class="btn primary"
				onclick={generateKeys}
				disabled={loading}
			>
				{#if loading}
					<div class="btn-spinner"></div>
					Generating Keys...
				{:else}
					🔐 Generate My Encryption Keys
				{/if}
			</button>
		</div>
	{:else}
		<!-- Export Section -->
		<div class="key-section">
			<div class="section-title">
				<h4>📤 Export Private Keys</h4>
				<p>Create a secure backup of your encryption keys</p>
			</div>
			
			<div class="form-group">
				<label for="export-password">Protection Password</label>
				<div class="password-input">
					<input
						id="export-password"
						type={showExportPassword ? 'text' : 'password'}
						bind:value={exportPassword}
						placeholder="Enter a strong password to protect your keys"
						disabled={loading}
					/>
					<button
						type="button"
						class="toggle-password"
						onclick={() => showExportPassword = !showExportPassword}
						disabled={loading}
					>
						{showExportPassword ? '👁️' : '👁️‍🗨️'}
					</button>
				</div>
			</div>
			
			<div class="form-group">
				<label for="confirm-export-password">Confirm Password</label>
				<div class="password-input">
					<input
						id="confirm-export-password"
						type={showExportPassword ? 'text' : 'password'}
						bind:value={confirmExportPassword}
						placeholder="Confirm your password"
						disabled={loading}
					/>
					<button
						type="button"
						class="toggle-password"
						onclick={() => showExportPassword = !showExportPassword}
						disabled={loading}
					>
						{showExportPassword ? '👁️' : '👁️‍🗨️'}
					</button>
				</div>
			</div>

			<!-- AES-GCM-256 encryption is already secure - no additional GPG needed -->
			
			<button
				type="button"
				class="btn primary"
				onclick={exportPrivateKeys}
				disabled={loading || !exportPassword || !confirmExportPassword || (useGPGEncryption && (!gpgPassword || !confirmGPGPassword))}
			>
				{#if loading}
					<div class="btn-spinner"></div>
					Exporting...
				{:else}
					{useGPGEncryption ? '🔐 Export with GPG' : '📤 Export Keys'}
				{/if}
			</button>
			
			<div class="help-text">
				<p><strong>⚠️ Important:</strong></p>
				<ul>
					<li>Remember your password{useGPGEncryption ? 's' : ''} - {useGPGEncryption ? 'they' : 'it'} cannot be recovered</li>
					<li>Store the exported file in a secure location</li>
					<li>Anyone with the file and password{useGPGEncryption ? 's' : ''} can access your keys</li>
					{#if useGPGEncryption}
						<li>GPG encrypted files require both passwords and GPG software to decrypt</li>
					{/if}
				</ul>
			</div>
		</div>

		<!-- CLI Decryption Command Section -->
		<div class="key-section cli-section">
			<div class="section-title">
				<h4>💻 Command Line Decryption</h4>
				<p>Decrypt your exported key files using Node.js on Mac, Windows, or Linux</p>
			</div>

			<div class="cli-content">
				<p>To decrypt your exported keys from the command line, save this script as <code>decrypt-keys.js</code> and run it with Node.js:</p>
				
				<div class="code-block">
					<div class="code-header">
						<span class="code-title">decrypt-keys.js</span>
						<button class="copy-btn" onclick={() => copyToClipboard(cliScript)}>
							📋 Copy
						</button>
					</div>
					<pre><code>{cliScript}</code></pre>
				</div>

				<div class="usage-instructions">
					<p><strong>Usage:</strong></p>
					<div class="command-examples">
						<p>1. Save the script above as <code>decrypt-keys.js</code></p>
						<p>2. Run with Node.js:</p>
						<div class="command-block">
							<code>node decrypt-keys.js your-key-file.json</code>
						</div>
						<p>3. Enter your password when prompted</p>
					</div>
				</div>

				<div class="cli-help">
					<p><strong>Requirements:</strong></p>
					<ul>
						<li>Node.js v20 or newer</li>
						<li>Your exported key file (.json)</li>
						<li>The password you used to export the keys</li>
					</ul>
				</div>
			</div>
		</div>
	{/if}
	
	<!-- Import Section -->
	<div class="key-section">
		<div class="section-title">
			<h4>📥 Import Private Keys</h4>
			<p>Restore your encryption keys from a backup file</p>
		</div>
		
		<div class="form-group">
			<label for="key-file-input">Key File</label>
			<div
				class="file-drop-zone {dragOver ? 'drag-over' : ''}"
				role="button"
				tabindex="0"
				aria-label="Drop key file here or click to select"
				ondragover={handleDragOver}
				ondragleave={handleDragLeave}
				ondrop={handleDrop}
			>
				{#if importFile}
					<div class="file-selected">
						<span class="file-icon">📄</span>
						<span class="file-name">{importFile.name}</span>
						<button 
							type="button" 
							class="remove-file"
							onclick={() => importFile = null}
							disabled={loading}
						>
							×
						</button>
					</div>
				{:else}
					<div class="file-drop-content">
						<span class="drop-icon">📁</span>
						<p>Drop your key file here or click to select</p>
						<input
							id="key-file-input"
							type="file"
							accept=".json"
							onchange={handleFileSelect}
							disabled={loading}
							class="file-input"
						/>
					</div>
				{/if}
			</div>
		</div>
		
		<div class="form-group">
			<label for="import-password">Password</label>
			<div class="password-input">
				<input
					id="import-password"
					type={showImportPassword ? 'text' : 'password'}
					bind:value={importPassword}
					placeholder="Enter the password used to protect your keys"
					disabled={loading}
				/>
				<button
					type="button"
					class="toggle-password"
					onclick={() => showImportPassword = !showImportPassword}
					disabled={loading}
				>
					{showImportPassword ? '👁️' : '👁️‍🗨️'}
				</button>
			</div>
		</div>
		
		<button
			type="button"
			class="btn secondary"
			onclick={importPrivateKeys}
			disabled={loading || !importFile || !importPassword}
		>
			{#if loading}
				<div class="btn-spinner"></div>
				Importing...
			{:else}
				📥 Import Keys
			{/if}
		</button>
		
		<div class="help-text">
			<p><strong>⚠️ Warning:</strong></p>
			<ul>
				<li>Importing will replace your current encryption keys</li>
				<li>Make sure you have the correct password</li>
				<li>Only import files you trust</li>
			</ul>
		</div>
	</div>
</div>

<style>
	.private-key-manager {
		padding: 1.5rem;
	}
	
	.section-header {
		margin-bottom: 2rem;
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
	
	.alert {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		padding: 0.75rem 1rem;
		border-radius: 0.375rem;
		margin-bottom: 1.5rem;
		font-size: 0.875rem;
		position: relative;
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
	
	.close-btn {
		background: none;
		border: none;
		color: inherit;
		cursor: pointer;
		font-size: 1.25rem;
		line-height: 1;
		padding: 0;
		margin-left: 1rem;
		opacity: 0.7;
	}
	
	.close-btn:hover {
		opacity: 1;
	}
	
	.key-section {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 0.5rem;
		padding: 1.5rem;
		margin-bottom: 1.5rem;
	}
	
	.section-title {
		margin-bottom: 1.5rem;
	}
	
	.section-title h4 {
		margin: 0 0 0.5rem 0;
		font-size: 1rem;
		font-weight: 600;
		color: var(--color-text-primary);
	}
	
	.section-title p {
		margin: 0;
		color: var(--color-text-secondary);
		font-size: 0.875rem;
	}
	
	.form-group {
		margin-bottom: 1rem;
	}
	
	.form-group label {
		display: block;
		margin-bottom: 0.5rem;
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--color-text-secondary);
	}
	
	.password-input {
		position: relative;
		display: flex;
		align-items: center;
	}
	
	.password-input input {
		flex: 1;
		padding: 0.75rem;
		padding-right: 3rem;
		border: 1px solid var(--color-border);
		border-radius: 0.375rem;
		background: var(--color-bg-primary);
		color: var(--color-text-primary);
		font-size: 0.875rem;
	}
	
	.password-input input:focus {
		outline: none;
		border-color: var(--color-primary-500);
		box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
	}
	
	.toggle-password {
		position: absolute;
		right: 0.75rem;
		background: none;
		border: none;
		cursor: pointer;
		font-size: 1rem;
		color: var(--color-text-secondary);
		padding: 0.25rem;
	}
	
	.toggle-password:hover {
		color: var(--color-text-primary);
	}
	
	.file-drop-zone {
		border: 2px dashed var(--color-border);
		border-radius: 0.5rem;
		padding: 2rem;
		text-align: center;
		transition: all 0.2s ease;
		cursor: pointer;
		position: relative;
	}
	
	.file-drop-zone:hover,
	.file-drop-zone.drag-over {
		border-color: var(--color-primary-500);
		background: var(--color-bg-secondary);
	}
	
	.file-drop-content {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
	}
	
	.drop-icon {
		font-size: 2rem;
		opacity: 0.5;
	}
	
	.file-drop-content p {
		margin: 0;
		color: var(--color-text-secondary);
		font-size: 0.875rem;
	}
	
	.file-input {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		opacity: 0;
		cursor: pointer;
	}
	
	.file-selected {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem;
		background: var(--color-bg-secondary);
		border-radius: 0.375rem;
		border: 1px solid var(--color-border);
	}
	
	.file-icon {
		font-size: 1.25rem;
	}
	
	.file-name {
		flex: 1;
		font-size: 0.875rem;
		color: var(--color-text-primary);
		text-align: left;
	}
	
	.remove-file {
		background: none;
		border: none;
		color: var(--color-text-secondary);
		cursor: pointer;
		font-size: 1.25rem;
		padding: 0.25rem;
		line-height: 1;
	}
	
	.remove-file:hover {
		color: var(--color-error);
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
	
	@keyframes spin {
		to { transform: rotate(360deg); }
	}
	
	.help-text {
		margin-top: 1rem;
		padding: 1rem;
		background: var(--color-bg-secondary);
		border-radius: 0.375rem;
		border: 1px solid var(--color-border);
	}
	
	.help-text p {
		margin: 0 0 0.5rem 0;
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--color-text-primary);
	}
	
	.help-text ul {
		margin: 0;
		padding-left: 1.25rem;
		font-size: 0.8125rem;
		color: var(--color-text-secondary);
		line-height: 1.5;
	}
	
	.help-text li {
		margin-bottom: 0.25rem;
	}
	
	.help-text li:last-child {
		margin-bottom: 0;
	}

	/* CLI section styling */
	.cli-section {
		border: 1px solid var(--color-border);
		background: var(--color-bg-secondary);
	}

	.cli-content {
		font-size: 0.875rem;
		line-height: 1.5;
	}

	.simple-command {
		padding: 1.5rem;
		background: linear-gradient(135deg, rgba(99, 102, 241, 0.05), rgba(139, 92, 246, 0.05));
		border: 2px solid rgba(99, 102, 241, 0.2);
		border-radius: 0.5rem;
		margin-bottom: 1.5rem;
	}

	.simple-command p {
		margin: 0 0 1rem 0;
		font-weight: 600;
		color: var(--color-text-primary);
	}

	.command-block.install,
	.command-block.usage {
		position: relative;
		background: #1a1a1a;
		border: 2px solid rgba(99, 102, 241, 0.3);
		padding: 1rem;
		margin: 0.5rem 0 1rem 0;
		border-radius: 0.375rem;
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.command-block.install code,
	.command-block.usage code {
		color: #00ff88;
		font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
		font-size: 0.875rem;
		font-weight: 600;
	}

	.command-block .copy-btn {
		background: rgba(99, 102, 241, 0.8);
		backdrop-filter: blur(4px);
		font-size: 0.75rem;
		padding: 0.375rem 0.75rem;
		margin-left: 1rem;
		color: white;
		border: none;
		border-radius: 0.25rem;
		cursor: pointer;
		transition: background-color 0.2s ease;
	}

	.command-block .copy-btn:hover {
		background: rgba(99, 102, 241, 1);
	}

	.cli-note {
		margin: 0.75rem 0 0 0;
		font-size: 0.8125rem;
		color: var(--color-text-secondary);
		font-style: italic;
	}

	.cli-help {
		margin-top: 1rem;
		padding: 1rem;
		background: rgba(251, 191, 36, 0.05);
		border: 1px solid rgba(251, 191, 36, 0.2);
		border-radius: 0.375rem;
	}

	.cli-help p {
		margin: 0 0 0.5rem 0;
		color: #d97706;
		font-weight: 500;
		font-size: 0.875rem;
	}

	.cli-help ul {
		margin: 0;
		padding-left: 1.25rem;
		font-size: 0.8125rem;
		color: #92400e;
		line-height: 1.5;
	}

	.cli-help li {
		margin-bottom: 0.25rem;
	}

	/* Warning box for key generation */
	.warning-box {
		background: rgba(251, 191, 36, 0.1);
		border: 1px solid #f59e0b;
		border-radius: 0.375rem;
		padding: 1rem;
		margin: 1rem 0;
	}

	.warning-box p {
		color: #d97706;
		margin: 0 0 0.5rem 0;
		font-weight: 500;
		font-size: 0.875rem;
	}

	.warning-box ul {
		margin: 0;
		padding-left: 1.25rem;
		font-size: 0.8125rem;
		color: #92400e;
		line-height: 1.5;
	}

	.warning-box li {
		margin-bottom: 0.25rem;
	}

	.warning-box li:last-child {
		margin-bottom: 0;
	}

	/* Generate section specific styling */
	.generate-section {
		border: 2px dashed var(--color-border);
		background: var(--color-bg-secondary);
	}

	.generate-section .section-title h4 {
		color: var(--color-brand-primary);
	}
</style>