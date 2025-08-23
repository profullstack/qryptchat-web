<script>
	import { currentTheme, themeUtils, themes } from '$lib/stores/theme.js';
	import { currentLanguage, t, i18nUtils, languages } from '$lib/stores/i18n.js';
	import { testAuth, testUser, testIsAuthenticated } from '$lib/stores/test-auth.js';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	
	// Component state
	let themeDropdownOpen = false;
	let languageDropdownOpen = false;
	let userDropdownOpen = false;
	let mobileMenuOpen = false;
	
	// Reactive values
	$: currentThemeInfo = $currentTheme === 'light' ? themes.light : themes.dark;
	$: currentLanguageInfo = getCurrentLanguageInfo($currentLanguage);
	
	// Helper function to get language info safely
	function getCurrentLanguageInfo(/** @type {string} */ langCode) {
		if (langCode === 'en') return languages.en;
		if (langCode === 'es') return languages.es;
		if (langCode === 'fr') return languages.fr;
		if (langCode === 'de') return languages.de;
		if (langCode === 'ar') return languages.ar;
		if (langCode === 'zh') return languages.zh;
		return languages.en;
	}
	
	// Close dropdowns when clicking outside
	function handleClickOutside(/** @type {MouseEvent} */ event) {
		const target = /** @type {Element} */ (event.target);
		if (!target?.closest('.dropdown')) {
			themeDropdownOpen = false;
			languageDropdownOpen = false;
			userDropdownOpen = false;
		}
	}
	
	// Theme switching
	function switchTheme(/** @type {string} */ themeName) {
		themeUtils.setTheme(themeName);
		themeDropdownOpen = false;
	}
	
	// Language switching
	function switchLanguage(/** @type {string} */ languageCode) {
		i18nUtils.setLanguage(languageCode);
		languageDropdownOpen = false;
	}
	
	// Toggle mobile menu
	function toggleMobileMenu() {
		mobileMenuOpen = !mobileMenuOpen;
	}
	
	// Close mobile menu
	function closeMobileMenu() {
		mobileMenuOpen = false;
	}

	// Handle logout
	async function handleLogout() {
		await testAuth.logout();
		closeMobileMenu();
		goto('/test-dropdown');
	}

	// Navigate to auth page
	function goToAuth() {
		closeMobileMenu();
		goto('/auth');
	}

	// Navigate to settings
	function goToSettings() {
		userDropdownOpen = false;
		goto('/settings');
	}

	// Navigate to premium upgrade
	function goToPremium() {
		userDropdownOpen = false;
		goto('/premium');
	}

	// Handle logout from dropdown
	async function handleDropdownLogout() {
		userDropdownOpen = false;
		await testAuth.logout();
		goto('/test-dropdown');
	}
	
	onMount(() => {
		document.addEventListener('click', handleClickOutside);
		return () => {
			document.removeEventListener('click', handleClickOutside);
		};
	});
</script>

