<script>
	import '../app.css';
	import Navbar from '$lib/components/Navbar.svelte';
	import PWAToastManager from '$lib/components/PWAToastManager.svelte';
	import { onMount } from 'svelte';
	import { themeUtils } from '$lib/stores/theme.js';
	import { i18nUtils } from '$lib/stores/i18n.js';

	let { children } = $props();
	
	onMount(() => {
		// Initialize theme and language on mount
		const theme = localStorage.getItem('qrypt-theme') || 'light';
		const language = localStorage.getItem('qrypt-language') || 'en';
		
		themeUtils.applyTheme(theme);
		i18nUtils.applyLanguage(language);
	});
</script>

<svelte:head>
	<link rel="icon" href="/favicon.png" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
</svelte:head>

<div class="app">
	<Navbar />
	<main class="main-content">
		{@render children?.()}
	</main>
</div>

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
	}
</style>
