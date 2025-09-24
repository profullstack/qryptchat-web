<script>
	import { onMount } from 'svelte';
	import { postQuantumEncryption } from '$lib/crypto/post-quantum-encryption.js';
	import { browser } from '$app/environment';
	
	let showWarning = $state(false);
	let hasKeys = $state(false);
	let checking = $state(true);
	
	onMount(async () => {
		if (!browser) return;
		
		try {
			// Check if user has encryption keys
			await postQuantumEncryption.initialize();
			const publicKey = await postQuantumEncryption.getPublicKey();
			hasKeys = !!publicKey;
			showWarning = !hasKeys;
		} catch (error) {
			console.error('Failed to check encryption keys:', error);
			// If we can't check, assume no keys and show warning
			showWarning = true;
			hasKeys = false;
		} finally {
			checking = false;
		}
	});
	
	function dismissWarning() {
		showWarning = false;
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
			<a href="/settings" class="btn primary">
				🔑 Set Up Encryption
			</a>
			<button class="btn secondary" onclick={dismissWarning}>
				Dismiss
			</button>
		</div>
		
		<div class="warning-details">
			<p><strong>What you can do:</strong></p>
			<ul>
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
	}
</style>