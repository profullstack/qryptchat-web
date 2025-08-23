import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), '');
	
	return {
		server: {
			port: env.PORT ? parseInt(env.PORT) : 5173,
			host: true
		},
	plugins: [
		sveltekit(),
		SvelteKitPWA({
			srcDir: './src',
			mode: 'development',
			strategies: 'generateSW',
			scope: '/',
			base: '/',
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
						src: '/icons/icon-72x72.png',
						sizes: '72x72',
						type: 'image/png',
						purpose: 'maskable any'
					},
					{
						src: '/icons/icon-96x96.png',
						sizes: '96x96',
						type: 'image/png',
						purpose: 'maskable any'
					},
					{
						src: '/icons/icon-128x128.png',
						sizes: '128x128',
						type: 'image/png',
						purpose: 'maskable any'
					},
					{
						src: '/icons/icon-144x144.png',
						sizes: '144x144',
						type: 'image/png',
						purpose: 'maskable any'
					},
					{
						src: '/icons/icon-152x152.png',
						sizes: '152x152',
						type: 'image/png',
						purpose: 'maskable any'
					},
					{
						src: '/icons/icon-192x192.png',
						sizes: '192x192',
						type: 'image/png',
						purpose: 'maskable any'
					},
					{
						src: '/icons/icon-384x384.png',
						sizes: '384x384',
						type: 'image/png',
						purpose: 'maskable any'
					},
					{
						src: '/icons/icon-512x512.png',
						sizes: '512x512',
						type: 'image/png',
						purpose: 'maskable any'
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
					'server/workbox-*.js'
				],
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
				enabled: true,
				type: 'module'
			}
		})
	],
	test: {
		include: ['src/**/*.{test,spec}.{js,ts}']
	}
	};
});
