<script>
	import { onMount } from 'svelte';
	import { postQuantumEncryption } from '$lib/crypto/post-quantum-encryption.js';
	import { privateKeyManager } from '$lib/crypto/private-key-manager.js';
	import { browser } from '$app/environment';

	let showWarning = $state(false);
	let hasKeys = $state(false);
	let checking = $state(true);
	let hasServerBackup = $state(false);
	let showRestoreForm = $state(false);
	let restorePassword = $state('');
	let showRestorePassword = $state(false);
	let restoring = $state(false);
	let restoreError = $state('');
	let restoreSuccess = $state('');

	onMount(async () => {
		if (!browser) return;

		try {
			// Check if user has encryption keys
			await postQuantumEncryption.initialize();
			const publicKey = await postQuantumEncryption.getPublicKey();
			hasKeys = !!publicKey;
			showWarning = !hasKeys;

			// If no local keys, check for server backup
			if (!hasKeys) {
				hasServerBackup = await privateKeyManager.hasServerBackup();
			}
		} catch (error) {
			console.error('Failed to check encryption keys:', error);
			showWarning = true;
			hasKeys = false;
		} finally {
			checking = false;
		}
	});

	function dismissWarning() {
		showWarning = false;
	}

	async function restoreFromServer() {
		if (!restorePassword || restorePassword.trim().length === 0) {
			restoreError = 'Please enter your backup password';
			return;
		}

		try {
			restoring = true;
			restoreError = '';

			await privateKeyManager.restoreKeysFromServer(restorePassword);

			hasKeys = true;
			showWarning = false;
			restoreSuccess = 'Keys restored successfully!';
			restorePassword = '';
		} catch (err) {
			console.error('Failed to restore keys from server:', err);
			restoreError = err.message || 'Failed to restore keys. Check your password and try again.';
		} finally {
			restoring = false;
		}
	}
</script>

