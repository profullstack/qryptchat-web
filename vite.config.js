import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { websocketDev } from './vite-plugins/websocket-dev.js';

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), '');
	
	return {
		server: {
			port: env.PORT ? parseInt(env.PORT) : 5173,
			host: true
		},
		build: {
			rollupOptions: {
				onwarn(warning, warn) {
					// Suppress warnings from mlkem library about comment annotations
					if (warning.code === 'COMMENT_ANNOTATION' && warning.id?.includes('mlkem')) {
						return;
					}
					// Use default for everything else
					warn(warning);
				}
			}
		},
		logLevel: 'warn', // Reduce log verbosity to suppress transformation messages
	plugins: [
		sveltekit(),
		websocketDev(),
		SvelteKitPWA({
			srcDir: './src',
			mode: mode === 'production' ? 'production' : 'development',
			strategies: 'generateSW',
			scope: '/',
			base: '/',
			disable: mode === 'development', // Disable PWA in development to avoid conflicts
			manifest: {
				short_name: 'QryptChat',
				name: 'QryptChat - Quantum-Resistant Messaging',
				start_url: '/',
				scope: '/',
				display: 'standalone',
				theme_color: '#6366f1',
				background_color: '#ffffff',
				description: 'Secure, quantum-resistant end-to-end encrypted messaging',
				categories: ['communication', 'social', 'security'],
				lang: 'en',
				dir: 'ltr',
				orientation: 'portrait-primary',
				icons: [
					{
						src: '/favicon.svg',
						sizes: '72x72',
						type: 'image/svg+xml',
						purpose: 'any'
					},
					{
						src: '/favicon.svg',
						sizes: '96x96',
						type: 'image/svg+xml',
						purpose: 'any'
					},
					{
						src: '/favicon.svg',
						sizes: '128x128',
						type: 'image/svg+xml',
						purpose: 'any'
					},
					{
						src: '/favicon.svg',
						sizes: '144x144',
						type: 'image/svg+xml',
						purpose: 'any'
					},
					{
						src: '/favicon.svg',
						sizes: '152x152',
						type: 'image/svg+xml',
						purpose: 'any'
					},
					{
						src: '/favicon.svg',
						sizes: '192x192',
						type: 'image/svg+xml',
						purpose: 'any'
					},
					{
						src: '/favicon.svg',
						sizes: '384x384',
						type: 'image/svg+xml',
						purpose: 'any'
					},
					{
						src: '/favicon.svg',
						sizes: '512x512',
						type: 'image/svg+xml',
						purpose: 'any'
					}
				],
				shortcuts: [
					{
						name: 'New Chat',
						short_name: 'New Chat',
						description: 'Start a new conversation',
						url: '/chat/new',
						icons: [{ src: '/icons/shortcut-new-chat.png', sizes: '96x96' }]
					}
				],
				screenshots: [
					{
						src: '/screenshots/desktop-1.png',
						sizes: '1280x720',
						type: 'image/png',
						form_factor: 'wide',
						label: 'QryptChat Desktop View'
					},
					{
						src: '/screenshots/mobile-1.png',
						sizes: '375x812',
						type: 'image/png',
						form_factor: 'narrow',
						label: 'QryptChat Mobile View'
					}
				]
			},
			workbox: {
				globPatterns: ['client/**/*.{js,css,html,svg,png,ico,woff,woff2}'],
				globIgnores: [
					'**/server/**',
					'server/**',
					'server/sw.js',
					'server/workbox-*.js',
					'prerendered/**/*'
				],
				// Explicitly disable prerendered file inclusion since we use SSR
				additionalManifestEntries: [],
				dontCacheBustURLsMatching: /\.\w{8}\./,
				skipWaiting: true,
				clientsClaim: true,
				runtimeCaching: [
					{
						urlPattern: /^https:\/\/.*\.supabase\.co\/(?!.*\/auth\/).*/i,
						handler: 'NetworkFirst',
						options: {
							cacheName: 'supabase-cache',
							expiration: {
								maxEntries: 100,
								maxAgeSeconds: 60 * 60 * 24 // 24 hours
							}
						}
					},
					{
						urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/,
						handler: 'CacheFirst',
						options: {
							cacheName: 'images-cache',
							expiration: {
								maxEntries: 200,
								maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
							}
						}
					}
				]
			},
			devOptions: {
				enabled: false, // Disable service worker in development
				type: 'module'
			}
		})
	],
	test: {
		include: ['src/**/*.{test,spec}.{js,ts}']
	}
	};
});
