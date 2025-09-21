<script>
	import { user } from '$lib/stores/auth.js';
	
	let isDeleting = false;
	let deleteStatus = '';
	let deleteComplete = false;
	let showConfirmation = false;
	
	/**
	 * Delete all conversations and messages with legacy encryption formats
	 * This is a nuclear option that will permanently delete data
	 */
	async function deleteLegacyChats() {
		if (!$user?.id || isDeleting || !showConfirmation) return;
		
		isDeleting = true;
		deleteStatus = '🔥 Starting legacy data deletion...';
		deleteComplete = false;
		
		try {
			// Step 1: Delete all messages with non-ML-KEM-1024 encryption
			deleteStatus = '🗑️ Deleting legacy encrypted messages...';
			const messagesResponse = await fetch('/api/cleanup/legacy-messages', {
				method: 'DELETE',
				headers: {
					'Content-Type': 'application/json'
				},
				// Include credentials to ensure cookies are sent
				credentials: 'include'
			});
			
			if (!messagesResponse.ok) {
				throw new Error(`Failed to delete legacy messages: ${await messagesResponse.text()}`);
			}
			
			const messagesResult = await messagesResponse.json();
			console.log('🗑️ Deleted legacy messages:', messagesResult);
			await new Promise(resolve => setTimeout(resolve, 500));
			
			// Step 2: Delete all conversations with no messages left
			deleteStatus = '🗑️ Cleaning up empty conversations...';
			const convsResponse = await fetch('/api/cleanup/empty-conversations', {
				method: 'DELETE',
				headers: {
					'Content-Type': 'application/json'
				},
				credentials: 'include'
			});
			
			if (!convsResponse.ok) {
				throw new Error(`Failed to clean up empty conversations: ${await convsResponse.text()}`);
			}
			
			const convsResult = await convsResponse.json();
			console.log('🗑️ Cleaned up empty conversations:', convsResult);
			await new Promise(resolve => setTimeout(resolve, 500));
			
			// Step 3: Delete legacy public keys
			deleteStatus = '🗑️ Deleting legacy public keys...';
			const keysResponse = await fetch('/api/cleanup/legacy-keys', {
				method: 'DELETE',
				headers: {
					'Content-Type': 'application/json'
				},
				credentials: 'include'
			});
			
			if (!keysResponse.ok) {
				throw new Error(`Failed to delete legacy keys: ${await keysResponse.text()}`);
			}
			
			const keysResult = await keysResponse.json();
			console.log('🗑️ Deleted legacy keys:', keysResult);
			
			// Success!
			deleteComplete = true;
			deleteStatus = `✅ Successfully deleted all legacy encrypted data!
			
			Messages deleted: ${messagesResult.deletedCount || '0'}
			Conversations cleaned: ${convsResult.deletedCount || '0'}
			Keys updated: ${keysResult.updatedCount || '0'}`;
			
			// Reset confirmation
			showConfirmation = false;
			
		} catch (error) {
			console.error('❌ Failed to delete legacy data:', error);
			deleteStatus = `❌ Error: ${error instanceof Error ? error.message : String(error)}`;
		} finally {
			isDeleting = false;
		}
	}
	
	function toggleConfirmation() {
		showConfirmation = !showConfirmation;
		if (!showConfirmation) {
			deleteStatus = '';
		}
	}
</script>

