<script>
	import { t } from '$lib/stores/i18n.js';
	
	const socialLinks = [
		{
			name: 'Discord',
			url: 'https://discord.gg/profullstack',
			icon: `<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
				<path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z"/>
			</svg>`
		},
		{
			name: 'GitHub',
			url: 'https://github.com/profullstack',
			icon: `<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
				<path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
			</svg>`
		},
		{
			name: 'X (Twitter)',
			url: 'https://x.com/profullstack',
			icon: `<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
				<path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z"/>
			</svg>`
		},
		{
			name: 'Bluesky',
			url: 'https://bsky.app/profile/profullstack.bsky.social',
			icon: `<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
				<path d="M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944 1.561 1.266.902 1.565.139 1.908 0 3.08 0 3.768c0 .69.378 5.65.624 6.479.815 2.736 3.713 3.66 6.383 3.364.136-.02.275-.039.415-.056-.138.017-.275.036-.415.056-2.67-.296-5.568.628-6.383 3.364C.378 17.902 0 22.862 0 23.55c0 .688.139 1.86.902 2.203.659.299 1.664.621 4.3-1.239 2.752-1.942 5.711-5.881 6.798-7.995 1.087 2.114 4.046 6.053 6.798 7.995 2.636 1.86 3.641 1.538 4.3 1.239.763-.343.902-1.515.902-2.203 0-.688-.378-5.648-.624-6.479-.815-2.736-3.713-3.66-6.383-3.364-.14.017-.277.039-.415.056.138-.017.275-.036.415-.056 2.67.296 5.568-.628 6.383-3.364.246-.829.624-5.789.624-6.479 0-.688-.139-1.86-.902-2.203-.659-.299-1.664-.621-4.3 1.239-2.752 1.942-5.711 5.881-6.798 7.995Z"/>
			</svg>`
		},
		{
			name: 'Nostr',
			url: 'https://primal.net/p/npub1profullstack',
			icon: `<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
				<path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 16.894L12 12l5.894-4.894a.5.5 0 0 0-.707-.707L12 11.586 6.813 6.399a.5.5 0 0 0-.707.707L11.293 12l-5.187 4.894a.5.5 0 0 0 .707.707L12 12.414l5.187 5.187a.5.5 0 0 0 .707-.707z"/>
			</svg>`
		}
	];
	
	const currentYear = new Date().getFullYear();
</script>

<footer class="bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 mt-auto">
	<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
		<div class="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
			<!-- Branding and Mission -->
			<div class="text-center md:text-left">
				<p class="text-gray-600 dark:text-gray-300 text-sm mb-2">
					Built with <span class="text-red-500">❤️</span> for a quantum-safe future
				</p>
				<p class="text-gray-500 dark:text-gray-400 text-xs">
					© {currentYear} Profullstack, Inc. All rights reserved.
				</p>
			</div>
			
			<!-- Social Links -->
			<div class="flex items-center space-x-4">
				<span class="text-gray-500 dark:text-gray-400 text-sm hidden sm:block">
					{$t('footer.followUs')}
				</span>
				<div class="flex space-x-3">
					{#each socialLinks as social}
						<a
							href={social.url}
							target="_blank"
							rel="noopener noreferrer"
							class="text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors duration-200"
							aria-label={`Follow us on ${social.name}`}
							title={social.name}
						>
							{@html social.icon}
						</a>
					{/each}
				</div>
			</div>
		</div>
		
		<!-- Additional Links (Optional) -->
		<div class="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
			<div class="flex flex-col sm:flex-row justify-center items-center space-y-2 sm:space-y-0 sm:space-x-6 text-xs text-gray-500 dark:text-gray-400">
				<a href="/privacy" class="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
					{$i18n.footer?.privacy || 'Privacy Policy'}
				</a>
				<a href="/terms" class="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
					{$i18n.footer?.terms || 'Terms of Service'}
				</a>
				<a href="/security" class="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
					{$i18n.footer?.security || 'Security'}
				</a>
				<a href="/contact" class="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
					{$i18n.footer?.contact || 'Contact'}
				</a>
			</div>
		</div>
	</div>
</footer>