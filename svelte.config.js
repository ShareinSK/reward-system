import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter({
			// GitHub Pages serves 404.html for unknown paths — used as the SPA shell
			fallback: '404.html',
			pages: 'build',
			assets: 'build',
			precompress: false,
			strict: true
		}),
		paths: {
			// Set BASE_PATH=/repo-name in CI for project pages; leave unset for user site or local dev
			base: process.argv.includes('dev') ? '' : (process.env.BASE_PATH ?? ''),
			// Absolute base avoids GitHub Pages reload loops from runtime-relative base detection
			relative: false
		},
		prerender: {
			// Follow every reachable link during build; SPA routes still fall back to 404.html
			entries: ['*'],
			// Dynamic routes like /participants/[id] are not crawlable at build time
			handleUnseenRoutes: 'ignore'
		}
	}
};

export default config;
