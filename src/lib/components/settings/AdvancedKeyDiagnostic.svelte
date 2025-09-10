<script>
	import { createSupabaseClient } from '$lib/supabase.js';
	
	const supabase = createSupabaseClient();
	
	let diagnosticResult = $state('');
	let isRunning = $state(false);
	let copySuccess = $state(false);
	
	async function runAdvancedDiagnostic() {
		isRunning = true;
		diagnosticResult = '';
		
		try {
			const results = [];
			results.push('🔍 [ADVANCED DIAGNOSTIC] Deep Key & Database Analysis:');
			results.push('');
			
			// Step 1: Current localStorage analysis
			results.push('==================== STEP 1: localStorage Analysis ====================');
			const mlKemKeys = localStorage.getItem('ml-kem-keypair');
			const oldKeys = localStorage.getItem('qryptchat_pq_keypair');
			
			results.push(`🔍 [LOCAL] ml-kem-keypair exists: ${!!mlKemKeys}`);
			results.push(`🔍 [LOCAL] qryptchat_pq_keypair exists: ${!!oldKeys}`);
			
			if (mlKemKeys) {
				try {
					const parsedMlKem = JSON.parse(mlKemKeys);
					results.push(`🔍 [LOCAL] ml-kem publicKey length: ${parsedMlKem.publicKey?.length || 'N/A'}`);
					results.push(`🔍 [LOCAL] ml-kem privateKey length: ${parsedMlKem.privateKey?.length || 'N/A'}`);
					results.push(`🔍 [LOCAL] ml-kem publicKey preview: ${parsedMlKem.publicKey?.substring(0, 50)}...`);
				} catch (e) {
					const error = e instanceof Error ? e : new Error(String(e));
					results.push(`🚨 [ERROR] Failed to parse ml-kem-keypair: ${error.message}`);
				}
			}
			
			if (oldKeys) {
				try {
					const parsedOld = JSON.parse(oldKeys);
					results.push(`🔍 [LOCAL] old publicKey length: ${parsedOld.publicKey?.length || 'N/A'}`);
					results.push(`🔍 [LOCAL] old privateKey length: ${parsedOld.privateKey?.length || 'N/A'}`);
					results.push(`🔍 [LOCAL] old publicKey preview: ${parsedOld.publicKey?.substring(0, 50)}...`);
				} catch (e) {
					const error = e instanceof Error ? e : new Error(String(e));
					results.push(`🚨 [ERROR] Failed to parse qryptchat_pq_keypair: ${error.message}`);
				}
			}
			
			// Step 2: Database analysis
			results.push('');
			results.push('==================== STEP 2: Database Analysis ====================');
			
			try {
				const { data: { user }, error: authError } = await supabase.auth.getUser();
				if (authError || !user) {
					results.push('🚨 [ERROR] Not authenticated');
				} else {
					results.push(`🔍 [DB] Authenticated user ID: ${user.id}`);
					
					// Get user profile
					const { data: profile, error: profileError } = await supabase
						.from('users')
						.select('*')
						.eq('auth_user_id', user.id)
						.single();
					
					if (profileError) {
						results.push(`🚨 [ERROR] Profile fetch failed: ${profileError.message}`);
					} else {
						results.push(`🔍 [DB] User profile found: ${profile.username}`);
						results.push(`🔍 [DB] User ID: ${profile.id}`);
						results.push(`🔍 [DB] ml_kem_public_key exists: ${!!profile.ml_kem_public_key}`);
						
						if (profile.ml_kem_public_key) {
							results.push(`🔍 [DB] ml_kem_public_key length: ${profile.ml_kem_public_key.length}`);
							results.push(`🔍 [DB] ml_kem_public_key preview: ${profile.ml_kem_public_key.substring(0, 50)}...`);
							
							// Compare with localStorage
							if (mlKemKeys) {
								const parsedLocal = JSON.parse(mlKemKeys);
								const keysMatch = profile.ml_kem_public_key === parsedLocal.publicKey;
								results.push(`🔍 [COMPARE] Database vs localStorage match: ${keysMatch}`);
								
								if (!keysMatch) {
									results.push('🚨 [CRITICAL] DATABASE AND LOCALSTORAGE PUBLIC KEYS DO NOT MATCH!');
									results.push('🚨 [CRITICAL] This is the root cause of decryption failures!');
								}
							}
						}
					}
				}
			} catch (e) {
				const error = e instanceof Error ? e : new Error(String(e));
				results.push(`🚨 [ERROR] Database analysis failed: ${error.message}`);
			}
			
			// Step 3: Message recipients analysis
			results.push('');
			results.push('==================== STEP 3: Message Recipients Analysis ====================');
			
			try {
				const { data: { user }, error: authError } = await supabase.auth.getUser();
				if (!authError && user) {
					// Get user profile to get user ID
					const { data: profile, error: profileError } = await supabase
						.from('users')
						.select('id')
						.eq('auth_user_id', user.id)
						.single();
					
					if (!profileError && profile) {
						// Check recent message recipients for this user
						const { data: recipients, error: recipientsError } = await supabase
							.from('message_recipients')
							.select('id, message_id, encrypted_content')
							.eq('recipient_user_id', profile.id)
							.order('created_at', { ascending: false })
							.limit(5);
						
						if (recipientsError) {
							results.push(`🚨 [ERROR] Recipients fetch failed: ${recipientsError.message}`);
						} else {
							results.push(`🔍 [RECIPIENTS] Found ${recipients?.length || 0} recent message recipients`);
							
							if (recipients && recipients.length > 0) {
								recipients.forEach((recipient, index) => {
									results.push(`🔍 [RECIPIENTS] Message ${index + 1}: ID ${recipient.message_id}`);
									results.push(`🔍 [RECIPIENTS] Encrypted content length: ${recipient.encrypted_content?.length || 'N/A'}`);
									
									if (recipient.encrypted_content) {
										try {
											const parsed = JSON.parse(recipient.encrypted_content);
											results.push(`🔍 [RECIPIENTS] Content version: ${parsed.v || 'N/A'}`);
											results.push(`🔍 [RECIPIENTS] Content algorithm: ${parsed.alg || 'N/A'}`);
											results.push(`🔍 [RECIPIENTS] Has KEM: ${!!parsed.kem}`);
											results.push(`🔍 [RECIPIENTS] Has nonce: ${!!parsed.n}`);
											results.push(`🔍 [RECIPIENTS] Has ciphertext: ${!!parsed.c}`);
										} catch (e) {
											const error = e instanceof Error ? e : new Error(String(e));
											results.push(`🚨 [ERROR] Failed to parse encrypted content: ${error.message}`);
										}
									}
								});
							}
						}
					}
				}
			} catch (e) {
				const error = e instanceof Error ? e : new Error(String(e));
				results.push(`🚨 [ERROR] Recipients analysis failed: ${error.message}`);
			}
			
			// Step 4: Browser console errors check
			results.push('');
			results.push('==================== STEP 4: Browser Console Check ====================');
			results.push('🔍 [CONSOLE] Check browser console for recent errors:');
			results.push('🔍 [CONSOLE] Look for "ChaCha20-Poly1305 decryption failed" errors');
			results.push('🔍 [CONSOLE] Look for "ML-KEM decapsulation failed" errors');
			results.push('🔍 [CONSOLE] Look for "Invalid encrypted format" errors');
			
			// Step 5: Recommendations
			results.push('');
			results.push('==================== STEP 5: Advanced Recommendations ====================');
			
			if (mlKemKeys && oldKeys) {
				try {
					const parsedMl = JSON.parse(mlKemKeys);
					const parsedOld = JSON.parse(oldKeys);
					
					if (parsedMl.publicKey === parsedOld.publicKey) {
						results.push('✅ [ANALYSIS] localStorage keys are synchronized');
					} else {
						results.push('🚨 [ANALYSIS] localStorage keys are NOT synchronized');
						results.push('📋 [ACTION] Need to re-run key migration');
					}
				} catch (e) {
					results.push('🚨 [ANALYSIS] Cannot compare localStorage keys due to parsing errors');
				}
			}
			
			results.push('');
			results.push('📋 [NEXT STEPS] Based on findings:');
			results.push('1. If database/localStorage mismatch → Regenerate keys and update database');
			results.push('2. If keys match but decryption fails → Check message format compatibility');
			results.push('3. If no recipients found → Check message sending/receiving flow');
			results.push('4. Check browser console for specific decryption error details');
			
			diagnosticResult = results.join('\n');
			
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			diagnosticResult = `🚨 [ERROR] Advanced diagnostic failed: ${err.message}\n\nStack trace:\n${err.stack}`;
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

<div class="advanced-diagnostic">
	<div class="diagnostic-header">
		<h3>🔬 Advanced Key Diagnostic</h3>
		<p>Deep analysis of keys, database, and message recipients for User B decryption issues</p>
	</div>
	
	<div class="diagnostic-actions">
		<button
			onclick={runAdvancedDiagnostic}
			disabled={isRunning}
			class="diagnostic-button"
		>
			{isRunning ? '🔄 Running Advanced Diagnostic...' : '🔬 Run Advanced Diagnostic'}
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
			<h4>Advanced Diagnostic Results:</h4>
			<pre class="results-text">{diagnosticResult}</pre>
		</div>
	{/if}
</div>

<style>
	.advanced-diagnostic {
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
		background: #dc2626;
		color: white;
	}
	
	.diagnostic-button:hover:not(:disabled) {
		background: #b91c1c;
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
		max-height: 500px;
		overflow-y: auto;
		margin: 0;
	}
	
	@media (max-width: 640px) {
		.advanced-diagnostic {
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
			max-height: 400px;
		}
	}
</style>