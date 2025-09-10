<script>
	import { createSupabaseClient } from '$lib/supabase.js';
	
	const supabase = createSupabaseClient();
	
	let diagnosticResult = $state('');
	let isRunning = $state(false);
	let copySuccess = $state(false);
	
	async function runKeyDiagnostic() {
		isRunning = true;
		diagnosticResult = '';
		
		try {
			const results = [];
			results.push('🔍 [DEEP DIAGNOSTIC] Advanced Key Analysis Results:');
			results.push('');
			
			// Step 1: Check key migration
			results.push('==================== STEP 1: Key Migration Status ====================');
			const mlKemKeys = localStorage.getItem('ml-kem-keypair');
			const oldKeys = localStorage.getItem('qryptchat_pq_keypair');
			
			results.push(`🔍 [KEYS] ml-kem-keypair exists: ${!!mlKemKeys}`);
			results.push(`🔍 [KEYS] qryptchat_pq_keypair exists: ${!!oldKeys}`);
			results.push(`🔍 [KEYS] Keys are identical: ${mlKemKeys === oldKeys}`);
			results.push('');
			
			// Step 2: Compare localStorage vs database keys
			results.push('==================== STEP 2: Database vs localStorage Keys ====================');
			
			if (mlKemKeys) {
				try {
					const localKeys = JSON.parse(mlKemKeys);
					const localPublicKey = localKeys.publicKey;
					results.push(`🔍 [LOCAL] Public key preview: ${localPublicKey?.substring(0, 50)}...`);
					
					// Fetch database keys
					const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
					if (authError || !authUser) {
						results.push('🚨 [ERROR] Not authenticated');
					} else {
						const response = await fetch('/api/user/profile', {
							method: 'GET',
							headers: { 'Content-Type': 'application/json' }
						});
						
						if (response.ok) {
							const profile = await response.json();
							results.push(`🔍 [DB] User profile loaded: ${profile.username || 'unknown'}`);
							
							if (profile.ml_kem_public_key) {
								const dbPublicKey = profile.ml_kem_public_key;
								results.push(`🔍 [DB] Public key preview: ${dbPublicKey?.substring(0, 50)}...`);
								results.push(`🔍 [COMPARE] Keys match: ${dbPublicKey === localPublicKey}`);
								
								if (dbPublicKey !== localPublicKey) {
									results.push('🚨 [MISMATCH] DATABASE AND LOCALSTORAGE KEYS DO NOT MATCH!');
									results.push('🚨 [MISMATCH] This is why decryption fails!');
								} else {
									results.push('✅ [SUCCESS] Database and localStorage keys match');
								}
							} else {
								results.push('🚨 [ERROR] No ml_kem_public_key found in database profile');
							}
						} else {
							results.push(`🚨 [ERROR] Failed to fetch profile: ${response.status}`);
						}
					}
				} catch (e) {
					const error = e instanceof Error ? e : new Error(String(e));
					results.push(`🚨 [ERROR] Failed to parse localStorage keys: ${error.message}`);
				}
			} else {
				results.push('🚨 [ERROR] No ml-kem-keypair found in localStorage');
			}
			
			results.push('');
			
			// Step 3: Check for sample encrypted message
			results.push('==================== STEP 3: Sample Message Analysis ====================');
			results.push('🔍 [INFO] Check browser console for any recent decryption errors');
			results.push('🔍 [INFO] Look for "ChaCha20-Poly1305 decryption failed" messages');
			results.push('');
			
			// Step 4: Key format analysis
			results.push('==================== STEP 4: Key Format Analysis ====================');
			if (mlKemKeys && oldKeys) {
				try {
					const mlKemParsed = JSON.parse(mlKemKeys);
					const oldParsed = JSON.parse(oldKeys);
					
					results.push(`🔍 [FORMAT] ml-kem-keypair has publicKey: ${!!mlKemParsed.publicKey}`);
					results.push(`🔍 [FORMAT] ml-kem-keypair has privateKey: ${!!mlKemParsed.privateKey}`);
					results.push(`🔍 [FORMAT] qryptchat_pq_keypair has publicKey: ${!!oldParsed.publicKey}`);
					results.push(`🔍 [FORMAT] qryptchat_pq_keypair has privateKey: ${!!oldParsed.privateKey}`);
					
					if (mlKemParsed.publicKey && oldParsed.publicKey) {
						results.push(`🔍 [FORMAT] Public keys identical: ${mlKemParsed.publicKey === oldParsed.publicKey}`);
					}
				} catch (e) {
					const error = e instanceof Error ? e : new Error(String(e));
					results.push(`🚨 [ERROR] Failed to analyze key formats: ${error.message}`);
				}
			}
			
			results.push('');
			
			// Step 5: Recommendations
			results.push('==================== STEP 5: Diagnostic Summary ====================');
			
			if (!mlKemKeys) {
				results.push('🚨 [CRITICAL] Missing ml-kem-keypair in localStorage');
				results.push('📋 [ACTION] Need to regenerate or import keys');
			} else if (!oldKeys) {
				results.push('⚠️ [WARNING] Missing qryptchat_pq_keypair (old format)');
				results.push('📋 [INFO] This might be normal if keys were recently migrated');
			} else {
				results.push('✅ [INFO] Both key formats present in localStorage');
			}
			
			results.push('');
			results.push('==================== NEXT STEPS ====================');
			results.push('📋 [TODO] Share this diagnostic output with the developer');
			results.push('📋 [TODO] Check if other users have the same issue');
			results.push('📋 [TODO] Consider key regeneration if mismatch confirmed');
			
			diagnosticResult = results.join('\n');
			
		} catch (err) {
			const error = err instanceof Error ? err : new Error(String(err));
			diagnosticResult = `🚨 [ERROR] Diagnostic failed: ${error.message}\n\nStack trace:\n${error.stack}`;
		} finally {
			isRunning = false;
		}
	}
	
	async function copyToClipboard() {
		try {
			await navigator.clipboard.writeText(diagnosticResult);
			copySuccess = true;
			setTimeout(() => {
				copySuccess = false;
			}, 2000);
		} catch (error) {
			console.error('Failed to copy to clipboard:', error);
		}
	}
