<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { auth, isAuthenticated, isLoading } from '$lib/stores/auth.js';
	import { messages } from '$lib/stores/messages.js';
	import { t } from '$lib/stores/i18n.js';
	import { createSupabaseClient } from '$lib/supabase.js';
	import { currentTheme, themeUtils } from '$lib/stores/theme.js';
	import Message from '$lib/components/Message.svelte';
	import AvatarUpload from '$lib/components/AvatarUpload.svelte';
	import { keyManager } from '$lib/crypto/key-manager.js';
	import { privateKeyManager } from '$lib/crypto/private-key-manager.js';

	/** @type {'phone' | 'verify' | 'profile' | 'backup'} */
	let step = $state('phone');
	let phoneNumber = $state('');
	let verificationCode = $state('');
	let username = $state('');
	let displayName = $state('');
	let isNewUser = $state(false);
	let countdown = $state(0);
	let canResend = $state(true);
	let expiresAt = $state(/** @type {string | null} */ (null));
	/** @type {any} */
	let verifiedSession = $state(null); // Store the verified session for account creation
	/** @type {string | null | undefined} */
	let avatarUrl = $state(null); // Store uploaded avatar URL
	/** @type {string | null | undefined} */
	let createdUserId = $state(null); // Store user ID after account creation for avatar upload
	
	// Key backup prompts
	let showKeyBackupPrompt = $state(false);
	let keyBackupPassword = $state('');
	let confirmKeyBackupPassword = $state('');
	let showBackupPassword = $state(false);

	// Redirect if already authenticated
	onMount(() => {
		if ($isAuthenticated) {
			goto('/chat');
		}
		
		// Ensure theme is applied
		if (browser) {
			themeUtils.applyTheme($currentTheme);
		}
	});

	/**
	 * Format phone number as user types
	 * @param {string} value
	 */
	function formatPhoneNumber(value) {
		// Remove all non-digits except the leading +
		const cleanValue = value.replace(/[^\d+]/g, '');
		
		// If it starts with digits (no +), add the + prefix
		if (cleanValue.length > 0 && !cleanValue.startsWith('+')) {
			return '+' + cleanValue;
		}
		
		return cleanValue;
	}

	/**
	 * Handle phone number input
	 * @param {Event} event
	 */
	function handlePhoneInput(event) {
		const input = /** @type {HTMLInputElement} */ (event.target);
		phoneNumber = formatPhoneNumber(input.value);
	}

	/**
	 * Start countdown timer
	 * @param {number} seconds
	 */
	function startCountdown(seconds) {
		countdown = seconds;
		canResend = false;
		
		const timer = setInterval(() => {
			countdown--;
			if (countdown <= 0) {
				clearInterval(timer);
				canResend = true;
			}
		}, 1000);
	}

	/**
	 * Send SMS verification code
	 */
	async function sendSMS() {
		if (!phoneNumber.trim()) {
			return;
		}

		const result = await auth.sendSMS(phoneNumber);
		
		if (result.success) {
			step = 'verify';
			// Supabase OTP expires in 300 seconds (5 minutes) as configured
			expiresAt = new Date(Date.now() + 300 * 1000).toISOString();
			startCountdown(60); // 60 second cooldown for resend (not expiration)
		}
	}

	/**
	 * Verify SMS code
	 */
	async function verifySMS() {
		if (!verificationCode.trim() || verificationCode.length !== 6) {
			return;
		}

		const result = await auth.verifySMS(
			phoneNumber,
			verificationCode,
			username,
			displayName
		);
		
		if (result.success) {
			if (result.isNewUser) {
				// New user - show success and redirect
				goto('/chat?welcome=true');
			} else {
				// Existing user - redirect to chat
				goto('/chat');
			}
		} else if (result.requiresUsername) {
			// New user needs to provide username - store session for account creation
			verifiedSession = result.session;
			isNewUser = true;
			step = 'profile';
		}
	}

	/**
	 * Complete profile setup for new users
	 */
	async function completeProfile() {
		if (!username.trim()) {
			return;
		}

		// Use the verified session JWT token to create account
		// Call the verify-sms endpoint with the session token instead of OTP
		if (!verifiedSession?.access_token) {
			messages.error('Session expired. Please verify your phone number again.');
			step = 'verify';
			return;
		}

		try {
			let body;
			let headers = /** @type {Record<string, string>} */ ({
				'Authorization': `Bearer ${verifiedSession.access_token}`
			});

			// If avatar preview exists (blob), prepare FormData for server-side upload during creation
			if (avatarUrl && avatarUrl.startsWith('blob:')) {
				console.log('📸 Preparing avatar for server-side upload during account creation...');
				const response = await fetch(avatarUrl);
				const blob = await response.blob();
				const file = new File([blob], 'avatar.jpg', { type: blob.type });

				body = new FormData();
				body.append('phoneNumber', phoneNumber);
				body.append('username', username);
				body.append('displayName', displayName || username);
				body.append('useSession', 'true');
				body.append('avatar', file);

				// Don't set Content-Type for FormData (browser sets multipart)
			} else {
				// No avatar, use JSON
				body = JSON.stringify({
					phoneNumber,
					username,
					displayName: displayName || username,
					useSession: true // Flag to indicate we're using session auth
				});
				headers['Content-Type'] = 'application/json';
			}

			const apiResponse = await fetch('/api/auth/verify-sms', {
				method: 'POST',
				headers,
				body
			});

			const data = await apiResponse.json();

			if (apiResponse.ok && data.success) {
				// Store user data and session
				if (browser) {
					localStorage.setItem('qrypt_user', JSON.stringify(data.user));
					localStorage.setItem('supabase.auth.token', JSON.stringify(verifiedSession));
				}
				
				// Set the session in the Supabase client
				const supabase = createSupabaseClient();
				await supabase.auth.setSession(verifiedSession);
				
				// Update avatarUrl if uploaded server-side
				if (data.avatarUrl) {
					avatarUrl = data.avatarUrl;
					console.log('📸 ✅ Avatar uploaded server-side during account creation');
				}
				
				// Generate encryption keys for new user
				try {
					await keyManager.generateUserKeys();
					console.log('🔑 Generated encryption keys for new user');
					
					// Go to backup step
					step = 'backup';
					messages.success('Account created successfully! Please backup your encryption keys.');
				} catch (keyError) {
					console.error('Failed to generate encryption keys:', keyError);
					messages.warning('Account created but failed to generate encryption keys. You can generate them later in Settings.');
					goto('/chat?welcome=true');
				}
			} else {
				messages.error(data.error || 'Failed to create account');
			}
		} catch (error) {
			console.error('Profile completion error:', error);
			messages.error('Failed to create account. Please try again.');
		}
	}

	/**
	 * Go back to previous step
	 */
	function goBack() {
		if (step === 'verify') {
			step = 'phone';
		} else if (step === 'profile') {
			step = 'verify';
		}
	}

	/**
	 * Handle verification code input (auto-advance)
	 * @param {Event} event
	 */
	function handleCodeInput(event) {
		const input = /** @type {HTMLInputElement} */ (event.target);
		verificationCode = input.value.replace(/\D/g, '').slice(0, 6);
		
		// Auto-verify when 6 digits entered
		if (verificationCode.length === 6) {
			setTimeout(verifySMS, 100);
		}
	}

	/**
	 * Handle avatar upload success
	 * @param {CustomEvent} event
	 */
	function handleAvatarUploaded(event) {
		avatarUrl = event.detail.avatarUrl;
		if (createdUserId) {
			messages.success('Profile picture uploaded successfully!');
		} else {
			console.log('📸 Avatar preview ready for upload after user creation');
		}
	}

	/**
	 * Handle avatar upload error
	 * @param {CustomEvent} event
	 */
	function handleAvatarError(event) {
		messages.error(event.detail.message || 'Failed to upload profile picture');
	}

	/**
	 * Handle avatar removal
	 */
	function handleAvatarRemoved() {
		avatarUrl = null;
		messages.info('Profile picture removed');
	}

	/**
	 * Download key backup during registration
	 */
	async function downloadKeyBackup() {
		if (!keyBackupPassword || keyBackupPassword.trim().length === 0) {
			messages.error('Please enter a password to protect your key backup');
			return;
		}
		
		if (keyBackupPassword !== confirmKeyBackupPassword) {
			messages.error('Passwords do not match');
			return;
		}
		
		if (keyBackupPassword.length < 8) {
			messages.error('Password must be at least 8 characters long');
			return;
		}

		
		try {
			// Standard export
			const exportedData = await privateKeyManager.exportPrivateKeys(keyBackupPassword);
			privateKeyManager.downloadExportedKeys(exportedData);
			messages.success('Key backup downloaded! Welcome to QryptChat!');
			
			// Clear passwords and proceed to chat
			keyBackupPassword = '';
			confirmKeyBackupPassword = '';
			showKeyBackupPrompt = false;
			
			goto('/chat?welcome=true');
		} catch (error) {
			console.error('Failed to download key backup:', error);
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			messages.error('Failed to download key backup: ' + errorMessage);
		}
	}
	
	/**
	 * Skip key backup (not recommended but allowed)
	 */
	function skipKeyBackup() {
		messages.warning('Key backup skipped. You can create a backup later in Settings.');
		showKeyBackupPrompt = false;
		goto('/chat?welcome=true');
	}

	onMount(() => {
		// Focus first input
		const firstInput = document.querySelector('input');
		if (firstInput) {
			firstInput.focus();
		}
	});
