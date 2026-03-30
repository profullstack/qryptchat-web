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

	// Backup PIN state
	let hasPin = $state(false);
	let pinLoading = $state(true);
	let pin = $state('');
	let confirmPin = $state('');
	let changingPin = $state(false);

	// Server backup state
	let hasBackup = $state(false);
	let backupLoading = $state(true);
	let backupPin = $state('');
	let restorePin = $state('');

	$effect(() => {
		if (user) {
			checkEncryptionStatus();
			checkPinStatus();
			checkBackupStatus();
		}
	});

	async function checkEncryptionStatus() {
		try {
			await keyManager.initialize();
			hasEncryptionKeys = await keyManager.hasUserKeys();
		} catch (err) {
			console.error('Failed to check encryption status:', err);
			error = 'Failed to check encryption status';
		}
	}

	async function checkPinStatus() {
		try {
			pinLoading = true;
			const res = await fetch('/api/auth/backup-pin');
			if (res.ok) {
				const data = await res.json();
				hasPin = data.hasPin;
			}
		} catch (err) {
			console.error('Failed to check PIN status:', err);
		} finally {
			pinLoading = false;
		}
	}

	async function checkBackupStatus() {
		try {
			backupLoading = true;
			hasBackup = await privateKeyManager.hasServerBackup();
		} catch (err) {
			console.error('Failed to check backup status:', err);
		} finally {
			backupLoading = false;
		}
	}

	async function generateKeys() {
		try {
			loading = true;
			error = '';
			success = '';
			await keyManager.generateUserKeys();
			hasEncryptionKeys = true;
			success = 'Encryption keys generated successfully!';
			dispatch('exported', { timestamp: Date.now(), generated: true });
		} catch (err) {
			console.error('Failed to generate encryption keys:', err);
			error = err.message || 'Failed to generate encryption keys';
		} finally {
			loading = false;
		}
	}

	async function setPin() {
		if (!pin || pin.length !== 6) {
			error = 'PIN must be exactly 6 digits';
			return;
		}
		if (pin !== confirmPin) {
			error = 'PINs do not match';
			return;
		}

		try {
			loading = true;
			error = '';
			success = '';

			const res = await fetch('/api/auth/backup-pin', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ pin })
			});

			if (!res.ok) {
				const data = await res.json();
				throw new Error(data.error || 'Failed to set PIN');
			}

			await privateKeyManager.backupKeysToServer(pin);

			hasPin = true;
			changingPin = false;
			pin = '';
			confirmPin = '';
			success = 'Backup PIN set and keys backed up to server.';
			await checkBackupStatus();
		} catch (err) {
			console.error('Failed to set backup PIN:', err);
			error = err.message || 'Failed to set backup PIN';
		} finally {
			loading = false;
		}
	}

	async function backupToServer() {
		if (!backupPin || backupPin.length !== 6) {
			error = 'PIN must be exactly 6 digits';
			return;
		}

		try {
			loading = true;
			error = '';
			success = '';
			await privateKeyManager.backupKeysToServer(backupPin);
			backupPin = '';
			success = 'Keys backed up to server successfully.';
			await checkBackupStatus();
		} catch (err) {
			console.error('Failed to backup keys:', err);
			error = err.message || 'Failed to backup keys to server';
		} finally {
			loading = false;
		}
	}

	async function restoreFromServer() {
		if (!restorePin || restorePin.length !== 6) {
			error = 'PIN must be exactly 6 digits';
			return;
		}

		try {
			loading = true;
			error = '';
			success = '';
			await privateKeyManager.restoreKeysFromServer(restorePin);
			hasEncryptionKeys = true;
			restorePin = '';
			success = 'Keys restored from server successfully.';
			dispatch('imported', { timestamp: Date.now() });
		} catch (err) {
			console.error('Failed to restore keys:', err);
			error = err.message || 'Failed to restore keys from server';
		} finally {
			loading = false;
		}
	}

	function clearMessages() {
		error = '';
		success = '';
	}
</script>