<div class="legacy-cleanup">
	<div class="cleanup-header">
		<h3>🔥 Delete Legacy Encrypted Data</h3>
		<div class="warning-box">
			⚠️ <strong>WARNING:</strong> This will permanently delete:
			<ul>
				<li>All messages encrypted with legacy methods (not ML-KEM-1024)</li>
				<li>Empty conversations after message deletion</li>
				<li>Legacy public keys for all users</li>
			</ul>
			<strong>This action cannot be undone!</strong>
		</div>
		<p class="cleanup-description">
			Use this tool to clean up old data that is incompatible with the new ML-KEM-1024 encryption format.
			This ensures all communication uses only the strongest post-quantum encryption.
		</p>
	</div>
	
	<div class="cleanup-actions">
		{#if !showConfirmation}
			<button class="confirm-button" on:click={toggleConfirmation}>
				🔥 Delete All Legacy Encrypted Data
			</button>
		{:else}
			<div class="confirmation-box">
				<p>Are you absolutely sure you want to delete all legacy encrypted data?</p>
				<div class="confirmation-buttons">
					<button 
						class="delete-button" 
						on:click={deleteLegacyChats} 
						disabled={isDeleting}
					>
						{#if isDeleting}
							🔥 Deleting...
						{:else}
							🔥 YES, DELETE EVERYTHING
						{/if}
					</button>
					<button class="cancel-button" on:click={toggleConfirmation} disabled={isDeleting}>
						Cancel
					</button>
				</div>
			</div>
		{/if}
	</div>
	
	{#if deleteStatus}
		<div class="status-box">
			<div class="status-message">
				{deleteStatus}
			</div>
			
			{#if deleteComplete}
				<div class="success-note">
					✨ All legacy encrypted data has been removed.
					Only ML-KEM-1024 encrypted data remains in your account.
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.legacy-cleanup {
		background: linear-gradient(135deg, #f44336 0%, #ff9800 100%);
		border-radius: 12px;
		padding: 24px;
		color: white;
		margin: 20px 0;
	}
	
	.cleanup-header h3 {
		margin: 0 0 16px 0;
		font-size: 1.4em;
		font-weight: 600;
	}
	
	.warning-box {
		background: rgba(0, 0, 0, 0.2);
		border: 2px solid rgba(255, 255, 255, 0.2);
		border-radius: 8px;
		padding: 12px;
		margin-bottom: 16px;
	}
	
	.warning-box ul {
		margin: 8px 0 8px 20px;
		padding: 0;
	}
	
	.warning-box li {
		margin-bottom: 4px;
	}
	
	.cleanup-description {
		margin: 0 0 20px 0;
		line-height: 1.5;
	}
	
	.cleanup-actions {
		margin: 20px 0;
	}
	
	.confirm-button {
		background: rgba(0, 0, 0, 0.3);
		border: 2px solid rgba(255, 255, 255, 0.3);
		color: white;
		padding: 12px 24px;
		border-radius: 8px;
		font-size: 1.1em;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.3s;
	}
	
	.confirm-button:hover {
		background: rgba(0, 0, 0, 0.4);
		transform: translateY(-2px);
	}
	
	.confirmation-box {
		background: rgba(0, 0, 0, 0.2);
		border: 2px solid rgba(255, 255, 255, 0.2);
		border-radius: 8px;
		padding: 16px;
		margin-bottom: 20px;
	}
	
	.confirmation-box p {
		font-weight: 600;
		margin-top: 0;
		margin-bottom: 16px;
	}
	
	.confirmation-buttons {
		display: flex;
		gap: 12px;
	}
	
	.delete-button {
		background: #d32f2f;
		border: none;
		color: white;
		padding: 12px 24px;
		border-radius: 8px;
		font-weight: 600;
		cursor: pointer;
		flex-grow: 1;
		transition: all 0.3s;
		animation: pulse 2s infinite;
	}
	
	.delete-button:hover:not(:disabled) {
		background: #b71c1c;
		transform: translateY(-2px);
	}
	
	.delete-button:disabled {
		opacity: 0.7;
		cursor: not-allowed;
	}
	
	@keyframes pulse {
		0% { box-shadow: 0 0 0 0 rgba(211, 47, 47, 0.7); }
		70% { box-shadow: 0 0 0 10px rgba(211, 47, 47, 0); }
		100% { box-shadow: 0 0 0 0 rgba(211, 47, 47, 0); }
	}
	
	.cancel-button {
		background: rgba(255, 255, 255, 0.2);
		border: none;
		color: white;
		padding: 12px 24px;
		border-radius: 8px;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.3s;
	}
	
	.cancel-button:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.3);
	}
	
	.cancel-button:disabled {
		opacity: 0.7;
		cursor: not-allowed;
	}
	
	.status-box {
		background: rgba(0, 0, 0, 0.2);
		border-radius: 8px;
		padding: 16px;
		margin-top: 20px;
	}
	
	.status-message {
		white-space: pre-line;
		line-height: 1.5;
		margin-bottom: 16px;
	}
	
	.success-note {
		background: rgba(76, 175, 80, 0.2);
		border: 1px solid rgba(76, 175, 80, 0.3);
		border-radius: 6px;
		padding: 12px;
		font-size: 0.9em;
		line-height: 1.4;
	}
</style>