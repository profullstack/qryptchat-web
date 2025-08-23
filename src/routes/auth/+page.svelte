<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { auth, isAuthenticated, isLoading, authError } from '$lib/stores/auth.js';
	import { t } from '$lib/stores/i18n.js';

	/** @type {'phone' | 'verify' | 'profile'} */
	let step = 'phone';
	let phoneNumber = '';
	let verificationCode = '';
	let username = '';
	let displayName = '';
	let isNewUser = false;
	let countdown = 0;
	let canResend = true;
	let expiresAt = null;

	// Redirect if already authenticated
	$: if ($isAuthenticated) {
		goto('/chat');
	}

	/**
	 * Format phone number as user types
	 * @param {string} value
	 */
	function formatPhoneNumber(value) {
		// Remove all non-digits
		const digits = value.replace(/\D/g, '');
		
		// Add country code if not present
		if (digits.length > 0 && !digits.startsWith('1')) {
			return '+1' + digits;
		} else if (digits.length > 0) {
			return '+' + digits;
		}
		return value;
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
			auth.clearError();
			return;
		}

		const result = await auth.sendSMS(phoneNumber);
		
		if (result.success) {
			step = 'verify';
			// Supabase OTP expires in 60 seconds by default
			expiresAt = new Date(Date.now() + 60 * 1000).toISOString();
			startCountdown(60); // 60 second cooldown
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
		} else if (result.error?.includes('Username is required')) {
			// New user needs to provide username
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

		const result = await auth.verifySMS(
			phoneNumber, 
			verificationCode, 
			username, 
			displayName || username
		);
		
		if (result.success) {
			goto('/chat?welcome=true');
		}
	}

	/**
	 * Go back to previous step
	 */
	function goBack() {
		auth.clearError();
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

		<!-- Phone Number Step -->
		{#if step === 'phone'}
			<div class="auth-step">
				<h2>{$t('auth.enterPhone')}</h2>
				<p class="step-description">{$t('auth.phoneDescription')}</p>
				
				<form on:submit|preventDefault={sendSMS}>
					<div class="input-group">
						<label for="phone">{$t('auth.phoneNumber')}</label>
						<input
							id="phone"
							type="tel"
							bind:value={phoneNumber}
							on:input={handlePhoneInput}
							placeholder="+1234567890"
							required
							disabled={$isLoading}
							class="phone-input"
						/>
					</div>
					
					{#if $authError}
						<div class="error-message">
							{$authError}
						</div>
					{/if}
					
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
				<button class="back-button" on:click={goBack}>
					← {$t('common.back')}
				</button>
				
				<h2>{$t('auth.enterCode')}</h2>
				<p class="step-description">
					{$t('auth.codeDescription')} <strong>{phoneNumber}</strong>
				</p>
				
				<form on:submit|preventDefault={verifySMS}>
					<div class="input-group">
						<label for="code">{$t('auth.verificationCode')}</label>
						<input
							id="code"
							type="text"
							bind:value={verificationCode}
							on:input={handleCodeInput}
							placeholder="123456"
							maxlength="6"
							required
							disabled={$isLoading}
							class="code-input"
						/>
					</div>
					
					{#if $authError}
						<div class="error-message">
							{$authError}
						</div>
					{/if}
					
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
						<button class="link-button" on:click={sendSMS}>
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
				<button class="back-button" on:click={goBack}>
					← {$t('common.back')}
				</button>
				
				<h2>{$t('auth.createProfile')}</h2>
				<p class="step-description">{$t('auth.profileDescription')}</p>
				
				<form on:submit|preventDefault={completeProfile}>
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
					
					{#if $authError}
						<div class="error-message">
							{$authError}
						</div>
					{/if}
					
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
		background: linear-gradient(135deg, var(--color-primary-50) 0%, var(--color-primary-100) 100%);
	}

	.auth-card {
		background: var(--color-surface);
		border-radius: 1rem;
		padding: 2rem;
		width: 100%;
		max-width: 400px;
		box-shadow: var(--shadow-lg);
		border: 1px solid var(--color-border);
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
		color: var(--color-primary-600);
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
		border: 1px solid var(--color-border);
		border-radius: 0.5rem;
		font-size: 1rem;
		transition: border-color 0.2s ease;
		background: var(--color-surface);
		color: var(--color-text-primary);
	}

	.input-group input:focus {
		outline: none;
		border-color: var(--color-primary-500);
		box-shadow: 0 0 0 3px var(--color-primary-100);
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
		background: var(--color-primary-600);
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
		background: var(--color-primary-700);
	}

	.primary-button:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.back-button {
		background: none;
		border: none;
		color: var(--color-primary-600);
		cursor: pointer;
		font-size: 0.875rem;
		margin-bottom: 1rem;
		padding: 0.25rem 0;
	}

	.back-button:hover {
		color: var(--color-primary-700);
	}

	.link-button {
		background: none;
		border: none;
		color: var(--color-primary-600);
		cursor: pointer;
		text-decoration: underline;
		font-size: 0.875rem;
	}

	.link-button:hover {
		color: var(--color-primary-700);
	}

	.resend-section {
		text-align: center;
		margin-top: 1rem;
	}

	.countdown {
		color: var(--color-text-secondary);
		font-size: 0.875rem;
	}

	.error-message {
		background: var(--color-error-50);
		color: var(--color-error-700);
		padding: 0.75rem;
		border-radius: 0.5rem;
		margin-bottom: 1rem;
		font-size: 0.875rem;
		border: 1px solid var(--color-error-200);
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

	@media (max-width: 480px) {
		.auth-card {
			padding: 1.5rem;
		}
		
		.logo h1 {
			font-size: 1.25rem;
		}
	}
</style>