<div class="private-key-manager">
	<div class="section-header">
		<h3>Private Key Management</h3>
		<p>Manage your encryption keys and server backups</p>
	</div>

	{#if error}
		<div class="alert error">
			<span>{error}</span>
			<button class="close-btn" onclick={clearMessages}>&times;</button>
		</div>
	{/if}

	{#if success}
		<div class="alert success">
			<span>{success}</span>
			<button class="close-btn" onclick={clearMessages}>&times;</button>
		</div>
	{/if}

	<!-- Section 1: Key Status -->
	<div class="key-section">
		<div class="section-title">
			<h4>Key Status</h4>
		</div>
		{#if hasEncryptionKeys}
			<p class="status-line status-ok">Encryption keys are active.</p>
		{:else}
			<p class="status-line status-warn">No encryption keys found.</p>
			<button class="btn primary" onclick={generateKeys} disabled={loading}>
				{#if loading}
					<span class="btn-spinner"></span> Generating...
				{:else}
					Generate Encryption Keys
				{/if}
			</button>
		{/if}
	</div>

	<!-- Section 2: Backup PIN -->
	<div class="key-section">
		<div class="section-title">
			<h4>Backup PIN</h4>
			<p>A 6-digit PIN used to encrypt your key backups on the server</p>
		</div>

		{#if pinLoading}
			<p class="status-line">Checking PIN status...</p>
		{:else if hasPin && !changingPin}
			<p class="status-line status-ok">PIN is set &#x2705;</p>
			<button class="btn secondary" onclick={() => changingPin = true} disabled={loading}>
				Change PIN
			</button>
		{:else}
			<div class="form-group">
				<label for="pin-input">PIN</label>
				<input
					id="pin-input"
					type="password"
					inputmode="numeric"
					pattern="[0-9]*"
					maxlength="6"
					bind:value={pin}
					placeholder="6-digit PIN"
					disabled={loading}
				/>
			</div>
			<div class="form-group">
				<label for="confirm-pin-input">Confirm PIN</label>
				<input
					id="confirm-pin-input"
					type="password"
					inputmode="numeric"
					pattern="[0-9]*"
					maxlength="6"
					bind:value={confirmPin}
					placeholder="Confirm PIN"
					disabled={loading}
				/>
			</div>
			<div class="btn-row">
				<button
					class="btn primary"
					onclick={setPin}
					disabled={loading || pin.length !== 6 || confirmPin.length !== 6}
				>
					{#if loading}
						<span class="btn-spinner"></span> Setting...
					{:else}
						{hasPin ? 'Update PIN' : 'Set PIN'}
					{/if}
				</button>
				{#if changingPin}
					<button class="btn secondary" onclick={() => { changingPin = false; pin = ''; confirmPin = ''; }} disabled={loading}>
						Cancel
					</button>
				{/if}
			</div>
		{/if}
	</div>

	<!-- Section 3: Server Backup -->
	<div class="key-section">
		<div class="section-title">
			<h4>Server Backup</h4>
			<p>Encrypted backup of your keys stored on the server</p>
		</div>

		{#if backupLoading}
			<p class="status-line">Checking backup status...</p>
		{:else if hasBackup}
			<p class="status-line status-ok">Server backup exists.</p>
		{:else}
			<p class="status-line status-warn">No server backup found.</p>
		{/if}

		{#if hasEncryptionKeys}
			<div class="backup-action">
				<h5>Back Up Now</h5>
				<div class="form-group">
					<label for="backup-pin-input">PIN</label>
					<input
						id="backup-pin-input"
						type="password"
						inputmode="numeric"
						pattern="[0-9]*"
						maxlength="6"
						bind:value={backupPin}
						placeholder="6-digit PIN"
						disabled={loading}
					/>
				</div>
				<button
					class="btn primary"
					onclick={backupToServer}
					disabled={loading || backupPin.length !== 6}
				>
					{#if loading}
						<span class="btn-spinner"></span> Backing Up...
					{:else}
						Back Up Now
					{/if}
				</button>
			</div>
		{/if}

		<div class="backup-action">
			<h5>Restore from Server</h5>
			<div class="form-group">
				<label for="restore-pin-input">PIN</label>
				<input
					id="restore-pin-input"
					type="password"
					inputmode="numeric"
					pattern="[0-9]*"
					maxlength="6"
					bind:value={restorePin}
					placeholder="6-digit PIN"
					disabled={loading}
				/>
			</div>
			<button
				class="btn secondary"
				onclick={restoreFromServer}
				disabled={loading || restorePin.length !== 6}
			>
				{#if loading}
					<span class="btn-spinner"></span> Restoring...
				{:else}
					Restore from Server
				{/if}
			</button>
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
		margin-bottom: 1rem;
	}

	.section-title h4 {
		margin: 0 0 0.25rem 0;
		font-size: 1rem;
		font-weight: 600;
		color: var(--color-text-primary);
	}

	.section-title p {
		margin: 0;
		color: var(--color-text-secondary);
		font-size: 0.875rem;
	}

	.status-line {
		font-size: 0.875rem;
		margin: 0 0 1rem 0;
		color: var(--color-text-secondary);
	}

	.status-ok {
		color: var(--color-success);
	}

	.status-warn {
		color: #d97706;
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

	.form-group input {
		width: 100%;
		max-width: 200px;
		padding: 0.75rem;
		border: 1px solid var(--color-border);
		border-radius: 0.375rem;
		background: var(--color-bg-primary);
		color: var(--color-text-primary);
		font-size: 1rem;
		letter-spacing: 0.25em;
		box-sizing: border-box;
	}

	.form-group input:focus {
		outline: none;
		border-color: var(--color-primary-500);
		box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
	}

	.btn-row {
		display: flex;
		gap: 0.75rem;
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
		display: inline-block;
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

	.backup-action {
		margin-top: 1.5rem;
		padding-top: 1.5rem;
		border-top: 1px solid var(--color-border);
	}

	.backup-action h5 {
		margin: 0 0 0.75rem 0;
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--color-text-primary);
	}
</style>
