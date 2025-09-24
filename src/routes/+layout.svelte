<script>
	import '../app.css';
	import Navbar from '$lib/components/Navbar.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import PWAToastManager from '$lib/components/PWAToastManager.svelte';
	import IncomingCallModal from '$lib/components/voice-call/IncomingCallModal.svelte';
	import ActiveCallInterface from '$lib/components/voice-call/ActiveCallInterface.svelte';
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { currentTheme, themeUtils } from '$lib/stores/theme.js';
	import { i18nUtils } from '$lib/stores/i18n.js';

	let { children } = $props();

	// Hide footer on chat page for full-screen chat experience
	const shouldShowFooter = $derived($page.route.id !== '/chat');
	
	// Subscribe to theme changes and apply them
	$effect(() => {
		themeUtils.applyTheme($currentTheme);
	});
	
	onMount(() => {
		// Initialize theme with system preference detection
		let theme = localStorage.getItem('qrypt-theme');
		if (!theme) {
			// Default to system preference if no saved theme
			theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
		}
		
		const language = localStorage.getItem('qrypt-language') || 'en';
		
		themeUtils.setTheme(theme);
		i18nUtils.applyLanguage(language);
	});
</script>

<svelte:head>
	<link rel="icon" href="/favicon.svg" />
	<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
	<meta name="theme-color" content="#ffffff" />
	<meta name="apple-mobile-web-app-capable" content="yes" />
	<meta name="apple-mobile-web-app-status-bar-style" content="default" />
</svelte:head>

<div class="app">
	<Navbar />
	<main class="main-content">
		{@render children?.()}
	</main>
	{#if shouldShowFooter}
		<Footer />
	{/if}
	<PWAToastManager />
</div>

<!-- Global voice call components -->
<IncomingCallModal />
<ActiveCallInterface />

<style>
	.app {
		min-height: 100vh;
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
		/* Handle safe areas for PWA */
		padding-top: env(safe-area-inset-top);
		padding-left: env(safe-area-inset-left);
		padding-right: env(safe-area-inset-right);
		background: var(--color-bg-primary);
	}
	
	.main-content {
		flex: 1;
		display: flex;
		flex-direction: column;
		/* Account for fixed navbar */
		margin-top: 4rem;
	}
</style>
