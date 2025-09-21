<script>
	import { user } from '$lib/stores/auth.js';
	import { postQuantumEncryption } from '$lib/crypto/post-quantum-encryption.js';
	import { publicKeyService } from '$lib/crypto/public-key-service.js';

	let isResetting = false;
	let resetStatus = '';
	let resetComplete = false;
	let keyStatus = '';
	let showKeyStatus = false;

	// Check current key status
	async function checkKeyStatus() {
		showKeyStatus = true;
		try {
			// Initialize the encryption service if needed
			await postQuantumEncryption.initialize();
			
			// Try to get ML-KEM-1024 keys
			let mlKemKeys = null;
			try {
				mlKemKeys = await postQuantumEncryption.getUserKeys();
			} catch (e) {
				console.warn('Failed to get ML-KEM-1024 keys:', e);
			}
			
			// Try to get ML-KEM-768 keys (for backward compatibility)
			let mlKem768Keys = null;
			try {
				mlKem768Keys = await postQuantumEncryption.getUserKeys768();
			} catch (e) {
				console.warn('Failed to get ML-KEM-768 keys:', e);
			}
			
			// Check if any keys exist
			if (!mlKemKeys && !mlKem768Keys) {
				keyStatus = '❌ No encryption keys found - Reset required';
				return;
			}
			
			let keyInfo = [];
			
			// Check ML-KEM-1024 key
			if (mlKemKeys && mlKemKeys.publicKey && mlKemKeys.privateKey) {
				// Check if key has KYBER header
				const hasKyberHeader = mlKemKeys.publicKey.startsWith('S1lCRVIx'); // Base64 for "KYBER1"
				
				if (hasKyberHeader) {
					keyInfo.push('⚠️ ML-KEM-1024 key: Has KYBER header (incompatible format)');
				} else {
					keyInfo.push('✅ ML-KEM-1024 key: Valid format (no KYBER header)');
				}
			} else {
				keyInfo.push('❓ ML-KEM-1024 key: Not found');
			}
			
			// Check ML-KEM-768 key
			if (mlKem768Keys && mlKem768Keys.publicKey && mlKem768Keys.privateKey) {
				// Check if key has KYBER header
				const hasKyberHeader = mlKem768Keys.publicKey.startsWith('S1lCRVIx'); // Base64 for "KYBER1"
				
				if (hasKyberHeader) {
					keyInfo.push('⚠️ ML-KEM-768 key: Has KYBER header (incompatible format)');
				} else {
					keyInfo.push('✅ ML-KEM-768 key: Valid format (no KYBER header)');
				}
			} else {
				keyInfo.push('❓ ML-KEM-768 key: Not found');
			}
			
			// Check if public key is in database
			let dbKeyStatus = '❓ Database key status: Unknown';
			try {
				// Get current user from user store
				const userId = $user?.id;
				
				if (userId) {
					const publicKeyExists = await publicKeyService.hasUserPublicKey(userId);
					if (publicKeyExists) {
						dbKeyStatus = '✅ Database key status: Public key found in database';
					} else {
						dbKeyStatus = '❌ Database key status: Public key NOT found in database';
					}
				} else {
					dbKeyStatus = '⚠️ Database key status: Cannot check - no user ID available';
				}
			} catch (e) {
				dbKeyStatus = '⚠️ Database key status: Failed to check';
			}
			keyInfo.push(dbKeyStatus);
			
			// Format the status message
			const hasKyber = keyInfo.some(info => info.includes('KYBER header'));
			if (hasKyber) {
				keyStatus = `⚠️ KYBER headers detected - Nuclear Reset REQUIRED:\n${keyInfo.join('\n')}`;
			} else if (keyInfo.some(info => info.startsWith('✅'))) {
				keyStatus = `🔑 Current keys (last checked: ${new Date().toLocaleString()}):\n${keyInfo.join('\n')}`;
			} else {
				keyStatus = `⚠️ No valid keys found - Reset REQUIRED:\n${keyInfo.join('\n')}`;
			}
			
		} catch (error) {
			keyStatus = `❌ Error checking keys: ${error instanceof Error ? error.message : 'Unknown error'}`;
		}
	}

	async function performCompleteKeyReset() {
		if (isResetting) return;
		
		// Check if user is available
		if (!$user?.id) {
			resetStatus = '❌ User not authenticated';
			return;
		}
		
		isResetting = true;
		resetStatus = 'Starting NUCLEAR key reset...';
		resetComplete = false;

		try {
			// Step 1: Clear ALL existing keys from storage (IndexedDB)
			resetStatus = '🧹 Clearing all existing keys...';
			await postQuantumEncryption.clearUserKeys();
			console.log('🧹 Cleared all encryption keys from IndexedDB');
			await new Promise(resolve => setTimeout(resolve, 500));

			// Step 2: Clear public key cache FIRST to prevent stale key retrieval
			resetStatus = '🧹 Clearing public key cache...';
			publicKeyService.clearCache();
			console.log('🧹 Cleared public key cache');
			await new Promise(resolve => setTimeout(resolve, 500));

			// Step 3: Generate fresh ML-KEM keypair using native ML-KEM implementation
			resetStatus = '🔑 Generating fresh ML-KEM-1024 keypair...';
			
			// Use the post-quantum encryption service to generate clean keys
			// This generates keys without KYBER headers that were causing encryption failures
			await postQuantumEncryption.clearUserKeys(); // Make sure to clear any existing keys
			const generatedKeys = await postQuantumEncryption.generateUserKeys();
			
			// Format the keys in the expected format
			const newKeypair = {
				publicKey: generatedKeys.publicKey,
				privateKey: generatedKeys.privateKey
			};
			
			console.log('🔑 Generated new keypair using native ML-KEM implementation:', {
				publicKeyLength: newKeypair.publicKey?.length,
				privateKeyLength: newKeypair.privateKey?.length,
				userId: $user.id
			});
			await new Promise(resolve => setTimeout(resolve, 500));

			// Step 4: Validate the generated keypair
			resetStatus = '🔍 Validating generated keypair...';
			if (!newKeypair.publicKey || !newKeypair.privateKey) {
				throw new Error('Generated keypair is invalid - missing keys');
			}
			if (typeof newKeypair.publicKey !== 'string' || typeof newKeypair.privateKey !== 'string') {
				throw new Error('Generated keypair is invalid - keys are not strings');
			}
			console.log('🔍 Keypair validation passed');
			await new Promise(resolve => setTimeout(resolve, 500));

			// Step 5: Verify keys are stored correctly in IndexedDB
			resetStatus = '💾 Verifying keys are stored correctly...';
			
			// The keys are already stored in IndexedDB by the postQuantumEncryption.generateUserKeys() method
			// Let's verify they're there by trying to retrieve them
			const storedKeys = await postQuantumEncryption.getUserKeys();
			
			if (!storedKeys || !storedKeys.publicKey || !storedKeys.privateKey) {
				throw new Error('Failed to verify stored keys in IndexedDB');
			}
			
			console.log('💾 Verified keys are correctly stored in IndexedDB:', {
				publicKeyLength: storedKeys.publicKey.length,
				storedTimestamp: new Date().toISOString()
			});
			
			await new Promise(resolve => setTimeout(resolve, 500));

			// Step 6: Force delete old database entry first
			resetStatus = '🗑️ FORCE deleting old database keys...';
			try {
				const deleteResponse = await fetch('/api/keys/delete', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json'
					}
				});
				const deleteResult = await deleteResponse.text();
				console.log('🗑️ Delete response:', deleteResult);
			} catch (deleteError) {
				console.warn('Failed to delete old keys (may not exist):', deleteError);
			}
			await new Promise(resolve => setTimeout(resolve, 1000));

			// Step 7: Update database with new public key via server API
			resetStatus = '🗄️ FORCE updating database with new public key...';
			const response = await fetch('/api/keys/reset', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					publicKey: newKeypair.publicKey
				})
			});

			if (!response.ok) {
				const errorText = await response.text();
				console.error('🗄️ Database update failed:', errorText);
				throw new Error(`Database update failed: ${errorText}`);
			}
			
			const responseData = await response.json();
			console.log('🗄️ Database update SUCCESS:', responseData);
			await new Promise(resolve => setTimeout(resolve, 1000));

			// Step 8: Clear public key cache AGAIN to ensure fresh retrieval
			resetStatus = '🧹 Final cache clear...';
			publicKeyService.clearCache();
			console.log('🧹 Final cache clear complete');
			await new Promise(resolve => setTimeout(resolve, 500));

			// Step 9: AGGRESSIVE verification - fetch the key back multiple ways
			resetStatus = '🔍 AGGRESSIVE database verification...';
			let verificationPassed = false;
			
			try {
				// Method 1: Direct API call
				const verifyResponse = await fetch(`/api/crypto/public-keys?user_id=${encodeURIComponent($user.id)}`);
				if (verifyResponse.ok) {
					const verifyData = await verifyResponse.json();
					console.log('🔍 Verification data:', verifyData);
					if (verifyData.public_key === newKeypair.publicKey) {
						console.log('✅ Database verification PASSED - key matches');
						verificationPassed = true;
					} else {
						console.error('❌ Database verification FAILED - key mismatch');
						console.error('Expected:', newKeypair.publicKey.substring(0, 50) + '...');
						console.error('Got:', verifyData.public_key?.substring(0, 50) + '...');
					}
				} else {
					console.error('❌ Verification request failed:', await verifyResponse.text());
				}
			} catch (verifyError) {
				console.error('❌ Verification error:', verifyError);
			}
			
			if (!verificationPassed) {
				throw new Error('Database verification failed - key was not stored correctly');
			}
			
			await new Promise(resolve => setTimeout(resolve, 500));

			// Step 10: Success with detailed info
			resetStatus = `✅ NUCLEAR key reset SUCCESSFUL for user ${$user.id}!`;
			resetComplete = true;
			console.log('🎉 NUCLEAR KEY RESET COMPLETE:', {
				userId: $user.id,
				publicKeyPreview: newKeypair.publicKey.substring(0, 50) + '...',
				timestamp: new Date().toISOString()
			});

		} catch (error) {
			console.error('💥 NUCLEAR key reset FAILED:', error);
			const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
			resetStatus = `💥 NUCLEAR key reset FAILED: ${errorMessage}`;
		} finally {
			isResetting = false;
		}
	}

	function refreshPage() {
		window.location.reload();
	}
