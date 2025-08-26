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

		// Validate GPG password if GPG encryption is enabled
		if (useGPGEncryption) {
			if (!gpgPassword || gpgPassword.trim().length === 0) {
				error = 'Please enter a GPG password for additional encryption';
				return;
			}
			
			if (gpgPassword !== confirmGPGPassword) {
				error = 'GPG passwords do not match';
				return;
			}
			
			if (gpgPassword.length < 8) {
				error = 'GPG password must be at least 8 characters long';
				return;
			}
		}
		
		try {
			loading = true;
			error = '';
			success = '';
			
			let exportedData;
			if (useGPGEncryption) {
				// Export with GPG encryption
				exportedData = await privateKeyManager.exportPrivateKeysWithGPG(exportPassword, gpgPassword);
				privateKeyManager.downloadGPGEncryptedKeys(exportedData);
				success = 'Private keys exported with GPG encryption! Keep both passwords safe - you\'ll need them to import your keys.';
			} else {
				// Standard export
				exportedData = await privateKeyManager.exportPrivateKeys(exportPassword);
				privateKeyManager.downloadExportedKeys(exportedData);
				success = 'Private keys exported successfully! Keep your password safe - you\'ll need it to import your keys.';
			}
			
			// Clear passwords
			exportPassword = '';
			confirmExportPassword = '';
			gpgPassword = '';
			confirmGPGPassword = '';
			
			dispatch('exported', { timestamp: Date.now(), gpgEncrypted: useGPGEncryption });
			
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
	
	{#if hasEncryptionKeys}
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

			<!-- GPG Encryption Option -->
			<div class="form-group">
				<label class="checkbox-label">
					<input
						type="checkbox"
						bind:checked={useGPGEncryption}
						disabled={loading}
					/>
					<span class="checkbox-text">🔐 Enable GPG encryption (recommended)</span>
				</label>
				<p class="help-text-inline">
					Adds an additional layer of GPG encryption to your exported keys for maximum security
				</p>
			</div>

			{#if useGPGEncryption}
				<div class="gpg-section">
					<div class="form-group">
						<label for="gpg-password">GPG Password</label>
						<div class="password-input">
							<input
								id="gpg-password"
								type={showGPGPassword ? 'text' : 'password'}
								bind:value={gpgPassword}
								placeholder="Enter a strong GPG password"
								disabled={loading}
							/>
							<button
								type="button"
								class="toggle-password"
								onclick={() => showGPGPassword = !showGPGPassword}
								disabled={loading}
							>
								{showGPGPassword ? '👁️' : '👁️‍🗨️'}
							</button>
						</div>
					</div>
					
					<div class="form-group">
						<label for="confirm-gpg-password">Confirm GPG Password</label>
						<div class="password-input">
							<input
								id="confirm-gpg-password"
								type={showGPGPassword ? 'text' : 'password'}
								bind:value={confirmGPGPassword}
								placeholder="Confirm your GPG password"
								disabled={loading}
							/>
							<button
								type="button"
								class="toggle-password"
								onclick={() => showGPGPassword = !showGPGPassword}
								disabled={loading}
							>
								{showGPGPassword ? '👁️' : '👁️‍🗨️'}
							</button>
						</div>
					</div>
				</div>
			{/if}
			
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

	/* GPG-specific styles */
	.checkbox-label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		cursor: pointer;
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--color-text-primary);
	}

	.checkbox-label input[type="checkbox"] {
		margin: 0;
		cursor: pointer;
	}

	.checkbox-text {
		user-select: none;
	}

	.help-text-inline {
		margin: 0.5rem 0 0 0;
		font-size: 0.8125rem;
		color: var(--color-text-secondary);
		line-height: 1.4;
	}

	.gpg-section {
		margin-top: 1rem;
		padding: 1rem;
		background: var(--color-bg-secondary);
		border-radius: 0.375rem;
		border: 1px solid var(--color-border);
	}

	.gpg-section .form-group {
		margin-bottom: 0.75rem;
	}

	.gpg-section .form-group:last-child {
		margin-bottom: 0;
	}
</style>