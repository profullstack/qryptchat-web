<script>
	import { user } from '$lib/stores/auth.js';
	import { onMount } from 'svelte';

	let isChecking = false;
	let statusResults = '';
	let showStatus = false;

	async function checkAllUsersKeyStatus() {
		if (isChecking) return;
		
		isChecking = true;
		statusResults = 'Checking key reset status for all users...';
		showStatus = true;

		try {
			// Get all users who have public keys
			const response = await fetch('/api/crypto/public-keys/all');
			if (!response.ok) {
				throw new Error(`Failed to fetch user keys: ${response.statusText}`);
			}

			const allKeys = await response.json();
			console.log('🔍 All user keys:', allKeys);

			if (!allKeys || allKeys.length === 0) {
				statusResults = '❌ No users found with public keys';
				return;
			}

			let statusReport = `📊 Key Reset Status Report (${new Date().toLocaleString()})\n\n`;
			
			for (const userKey of allKeys) {
				const userId = userKey.user_id;
				const publicKey = userKey.public_key;
				const isCurrentUser = userId === $user?.id;
				
				statusReport += `👤 User: ${userId}${isCurrentUser ? ' (YOU)' : ''}\n`;
				
				if (!publicKey) {
					statusReport += `   ❌ No public key found\n`;
				} else {
					statusReport += `   🔑 Public key: ${publicKey.substring(0, 20)}...\n`;
					statusReport += `   📏 Key length: ${publicKey.length} chars\n`;
					
					// Try to determine if this looks like a fresh key
					// Fresh keys should be base64 encoded and around 2100+ chars for ML-KEM-1024
					if (publicKey.length > 1000 && publicKey.match(/^[A-Za-z0-9+/=]+$/)) {
						statusReport += `   ✅ Key appears valid (proper format and length)\n`;
					} else {
						statusReport += `   ⚠️ Key may be corrupted (unusual format or length)\n`;
					}
				}
				statusReport += '\n';
			}

			statusReport += `\n🎯 RECOMMENDATION:\n`;
			statusReport += `If any user shows "Key may be corrupted", they should use the NUCLEAR Key Reset.\n`;
			statusReport += `Both users in a conversation MUST have valid keys for encryption to work.\n`;

			statusResults = statusReport;

		} catch (error) {
			console.error('Failed to check key status:', error);
			const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
			statusResults = `❌ Failed to check key status: ${errorMessage}`;
		} finally {
			isChecking = false;
		}
	}

	onMount(() => {
		// Auto-check on mount
		checkAllUsersKeyStatus();
	});
</script>

<div class="key-reset-status">
	<div class="status-header">
		<h4>📊 Multi-User Key Status</h4>
		<p class="status-description">
			Check if all users have completed their key resets. Both users must have valid keys for encryption to work.
		</p>
	</div>

	<div class="status-actions">
		<button
			class="check-status-button"
			on:click={checkAllUsersKeyStatus}
			disabled={isChecking}
		>
			{#if isChecking}
				🔄 Checking Status...
			{:else}
				🔍 Check All Users Key Status
			{/if}
		</button>
	</div>

	{#if showStatus && statusResults}
		<div class="status-results">
			<pre class="status-content">{statusResults}</pre>
		</div>
	{/if}
</div>

<style>
	.key-reset-status {
		background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);
		border-radius: 12px;
		padding: 20px;
		color: white;
		margin: 20px 0;
	}

	.status-header h4 {
		margin: 0 0 8px 0;
		font-size: 1.2em;
		font-weight: 600;
	}

	.status-description {
		margin: 0 0 16px 0;
		opacity: 0.9;
		line-height: 1.4;
		font-size: 0.95em;
	}

	.status-actions {
		margin: 16px 0;
	}

	.check-status-button {
		background: rgba(255, 255, 255, 0.2);
		border: 2px solid rgba(255, 255, 255, 0.3);
		color: white;
		padding: 10px 20px;
		border-radius: 8px;
		font-size: 1em;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.3s ease;
	}

	.check-status-button:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.3);
		border-color: rgba(255, 255, 255, 0.5);
		transform: translateY(-1px);
	}

	.check-status-button:disabled {
		opacity: 0.7;
		cursor: not-allowed;
	}

	.status-results {
		background: rgba(255, 255, 255, 0.1);
		border-radius: 8px;
		padding: 16px;
		margin-top: 16px;
	}

	.status-content {
		background: rgba(0, 0, 0, 0.2);
		border-radius: 6px;
		padding: 12px;
		font-family: 'Courier New', monospace;
		font-size: 0.85em;
		line-height: 1.4;
		white-space: pre-wrap;
		margin: 0;
		overflow-x: auto;
		color: #e8f5e8;
	}
</style>