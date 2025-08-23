import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
	plugins: [sveltekit()],
	test: {
		include: ['src/**/*.{test,spec}.{js,ts}', 'tests/**/*.{test,spec}.{js,ts}'],
		environment: 'jsdom',
		globals: true,
		setupFiles: ['./tests/setup.js'],
		coverage: {
			reporter: ['text', 'json', 'html'],
			exclude: [
				'node_modules/',
				'src/test/',
				'tests/setup.js',
				'tests/mocks/',
				'**/*.d.ts',
				'**/*.config.{js,ts}',
				'**/coverage/**'
			],
			include: [
				'src/**/*.{js,ts}',
				'!src/**/*.{test,spec}.{js,ts}'
			]
		},
		alias: {
			'$lib': new URL('./src/lib', import.meta.url).pathname,
			'$app': new URL('./node_modules/@sveltejs/kit/src/runtime/app', import.meta.url).pathname
		}
	}
});