</script>

<svelte:head>
	<title>{$t('auth.title')} - QryptChat</title>
</svelte:head>

<div class="auth-container">
	<div class="auth-card">
		<!-- Header -->
		<div class="auth-header">
			<div class="logo">
				<div class="logo-icon">🔐</div>
				<h1>QryptChat</h1>
			</div>
			<p class="subtitle">{$t('auth.subtitle')}</p>
		</div>

		<!-- Messages -->
		<div class="messages-container">
			{#each $messages as message (message.id)}
				<Message
					type={message.type}
					message={message.message}
					title={message.title}
					dismissible={message.dismissible}
					autoDismiss={message.autoDismiss}
					on:dismiss={() => messages.remove(message.id)}
				/>
			{/each}
		</div>

		<!-- Phone Number Step -->
		{#if step === 'phone'}
			<div class="auth-step">
				<h2>{$t('auth.enterPhone')}</h2>
				<p class="step-description">{$t('auth.phoneDescription')}</p>
				
				<form onsubmit={sendSMS}>
					<div class="input-group">
						<label for="phone">{$t('auth.phoneNumber')}</label>
						<input
							id="phone"
							type="tel"
							bind:value={phoneNumber}
							oninput={handlePhoneInput}
							placeholder="+1234567890"
							required
							disabled={$isLoading}
							class="phone-input"
						/>
					</div>
					
					
					<button 
						type="submit" 
						disabled={$isLoading || !phoneNumber.trim()}
						class="primary-button"
					>
						{#if $isLoading}
							<span class="loading-spinner"></span>
							{$t('auth.sending')}
						{:else}
							{$t('auth.sendCode')}
						{/if}
					</button>
				</form>
			</div>
		{/if}

		<!-- Verification Step -->
		{#if step === 'verify'}
			<div class="auth-step">
				<button class="back-button" onclick={goBack}>
					← {$t('common.back')}
				</button>
				
				<h2>{$t('auth.enterCode')}</h2>
				<p class="step-description">
					{$t('auth.codeDescription')} <strong>{phoneNumber}</strong>
				</p>
				
				<form onsubmit={verifySMS}>
					<div class="input-group">
						<label for="code">{$t('auth.verificationCode')}</label>
						<input
							id="code"
							type="text"
							bind:value={verificationCode}
							oninput={handleCodeInput}
							placeholder="123456"
							maxlength="6"
							required
							disabled={$isLoading}
							class="code-input"
						/>
					</div>
					
					
					<button 
						type="submit" 
						disabled={$isLoading || verificationCode.length !== 6}
						class="primary-button"
					>
						{#if $isLoading}
							<span class="loading-spinner"></span>
							{$t('auth.verifying')}
						{:else}
							{$t('auth.verify')}
						{/if}
					</button>
				</form>
				
				<div class="resend-section">
					{#if canResend}
						<button class="link-button" onclick={sendSMS}>
							{$t('auth.resendCode')}
						</button>
					{:else}
						<span class="countdown">
							{$t('auth.resendIn')} {countdown}s
						</span>
					{/if}
				</div>
			</div>
		{/if}

		<!-- Profile Setup Step -->
		{#if step === 'profile'}
			<div class="auth-step">
				<button class="back-button" onclick={goBack}>
					← {$t('common.back')}
				</button>
				
				<h2>{$t('auth.createProfile')}</h2>
				<p class="step-description">{$t('auth.profileDescription')}</p>
				
				<form onsubmit={completeProfile}>
					<!-- Avatar Upload Section -->
					<div class="avatar-section">
						<div class="avatar-label">Profile Picture (Optional)</div>
						<div class="avatar-upload-container">
							<AvatarUpload
								userId={null}
								currentAvatarUrl={avatarUrl ?? null}
								size="medium"
								disabled={$isLoading}
								previewOnly={true}
								on:uploaded={handleAvatarUploaded}
								on:error={handleAvatarError}
								on:removed={handleAvatarRemoved}
							/>
						</div>
						<p class="avatar-description">
							Add a profile picture to help others recognize you. You can skip this step and add one later.
						</p>
					</div>

					<div class="input-group">
						<label for="username">{$t('auth.username')} *</label>
						<input
							id="username"
							type="text"
							bind:value={username}
							placeholder="johndoe"
							required
							disabled={$isLoading}
							pattern="[a-zA-Z0-9_]+"
							title="Username can only contain letters, numbers, and underscores"
						/>
					</div>
					
					<div class="input-group">
						<label for="displayName">{$t('auth.displayName')}</label>
						<input
							id="displayName"
							type="text"
							bind:value={displayName}
							placeholder="John Doe"
							disabled={$isLoading}
						/>
					</div>
					
					
					<button 
						type="submit" 
						disabled={$isLoading || !username.trim()}
						class="primary-button"
					>
						{#if $isLoading}
							<span class="loading-spinner"></span>
							{$t('auth.creating')}
						{:else}
							{$t('auth.createAccount')}
						{/if}
					</button>
				</form>
			</div>
		{/if}

		<!-- Key Backup Step -->
		{#if step === 'backup'}
			<div class="auth-step">
				<h2>🔐 Backup Your Encryption Keys</h2>
				<p class="step-description">
					Your encryption keys have been generated! Please create a secure backup to ensure you never lose access to your messages.
				</p>
				
				<div class="backup-warning">
					<p><strong>⚠️ Critical:</strong> Without this backup, you will lose access to all your encrypted messages if you lose this device or clear your browser data.</p>
				</div>
				
				<form onsubmit={downloadKeyBackup}>
					<div class="input-group">
						<label for="backup-password">Backup Password *</label>
						<div class="password-input">
							<input
								id="backup-password"
								type={showBackupPassword ? 'text' : 'password'}
								bind:value={keyBackupPassword}
								placeholder="Enter a strong password to protect your backup"
								required
								disabled={$isLoading}
							/>
							<button
								type="button"
								class="toggle-password"
								onclick={() => showBackupPassword = !showBackupPassword}
								disabled={$isLoading}
							>
								{showBackupPassword ? '👁️' : '👁️‍🗨️'}
							</button>
						</div>
					</div>
					
					<div class="input-group">
						<label for="confirm-backup-password">Confirm Password *</label>
						<div class="password-input">
							<input
								id="confirm-backup-password"
								type={showBackupPassword ? 'text' : 'password'}
								bind:value={confirmKeyBackupPassword}
								placeholder="Confirm your password"
								required
								disabled={$isLoading}
							/>
							<button
								type="button"
								class="toggle-password"
								onclick={() => showBackupPassword = !showBackupPassword}
								disabled={$isLoading}
							>
								{showBackupPassword ? '👁️' : '👁️‍🗨️'}
							</button>
						</div>
					</div>

					
					<div class="button-group">
						<button
							type="submit"
							disabled={$isLoading || !keyBackupPassword || !confirmKeyBackupPassword}
							class="primary-button"
						>
							{#if $isLoading}
								<span class="loading-spinner"></span>
								Creating Backup...
							{:else}
								📁 Download Backup
							{/if}
						</button>
						
						<button
							type="button"
							class="secondary-button"
							onclick={skipKeyBackup}
							disabled={$isLoading}
						>
							Skip (Not Recommended)
						</button>
					</div>
				</form>
				
				<div class="backup-info">
					<p><strong>💡 Tips:</strong></p>
					<ul>
						<li>Use a strong, unique password for your backup</li>
						<li>Store the backup file in a secure location (cloud storage, USB drive, etc.)</li>
						<li>Remember both passwords - you'll need them to restore your keys</li>
						<li>You can create additional backups later in Settings</li>
					</ul>
				</div>
			</div>
		{/if}

		<!-- Footer -->
		<div class="auth-footer">
			<p class="privacy-note">
				{$t('auth.privacyNote')}
			</p>
		</div>
	</div>
</div>

<style>
	.auth-container {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
		background: linear-gradient(135deg, var(--color-bg-secondary) 0%, var(--color-bg-tertiary) 100%);
	}

	.auth-card {
		background: var(--color-bg-primary);
		border-radius: 1rem;
		padding: 2rem;
		width: 100%;
		max-width: 400px;
		box-shadow: var(--shadow-lg);
		border: 1px solid var(--color-border-primary);
	}

	.auth-header {
		text-align: center;
		margin-bottom: 2rem;
	}

	.logo {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
	}

	.logo-icon {
		font-size: 2rem;
	}

	.logo h1 {
		font-size: 1.5rem;
		font-weight: 700;
		color: var(--color-brand-primary);
		margin: 0;
	}

	.subtitle {
		color: var(--color-text-secondary);
		margin: 0;
	}

	.auth-step h2 {
		font-size: 1.25rem;
		font-weight: 600;
		margin-bottom: 0.5rem;
		color: var(--color-text-primary);
	}

	.step-description {
		color: var(--color-text-secondary);
		margin-bottom: 1.5rem;
		line-height: 1.5;
	}

	.input-group {
		margin-bottom: 1rem;
	}

	.input-group label {
		display: block;
		font-weight: 500;
		margin-bottom: 0.5rem;
		color: var(--color-text-primary);
	}

	.input-group input {
		width: 100%;
		padding: 0.75rem;
		border: 1px solid var(--color-border-primary);
		border-radius: 0.5rem;
		font-size: 1rem;
		transition: border-color 0.2s ease;
		background: var(--color-bg-primary);
		color: var(--color-text-primary);
	}

	.input-group input:focus {
		outline: none;
		border-color: var(--color-brand-primary);
		box-shadow: 0 0 0 3px rgb(99 102 241 / 0.1);
	}

	.input-group input:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.phone-input {
		font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
		letter-spacing: 0.05em;
	}

	.code-input {
		font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
		font-size: 1.25rem;
		text-align: center;
		letter-spacing: 0.25em;
	}

	.primary-button {
		width: 100%;
		padding: 0.75rem;
		background: var(--color-brand-primary);
		color: white;
		border: none;
		border-radius: 0.5rem;
		font-size: 1rem;
		font-weight: 500;
		cursor: pointer;
		transition: background-color 0.2s ease;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
	}

	.primary-button:hover:not(:disabled) {
		background: var(--color-brand-secondary);
	}

	.primary-button:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.back-button {
		background: none;
		border: none;
		color: var(--color-brand-primary);
		cursor: pointer;
		font-size: 0.875rem;
		margin-bottom: 1rem;
		padding: 0.25rem 0;
	}

	.back-button:hover {
		color: var(--color-brand-secondary);
	}

	.link-button {
		background: none;
		border: none;
		color: var(--color-brand-primary);
		cursor: pointer;
		text-decoration: underline;
		font-size: 0.875rem;
	}

	.link-button:hover {
		color: var(--color-brand-secondary);
	}

	.resend-section {
		text-align: center;
		margin-top: 1rem;
	}

	.countdown {
		color: var(--color-text-secondary);
		font-size: 0.875rem;
	}

	.messages-container {
		margin-bottom: 1rem;
	}

	.loading-spinner {
		width: 1rem;
		height: 1rem;
		border: 2px solid transparent;
		border-top: 2px solid currentColor;
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.auth-footer {
		margin-top: 2rem;
		text-align: center;
	}

	.privacy-note {
		font-size: 0.75rem;
		color: var(--color-text-secondary);
		line-height: 1.4;
		margin: 0;
	}

	/* Avatar Upload Styles */
	.avatar-section {
		margin-bottom: 1.5rem;
		text-align: center;
	}

	.avatar-label {
		display: block;
		font-weight: 500;
		margin-bottom: 0.75rem;
		color: var(--color-text-primary);
		font-size: 0.875rem;
	}

	.avatar-upload-container {
		display: flex;
		justify-content: center;
		margin-bottom: 0.5rem;
	}

	.avatar-description {
		font-size: 0.75rem;
		color: var(--color-text-secondary);
		line-height: 1.4;
		margin: 0;
		max-width: 280px;
		margin-left: auto;
		margin-right: auto;
	}

	@media (max-width: 480px) {
		.auth-card {
			padding: 1.5rem;
		}
		
		.logo h1 {
			font-size: 1.25rem;
		}

		.avatar-description {
			font-size: 0.7rem;
		}
	}

	/* Password input styles */
	.password-input {
		position: relative;
		display: flex;
		align-items: center;
	}

	.password-input input {
		padding-right: 3rem;
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

	/* Backup step specific styles */
	.backup-warning {
		background: rgba(239, 68, 68, 0.1);
		border: 1px solid #ef4444;
		border-radius: 0.375rem;
		padding: 1rem;
		margin: 1rem 0;
	}

	.backup-warning p {
		color: #dc2626;
		margin: 0;
		font-weight: 500;
		font-size: 0.875rem;
	}


	.button-group {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin-top: 1.5rem;
	}

	.secondary-button {
		width: 100%;
		padding: 0.75rem;
		background: var(--color-bg-secondary);
		color: var(--color-text-secondary);
		border: 1px solid var(--color-border-primary);
		border-radius: 0.5rem;
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.secondary-button:hover:not(:disabled) {
		background: var(--color-bg-tertiary);
		border-color: var(--color-border-secondary);
	}

	.secondary-button:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.backup-info {
		margin-top: 1.5rem;
		padding: 1rem;
		background: rgba(34, 197, 94, 0.05);
		border-radius: 0.375rem;
		border: 1px solid rgba(34, 197, 94, 0.2);
	}

	.backup-info p {
		color: #065f46;
		margin: 0 0 0.5rem 0;
		font-weight: 600;
		font-size: 0.875rem;
	}

	.backup-info ul {
		margin: 0;
		padding-left: 1.25rem;
		font-size: 0.8125rem;
		color: #047857;
		line-height: 1.5;
	}

	.backup-info li {
		margin-bottom: 0.25rem;
	}

	.backup-info li:last-child {
		margin-bottom: 0;
	}
</style>