<nav class="navbar">
	<div class="container">
		<div class="navbar-content">
			<!-- Logo and Brand -->
			<div class="navbar-brand">
				<a href="/test-dropdown" class="brand-link" on:click={closeMobileMenu}>
					<div class="brand-icon">
						<svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
							<circle cx="16" cy="16" r="14" fill="var(--color-brand-primary)" />
							<text x="16" y="22" text-anchor="middle" fill="white" font-size="18" font-weight="600">Q</text>
						</svg>
					</div>
					<span class="brand-text">{$t('app.name')}</span>
				</a>
			</div>
			
			<!-- Desktop Navigation -->
			<div class="navbar-nav desktop-nav">
				<a href="/test-dropdown" class="nav-link" class:active={$page.url.pathname === '/test-dropdown'}>Test</a>
				{#if $testIsAuthenticated}
					<a href="/chat" class="nav-link" class:active={$page.url.pathname === '/chat'}>{$t('nav.chat')}</a>
				{/if}
			</div>
			
			<!-- Desktop Actions -->
			<div class="navbar-actions desktop-actions">
				<!-- Theme Switcher -->
				<div class="dropdown" class:open={themeDropdownOpen}>
					<button 
						class="btn btn-ghost dropdown-trigger"
						on:click={() => themeDropdownOpen = !themeDropdownOpen}
						aria-label={$t('theme.switch')}
					>
						<span class="theme-icon">
							{#if $currentTheme === 'light'}
								<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<circle cx="12" cy="12" r="5"/>
									<path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
								</svg>
							{:else}
								<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
								</svg>
							{/if}
						</span>
						<span class="sr-only">{$t('theme.switch')}</span>
					</button>
					
					<div class="dropdown-content">
						<button 
							class="dropdown-item"
							class:active={$currentTheme === 'light'}
							on:click={() => switchTheme('light')}
						>
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<circle cx="12" cy="12" r="5"/>
								<path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
							</svg>
							{$t('theme.light')}
						</button>
						<button 
							class="dropdown-item"
							class:active={$currentTheme === 'dark'}
							on:click={() => switchTheme('dark')}
						>
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
							</svg>
							{$t('theme.dark')}
						</button>
					</div>
				</div>
				
				<!-- Language Switcher -->
				<div class="dropdown" class:open={languageDropdownOpen}>
					<button 
						class="btn btn-ghost dropdown-trigger"
						on:click={() => languageDropdownOpen = !languageDropdownOpen}
						aria-label={$t('language.switch')}
					>
						<span class="language-flag">{currentLanguageInfo.flag}</span>
						<span class="language-code">{$currentLanguage.toUpperCase()}</span>
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<polyline points="6,9 12,15 18,9"/>
						</svg>
					</button>
					
					<div class="dropdown-content language-dropdown">
						{#each Object.entries(languages) as [code, lang]}
							<button 
								class="dropdown-item"
								class:active={$currentLanguage === code}
								on:click={() => switchLanguage(code)}
							>
								<span class="language-flag">{lang.flag}</span>
								<span class="language-name">{lang.name}</span>
								{#if $currentLanguage === code}
									<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
										<polyline points="20,6 9,17 4,12"/>
									</svg>
								{/if}
							</button>
						{/each}
					</div>
				</div>
				
				<!-- Auth Actions -->
				<div class="auth-actions">
					{#if $testIsAuthenticated}
						<!-- User Dropdown -->
						<div class="dropdown user-dropdown" class:open={userDropdownOpen}>
							<button 
								class="btn btn-ghost dropdown-trigger user-trigger"
								on:click={() => userDropdownOpen = !userDropdownOpen}
								aria-label="User menu"
							>
								<div class="user-avatar">
									{#if $testUser?.avatarUrl}
										<img src={$testUser.avatarUrl} alt={$testUser.displayName} />
									{:else}
										<div class="avatar-placeholder">
											{($testUser?.displayName || $testUser?.username || 'U').charAt(0).toUpperCase()}
										</div>
									{/if}
								</div>
								<span class="user-name">{$testUser?.displayName || $testUser?.username}</span>
								<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<polyline points="6,9 12,15 18,9"/>
								</svg>
							</button>
							
							<div class="dropdown-content user-dropdown-content">
								<button 
									class="dropdown-item"
									on:click={goToSettings}
								>
									<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
										<circle cx="12" cy="12" r="3"/>
										<path d="M12 1v6m0 6v6m6-12h-6m-6 0h6"/>
									</svg>
									Settings
								</button>
								<button 
									class="dropdown-item premium-item"
									on:click={goToPremium}
								>
									<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
										<polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/>
									</svg>
									Upgrade to Premium
								</button>
								<div class="dropdown-divider"></div>
								<button 
									class="dropdown-item logout-item"
									on:click={handleDropdownLogout}
								>
									<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
										<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
										<polyline points="16,17 21,12 16,7"/>
										<line x1="21" y1="12" x2="9" y2="12"/>
									</svg>
									{$t('nav.logout')}
								</button>
							</div>
						</div>
					{:else}
						<button class="btn btn-ghost" on:click={goToAuth}>{$t('nav.login')}</button>
						<button class="btn btn-primary" on:click={goToAuth}>{$t('nav.register')}</button>
					{/if}
				</div>
			</div>
			
			<!-- Mobile Menu Button -->
			<button 
				class="mobile-menu-btn"
				class:active={mobileMenuOpen}
				on:click={toggleMobileMenu}
				aria-label="Toggle mobile menu"
			>
				<span class="hamburger-line"></span>
				<span class="hamburger-line"></span>
				<span class="hamburger-line"></span>
			</button>
		</div>
	</div>
</nav>

<style>
	/* Import all the styles from the original Navbar component */
	.navbar {
		position: sticky;
		top: 0;
		z-index: 40;
		background-color: var(--color-bg-primary);
		border-bottom: 1px solid var(--color-border-primary);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
	}
	
	.navbar-content {
		display: flex;
		align-items: center;
		justify-content: space-between;
		height: 4rem;
	}
	
	/* Brand */
	.navbar-brand {
		flex-shrink: 0;
	}
	
	.brand-link {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		text-decoration: none;
		color: var(--color-text-primary);
		font-weight: 600;
		font-size: 1.25rem;
		transition: color 0.2s ease;
	}
	
	.brand-link:hover {
		color: var(--color-brand-primary);
	}
	
	.brand-icon {
		display: flex;
		align-items: center;
		justify-content: center;
	}
	
	.brand-text {
		font-weight: 700;
	}
	
	/* Desktop Navigation */
	.desktop-nav {
		display: none;
		align-items: center;
		gap: var(--space-6);
	}
	
	.nav-link {
		color: var(--color-text-secondary);
		text-decoration: none;
		font-weight: 500;
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-md);
		transition: all 0.2s ease;
	}
	
	.nav-link:hover {
		color: var(--color-text-primary);
		background-color: var(--color-bg-secondary);
	}
	
	/* Desktop Actions */
	.desktop-actions {
		display: none;
		align-items: center;
		gap: var(--space-3);
	}
	
	.dropdown-trigger {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	
	.theme-icon,
	.language-flag {
		display: flex;
		align-items: center;
		justify-content: center;
	}
	
	.language-code {
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.05em;
	}
	
	.language-dropdown {
		min-width: 10rem;
	}
	
	.dropdown-item {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		width: 100%;
		padding: var(--space-3) var(--space-4);
		color: var(--color-text-primary);
		text-decoration: none;
		font-size: 0.875rem;
		line-height: 1.25rem;
		border: none;
		background: none;
		cursor: pointer;
		transition: background-color 0.2s ease;
	}
	
	.dropdown-item:hover {
		background-color: var(--color-bg-secondary);
	}
	
	.dropdown-item.active {
		background-color: var(--color-brand-primary);
		color: white;
	}
	
	.language-name {
		flex: 1;
		text-align: left;
	}
	
	.auth-actions {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	/* User Dropdown */
	.user-dropdown {
		position: relative;
	}

	.user-trigger {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-md);
		transition: all 0.2s ease;
	}

	.user-trigger:hover {
		background-color: var(--color-bg-secondary);
	}

	.user-avatar {
		width: 32px;
		height: 32px;
		border-radius: 50%;
		overflow: hidden;
		flex-shrink: 0;
	}

	.user-avatar img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.avatar-placeholder {
		width: 100%;
		height: 100%;
		background: var(--color-brand-primary);
		color: white;
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 600;
		font-size: 0.875rem;
	}

	.user-name {
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--color-text-primary);
		max-width: 120px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.user-dropdown-content {
		right: 0;
		min-width: 200px;
		margin-top: var(--space-2);
	}

	.dropdown-divider {
		height: 1px;
		background-color: var(--color-border-primary);
		margin: var(--space-2) 0;
	}

	.premium-item {
		color: var(--color-brand-primary);
		font-weight: 500;
	}

	.premium-item:hover {
		background-color: var(--color-brand-primary);
		color: white;
	}

	.logout-item {
		color: var(--color-error);
	}

	.logout-item:hover {
		background-color: var(--color-error);
		color: white;
	}
	
	/* Mobile Menu Button */
	.mobile-menu-btn {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		width: 2.5rem;
		height: 2.5rem;
		background: none;
		border: none;
		cursor: pointer;
		gap: 0.25rem;
		transition: all 0.2s ease;
	}
	
	.hamburger-line {
		width: 1.25rem;
		height: 2px;
		background-color: var(--color-text-primary);
		transition: all 0.2s ease;
		transform-origin: center;
	}
	
	.mobile-menu-btn.active .hamburger-line:nth-child(1) {
		transform: rotate(45deg) translate(0.25rem, 0.25rem);
	}
	
	.mobile-menu-btn.active .hamburger-line:nth-child(2) {
		opacity: 0;
	}
	
	.mobile-menu-btn.active .hamburger-line:nth-child(3) {
		transform: rotate(-45deg) translate(0.25rem, -0.25rem);
	}
	
	/* Screen reader only */
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
	
	/* Responsive Design */
	@media (min-width: 768px) {
		.desktop-nav,
		.desktop-actions {
			display: flex;
		}
		
		.mobile-menu-btn {
			display: none;
		}
	}
</style>