{#if showWarning && !checking}
	<div class="encryption-warning" role="alert">
		<div class="warning-content">
			<div class="warning-icon">🔐</div>
			<div class="warning-text">
				<h4>Encryption Not Set Up</h4>
				<p>
					You haven't set up end-to-end encryption yet. Without encryption keys, 
					you won't be able to send or receive secure messages.
				</p>
			</div>
		</div>
		
		<div class="warning-actions">
			{#if hasServerBackup && !showRestoreForm}
				<button class="btn primary" onclick={() => showRestoreForm = true}>
					☁️ Restore from Server Backup
				</button>
			{/if}
			<a href="/settings" class="btn {hasServerBackup ? 'secondary' : 'primary'}">
				🔑 Set Up Encryption
			</a>
			<button class="btn secondary" onclick={dismissWarning}>
				Dismiss
			</button>
		</div>

		{#if showRestoreForm}
			<div class="restore-form">
				<p><strong>Enter your backup password to restore your keys:</strong></p>
				{#if restoreError}
					<div class="restore-error">{restoreError}</div>
				{/if}
				<div class="restore-input-row">
					<div class="password-input">
						<input
							type={showRestorePassword ? 'text' : 'password'}
							bind:value={restorePassword}
							placeholder="Backup password"
							disabled={restoring}
						/>
						<button
							type="button"
							class="toggle-password-btn"
							onclick={() => showRestorePassword = !showRestorePassword}
						>
							{showRestorePassword ? '👁️' : '👁️‍🗨️'}
						</button>
					</div>
					<button
						class="btn primary"
						onclick={restoreFromServer}
						disabled={restoring || !restorePassword}
					>
						{restoring ? 'Restoring...' : 'Restore'}
					</button>
				</div>
			</div>
		{/if}

		<div class="warning-details">
			<p><strong>What you can do:</strong></p>
			<ul>
				{#if hasServerBackup}
					<li><strong>Restore from server:</strong> You have a backup on the server - restore with your password</li>
				{/if}
				<li><strong>Generate new keys:</strong> Create fresh encryption keys in Settings</li>
				<li><strong>Import existing keys:</strong> If you have keys from another device, import them in Settings</li>
				<li><strong>Skip for now:</strong> You can set up encryption later, but messages won't be encrypted</li>
			</ul>
		</div>
	</div>
{/if}

<style>
	.encryption-warning {
		background: linear-gradient(135deg, #fef3cd 0%, #fde68a 100%);
		border: 1px solid #f59e0b;
		border-radius: 0.75rem;
		padding: 1.5rem;
		margin: 1rem 0;
		box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
	}
	
	.warning-content {
		display: flex;
		align-items: flex-start;
		gap: 1rem;
		margin-bottom: 1rem;
	}
	
	.warning-icon {
		font-size: 1.5rem;
		flex-shrink: 0;
		margin-top: 0.125rem;
	}
	
	.warning-text h4 {
		margin: 0 0 0.5rem 0;
		font-size: 1.125rem;
		font-weight: 600;
		color: #92400e;
	}
	
	.warning-text p {
		margin: 0;
		font-size: 0.875rem;
		color: #92400e;
		line-height: 1.5;
	}
	
	.warning-actions {
		display: flex;
		gap: 0.75rem;
		margin-bottom: 1rem;
		flex-wrap: wrap;
	}
	
	.btn {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.625rem 1.25rem;
		border: none;
		border-radius: 0.375rem;
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s ease;
		text-decoration: none;
		white-space: nowrap;
	}
	
	.btn.primary {
		background: #f59e0b;
		color: white;
	}
	
	.btn.primary:hover {
		background: #d97706;
	}
	
	.btn.secondary {
		background: transparent;
		color: #92400e;
		border: 1px solid #f59e0b;
	}
	
	.btn.secondary:hover {
		background: rgba(245, 158, 11, 0.1);
	}
	
	.warning-details {
		padding: 1rem;
		background: rgba(255, 255, 255, 0.5);
		border-radius: 0.5rem;
		border: 1px solid rgba(245, 158, 11, 0.3);
	}
	
	.warning-details p {
		margin: 0 0 0.75rem 0;
		font-size: 0.875rem;
		font-weight: 600;
		color: #92400e;
	}
	
	.warning-details ul {
		margin: 0;
		padding-left: 1.25rem;
		font-size: 0.8125rem;
		color: #92400e;
		line-height: 1.5;
	}
	
	.warning-details li {
		margin-bottom: 0.5rem;
	}
	
	.warning-details li:last-child {
		margin-bottom: 0;
	}
	
	.warning-details strong {
		font-weight: 600;
	}
	
	.restore-form {
		margin-bottom: 1rem;
		padding: 1rem;
		background: rgba(255, 255, 255, 0.5);
		border-radius: 0.5rem;
		border: 1px solid rgba(245, 158, 11, 0.3);
	}

	.restore-form p {
		margin: 0 0 0.75rem 0;
		font-size: 0.875rem;
		color: #92400e;
	}

	.restore-error {
		margin-bottom: 0.75rem;
		padding: 0.5rem 0.75rem;
		background: rgba(239, 68, 68, 0.1);
		border: 1px solid rgba(239, 68, 68, 0.3);
		border-radius: 0.375rem;
		font-size: 0.8125rem;
		color: #dc2626;
	}

	.restore-input-row {
		display: flex;
		gap: 0.75rem;
		align-items: flex-start;
	}

	.password-input {
		flex: 1;
		position: relative;
		display: flex;
		align-items: center;
	}

	.password-input input {
		width: 100%;
		padding: 0.625rem 2.5rem 0.625rem 0.75rem;
		border: 1px solid #d97706;
		border-radius: 0.375rem;
		font-size: 0.875rem;
		background: white;
		color: #1f2937;
	}

	.password-input input:focus {
		outline: none;
		border-color: #f59e0b;
		box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.2);
	}

	.toggle-password-btn {
		position: absolute;
		right: 0.5rem;
		background: none;
		border: none;
		cursor: pointer;
		font-size: 0.875rem;
		padding: 0.25rem;
	}

	/* Responsive design */
	@media (max-width: 640px) {
		.encryption-warning {
			margin: 0.75rem 0;
			padding: 1rem;
		}
		
		.warning-content {
			gap: 0.75rem;
		}
		
		.warning-actions {
			flex-direction: column;
		}
		
		.btn {
			justify-content: center;
		}

		.restore-input-row {
			flex-direction: column;
		}
	}
</style>