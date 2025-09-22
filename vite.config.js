import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';
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
		websocketDev()
	],
	test: {
		include: ['src/**/*.{test,spec}.{js,ts}']
	}
	};
});
