<script>
	import { createSupabaseClient } from '$lib/supabase.js';
	
	const supabase = createSupabaseClient();
	
	let fixResult = $state('');
	let isRunning = $state(false);
	let copySuccess = $state(false);
	
	async function runKeyMigrationFix() {
		isRunning = true;
		fixResult = '';
		
		try {
			const results = [];
			results.push('🔧 [KEY MIGRATION FIX] Starting comprehensive key migration...');
			results.push('');
			
			// Step 1: Check current key status
			results.push('==================== STEP 1: Current Key Status ====================');
			const mlKemKeys = localStorage.getItem('ml-kem-keypair');
			const oldKeys = localStorage.getItem('qryptchat_pq_keypair');
			
			results.push(`🔍 [STATUS] ml-kem-keypair exists: ${!!mlKemKeys}`);
			results.push(`🔍 [STATUS] qryptchat_pq_keypair exists: ${!!oldKeys}`);
			
			// Step 2: Handle different scenarios
			if (!mlKemKeys && oldKeys) {
				results.push('');
				results.push('==================== STEP 2: Migrating Old Keys ====================');
				results.push('🔧 [MIGRATION] Copying qryptchat_pq_keypair to ml-kem-keypair...');
				
				try {
					// Copy old keys to new format
					localStorage.setItem('ml-kem-keypair', oldKeys);
					results.push('✅ [SUCCESS] Keys migrated successfully');
					
					// Verify the migration
					const newKeys = localStorage.getItem('ml-kem-keypair');
					if (newKeys === oldKeys) {
						results.push('✅ [VERIFY] Migration verified - keys are identical');
					} else {
						results.push('🚨 [ERROR] Migration verification failed');
					}
				} catch (error) {
					const err = error instanceof Error ? error : new Error(String(error));
					results.push(`🚨 [ERROR] Migration failed: ${err.message}`);
				}
			} else if (!mlKemKeys && !oldKeys) {
				results.push('');
				results.push('==================== STEP 2: No Keys Found - Generating New Keys ====================');
				results.push('🔧 [GENERATION] No keys found, generating new ML-KEM keypair...');
				
				try {
					// Import the post-quantum encryption service
					const { postQuantumEncryption } = await import('$lib/crypto/post-quantum-encryption.js');
					
					// Generate new keypair using the service
					const keypairData = await postQuantumEncryption.generateUserKeys();
					
					// Store in both formats
					const keypairJson = JSON.stringify(keypairData);
					localStorage.setItem('ml-kem-keypair', keypairJson);
					localStorage.setItem('qryptchat_pq_keypair', keypairJson);
					
					results.push('✅ [SUCCESS] New keypair generated and stored');
					results.push(`🔍 [INFO] Public key preview: ${keypairData.publicKey.substring(0, 50)}...`);
					
					// Update database with new public key
					const { data: { user }, error: authError } = await supabase.auth.getUser();
					if (!authError && user) {
						const { error: updateError } = await supabase
							.from('users')
							.update({ ml_kem_public_key: keypairData.publicKey })
							.eq('auth_user_id', user.id);
						
						if (updateError) {
							results.push(`⚠️ [WARNING] Failed to update database: ${updateError.message}`);
						} else {
							results.push('✅ [SUCCESS] Database updated with new public key');
						}
					}
				} catch (error) {
					const err = error instanceof Error ? error : new Error(String(error));
					results.push(`🚨 [ERROR] Key generation failed: ${err.message}`);
				}
			} else if (mlKemKeys && !oldKeys) {
				results.push('');
				results.push('==================== STEP 2: Copying New Keys to Old Format ====================');
				results.push('🔧 [MIGRATION] Copying ml-kem-keypair to qryptchat_pq_keypair...');
				
				try {
					if (mlKemKeys) {
						localStorage.setItem('qryptchat_pq_keypair', mlKemKeys);
						results.push('✅ [SUCCESS] Keys copied to old format');
					}
				} catch (error) {
					const err = error instanceof Error ? error : new Error(String(error));
					results.push(`🚨 [ERROR] Copy failed: ${err.message}`);
				}
			} else {
				results.push('');
				results.push('==================== STEP 2: Keys Already Present ====================');
				results.push('✅ [INFO] Both key formats already exist');
				
				// Verify they're identical
				if (mlKemKeys === oldKeys) {
					results.push('✅ [VERIFY] Keys are identical - no migration needed');
				} else {
					results.push('⚠️ [WARNING] Keys are different - using ml-kem-keypair as primary');
					if (mlKemKeys) {
						localStorage.setItem('qryptchat_pq_keypair', mlKemKeys);
						results.push('✅ [FIX] Synchronized keys');
					}
				}
			}
			
			// Step 3: Final verification
			results.push('');
			results.push('==================== STEP 3: Final Verification ====================');
			const finalMlKem = localStorage.getItem('ml-kem-keypair');
			const finalOld = localStorage.getItem('qryptchat_pq_keypair');
			
			results.push(`🔍 [FINAL] ml-kem-keypair exists: ${!!finalMlKem}`);
			results.push(`🔍 [FINAL] qryptchat_pq_keypair exists: ${!!finalOld}`);
			results.push(`🔍 [FINAL] Keys are identical: ${finalMlKem === finalOld}`);
			
			if (finalMlKem) {
				try {
					const parsedKeys = JSON.parse(finalMlKem);
					results.push(`🔍 [FINAL] Public key preview: ${parsedKeys.publicKey?.substring(0, 50)}...`);
					results.push(`🔍 [FINAL] Has private key: ${!!parsedKeys.privateKey}`);
				} catch (error) {
					results.push('🚨 [ERROR] Failed to parse final keys');
				}
			}
			
			// Step 4: Success summary
			results.push('');
			results.push('==================== STEP 4: Migration Complete ====================');
			if (finalMlKem && finalOld && finalMlKem === finalOld) {
				results.push('🎉 [SUCCESS] Key migration completed successfully!');
				results.push('✅ [READY] User should now be able to decrypt messages');
				results.push('📋 [NEXT] Test message decryption in the chat');
			} else {
				results.push('🚨 [FAILED] Key migration incomplete');
				results.push('📋 [ACTION] Manual intervention may be required');
			}
			
			fixResult = results.join('\n');
			
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			fixResult = `🚨 [ERROR] Migration failed: ${err.message}\n\nStack trace:\n${err.stack}`;
		} finally {
			isRunning = false;
		}
	}
	
	async function copyToClipboard() {
		try {
			await navigator.clipboard.writeText(fixResult);
			copySuccess = true;
			setTimeout(() => {
				copySuccess = false;
			}, 2000);
		} catch (error) {
			console.error('Failed to copy to clipboard:', error);
		}
	}