</script>

<div class="complete-key-reset">
	<div class="reset-header">
		<h3>💥 NUCLEAR Key Reset</h3>
		<div class="critical-notice">
			🚨 <strong>CRITICAL:</strong> Both users in a conversation MUST use this tool!
			<br>If only one person resets their keys, messages will still fail to decrypt.
			<br><strong>Coordinate with the other user to do this at the same time!</strong>
		</div>
		<div class="nuclear-warning">
			⚡ This is the NUCLEAR option - it will completely wipe and regenerate all encryption keys.
			<br>Use this when normal key reset fails and you're still getting encryption errors.
		</div>
		<p class="reset-description">
			This will generate completely fresh encryption keys with aggressive database cleanup.
			<strong>All future messages will work perfectly after BOTH users reset.</strong>
			Old messages may remain unreadable (expected with fresh keys).
		</p>
	</div>

	<div class="reset-actions">
		<button
			class="check-keys-button"
			on:click={checkKeyStatus}
			disabled={isResetting}
		>
			🔍 Check Current Key Status
		</button>
		
		<button
			class="reset-button nuclear"
			on:click={performCompleteKeyReset}
			disabled={isResetting}
		>
			{#if isResetting}
				💥 NUCLEAR Reset in Progress...
			{:else}
				💥 NUCLEAR Key Reset
			{/if}
		</button>
	</div>

	{#if showKeyStatus && keyStatus}
		<div class="key-status">
			<h4>🔑 Key Status</h4>
			<pre class="status-content">{keyStatus}</pre>
		</div>
	{/if}

	{#if resetStatus}
		<div class="reset-status">
			<div class="status-message">
				{resetStatus}
			</div>
			
			{#if resetComplete}
				<div class="success-actions">
					<button class="refresh-button" on:click={refreshPage}>
						🔄 Refresh Page to Apply Changes
					</button>
					<div class="success-note">
						✨ Your encryption keys have been completely regenerated!
						New messages will encrypt and decrypt perfectly.
					</div>
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.complete-key-reset {
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		border-radius: 12px;
		padding: 24px;
		color: white;
		margin: 20px 0;
	}

	.reset-header h3 {
		margin: 0 0 12px 0;
		font-size: 1.4em;
		font-weight: 600;
	}

	.critical-notice {
		background: rgba(255, 193, 7, 0.2);
		border: 2px solid rgba(255, 193, 7, 0.4);
		border-radius: 8px;
		padding: 12px;
		margin: 12px 0;
		font-weight: 600;
		color: #fff3cd;
	}

	.nuclear-warning {
		background: rgba(255, 87, 34, 0.2);
		border: 2px solid rgba(255, 87, 34, 0.4);
		border-radius: 8px;
		padding: 12px;
		margin: 12px 0;
		font-weight: 600;
		color: #ffccbc;
		animation: pulse 2s infinite;
	}

	@keyframes pulse {
		0% { opacity: 1; }
		50% { opacity: 0.7; }
		100% { opacity: 1; }
	}

	.reset-description {
		margin: 0 0 20px 0;
		opacity: 0.9;
		line-height: 1.5;
	}

	.reset-actions {
		margin: 20px 0;
		display: flex;
		gap: 12px;
		flex-wrap: wrap;
	}

	.check-keys-button {
		background: rgba(255, 255, 255, 0.1);
		border: 2px solid rgba(255, 255, 255, 0.2);
		color: white;
		padding: 10px 20px;
		border-radius: 8px;
		font-size: 1em;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.3s ease;
	}

	.check-keys-button:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.2);
		border-color: rgba(255, 255, 255, 0.4);
		transform: translateY(-1px);
	}

	.reset-button {
		background: rgba(255, 255, 255, 0.2);
		border: 2px solid rgba(255, 255, 255, 0.3);
		color: white;
		padding: 12px 24px;
		border-radius: 8px;
		font-size: 1.1em;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.3s ease;
	}

	.reset-button:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.3);
		border-color: rgba(255, 255, 255, 0.5);
		transform: translateY(-2px);
	}

	.reset-button.nuclear {
		background: linear-gradient(45deg, rgba(255, 87, 34, 0.3), rgba(244, 67, 54, 0.3));
		border: 2px solid rgba(255, 87, 34, 0.5);
		animation: nuclear-glow 3s infinite;
		font-weight: 700;
		text-shadow: 0 0 10px rgba(255, 87, 34, 0.5);
	}

	.reset-button.nuclear:hover:not(:disabled) {
		background: linear-gradient(45deg, rgba(255, 87, 34, 0.5), rgba(244, 67, 54, 0.5));
		border-color: rgba(255, 87, 34, 0.8);
		transform: translateY(-3px);
		box-shadow: 0 5px 15px rgba(255, 87, 34, 0.3);
	}

	@keyframes nuclear-glow {
		0% { box-shadow: 0 0 5px rgba(255, 87, 34, 0.3); }
		50% { box-shadow: 0 0 20px rgba(255, 87, 34, 0.6); }
		100% { box-shadow: 0 0 5px rgba(255, 87, 34, 0.3); }
	}

	.reset-button:disabled,
	.check-keys-button:disabled {
		opacity: 0.7;
		cursor: not-allowed;
	}

	.key-status {
		background: rgba(255, 255, 255, 0.1);
		border-radius: 8px;
		padding: 16px;
		margin-top: 20px;
	}

	.key-status h4 {
		margin: 0 0 12px 0;
		font-size: 1.1em;
		font-weight: 600;
	}

	.status-content {
		background: rgba(0, 0, 0, 0.2);
		border-radius: 6px;
		padding: 12px;
		font-family: 'Courier New', monospace;
		font-size: 0.9em;
		line-height: 1.4;
		white-space: pre-wrap;
		margin: 0;
		overflow-x: auto;
	}

	.reset-status {
		background: rgba(255, 255, 255, 0.1);
		border-radius: 8px;
		padding: 16px;
		margin-top: 20px;
	}

	.status-message {
		font-weight: 500;
		margin-bottom: 12px;
	}

	.success-actions {
		margin-top: 16px;
	}

	.refresh-button {
		background: #4CAF50;
		border: none;
		color: white;
		padding: 10px 20px;
		border-radius: 6px;
		font-weight: 600;
		cursor: pointer;
		margin-bottom: 12px;
		transition: background 0.3s ease;
	}

	.refresh-button:hover {
		background: #45a049;
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