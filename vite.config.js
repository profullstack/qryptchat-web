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
			disable: false, // Enable PWA in all modes
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
						src: '/icons/apple-touch-icon-72x72.png',
						sizes: '72x72',
						type: 'image/png',
						purpose: 'any'
					},
					{
						src: '/icons/apple-touch-icon-144x144.png',
						sizes: '144x144',
						type: 'image/png',
						purpose: 'any'
					},
					{
						src: '/icons/apple-touch-icon-152x152.png',
						sizes: '152x152',
						type: 'image/png',
						purpose: 'any'
					},
					{
						src: '/icons/apple-touch-icon-180x180.png',
						sizes: '180x180',
						type: 'image/png',
						purpose: 'any'
					},
					{
						src: '/icons/icon-192x192.png',
						sizes: '192x192',
						type: 'image/png',
						purpose: 'any maskable'
					},
					{
						src: '/icons/icon-256x256.png',
						sizes: '256x256',
						type: 'image/png',
						purpose: 'any'
					},
					{
						src: '/icons/icon-384x384.png',
						sizes: '384x384',
						type: 'image/png',
						purpose: 'any'
					},
					{
						src: '/icons/icon-512x512.png',
						sizes: '512x512',
						type: 'image/png',
						purpose: 'any maskable'
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