</script>

<div class="key-diagnostic">
	<div class="diagnostic-header">
		<h3>🔍 Key Diagnostic Tool</h3>
		<p>Run comprehensive key analysis to identify decryption issues</p>
	</div>
	
	<div class="diagnostic-actions">
		<button
			onclick={runKeyDiagnostic}
			disabled={isRunning}
			class="diagnostic-button"
		>
			{isRunning ? '🔄 Running Diagnostic...' : '🔍 Run Key Diagnostic'}
		</button>
		
		{#if diagnosticResult}
			<button
				onclick={copyToClipboard}
				class="copy-button"
				class:success={copySuccess}
			>
				{copySuccess ? '✅ Copied!' : '📋 Copy Results'}
			</button>
		{/if}
	</div>
	
	{#if diagnosticResult}
		<div class="diagnostic-results">
			<h4>Diagnostic Results:</h4>
			<pre class="results-text">{diagnosticResult}</pre>
		</div>
	{/if}
</div>

<style>
	.key-diagnostic {
		padding: 1.5rem;
		background: var(--bg-secondary);
		border: 1px solid var(--border-primary);
		border-radius: 0.5rem;
		margin-top: 1rem;
	}
	
	.diagnostic-header h3 {
		margin: 0 0 0.5rem 0;
		font-size: 1.25rem;
		font-weight: 600;
		color: var(--text-primary);
	}
	
	.diagnostic-header p {
		margin: 0 0 1rem 0;
		color: var(--text-secondary);
		font-size: 0.875rem;
	}
	
	.diagnostic-actions {
		display: flex;
		gap: 1rem;
		margin-bottom: 1rem;
		flex-wrap: wrap;
	}
	
	.diagnostic-button,
	.copy-button {
		padding: 0.75rem 1rem;
		border: none;
		border-radius: 0.375rem;
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s ease;
	}
	
	.diagnostic-button {
		background: var(--brand-primary);
		color: var(--bg-primary);
	}
	
	.diagnostic-button:hover:not(:disabled) {
		background: var(--brand-secondary);
	}
	
	.diagnostic-button:disabled {
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
	
	.diagnostic-results {
		margin-top: 1rem;
	}
	
	.diagnostic-results h4 {
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
		.key-diagnostic {
			padding: 1rem;
		}
		
		.diagnostic-actions {
			flex-direction: column;
		}
		
		.diagnostic-button,
		.copy-button {
			width: 100%;
		}
		
		.results-text {
			font-size: 0.7rem;
			max-height: 300px;
		}
	}
</style>