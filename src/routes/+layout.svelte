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
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<meta name="theme-color" content="#ffffff" />
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
		display: flex;
		flex-direction: column;
	}
	
	.main-content {
		flex: 1;
		display: flex;
		flex-direction: column;
		/* Account for fixed navbar */
		margin-top: calc(4rem + env(safe-area-inset-top));
	}
</style>