</script>

<div class="key-migration-fix">
	<div class="fix-header">
		<h3>🔧 Key Migration Fix</h3>
		<p>Automatically fix key storage issues and ensure proper key migration</p>
	</div>
	
	<div class="fix-actions">
		<button
			onclick={runKeyMigrationFix}
			disabled={isRunning}
			class="fix-button"
		>
			{isRunning ? '🔄 Running Migration Fix...' : '🔧 Run Key Migration Fix'}
		</button>
		
		{#if fixResult}
			<button
				onclick={copyToClipboard}
				class="copy-button"
				class:success={copySuccess}
			>
				{copySuccess ? '✅ Copied!' : '📋 Copy Results'}
			</button>
		{/if}
	</div>
	
	{#if fixResult}
		<div class="fix-results">
			<h4>Migration Results:</h4>
			<pre class="results-text">{fixResult}</pre>
		</div>
	{/if}
</div>

<style>
	.key-migration-fix {
		padding: 1.5rem;
		background: var(--bg-secondary);
		border: 1px solid var(--border-primary);
		border-radius: 0.5rem;
		margin-top: 1rem;
	}
	
	.fix-header h3 {
		margin: 0 0 0.5rem 0;
		font-size: 1.25rem;
		font-weight: 600;
		color: var(--text-primary);
	}
	
	.fix-header p {
		margin: 0 0 1rem 0;
		color: var(--text-secondary);
		font-size: 0.875rem;
	}
	
	.fix-actions {
		display: flex;
		gap: 1rem;
		margin-bottom: 1rem;
		flex-wrap: wrap;
	}
	
	.fix-button,
	.copy-button {
		padding: 0.75rem 1rem;
		border: none;
		border-radius: 0.375rem;
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s ease;
	}
	
	.fix-button {
		background: #10b981;
		color: white;
	}
	
	.fix-button:hover:not(:disabled) {
		background: #059669;
	}
	
	.fix-button:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
	
	.copy-button {
		background: var(--bg-tertiary);
		color: var(--text-primary);
		border: 1px solid var(--border-primary);
	}
	
	.copy-button:hover {
		background: var(--bg-primary);
	}
	
	.copy-button.success {
		background: #10b981;
		color: white;
		border-color: #10b981;
	}
	
	.fix-results {
		margin-top: 1rem;
	}
	
	.fix-results h4 {
		margin: 0 0 0.5rem 0;
		font-size: 1rem;
		font-weight: 600;
		color: var(--text-primary);
	}
	
	.results-text {
		background: var(--bg-primary);
		border: 1px solid var(--border-primary);
		border-radius: 0.375rem;
		padding: 1rem;
		font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
		font-size: 0.75rem;
		line-height: 1.4;
		color: var(--text-primary);
		white-space: pre-wrap;
		word-wrap: break-word;
		max-height: 400px;
		overflow-y: auto;
		margin: 0;
	}
	
	@media (max-width: 640px) {
		.key-migration-fix {
			padding: 1rem;
		}
		
		.fix-actions {
			flex-direction: column;
		}
		
		.fix-button,
		.copy-button {
			width: 100%;
		}
		
		.results-text {
			font-size: 0.7rem;
			max-height: 300px;
		}
	}
</style>