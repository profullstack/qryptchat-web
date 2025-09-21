import adapter from '@sveltejs/adapter-node';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		// Use Node.js adapter for Railway deployment
		adapter: adapter({
			out: 'build',
			bodySizeLimit: '2gb'
		})
	}
};

export default config;
