import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit(),
		SvelteKitPWA({
			strategies: 'injectManifest',
			srcDir: 'src',
			filename: 'service-worker.ts',
			injectRegister: 'auto',
			registerType: 'autoUpdate',
			manifest: {
				name: 'HeroHabbits',
				short_name: 'HeroHabbits',
				description: 'Kids rewards and personal goal tracking for households.',
				theme_color: '#6366f1',
				background_color: '#f4f6ff',
				display: 'standalone',
				start_url: '/',
				scope: '/',
				icons: [
					{
						src: 'pwa/icon-192.png',
						sizes: '192x192',
						type: 'image/png',
						purpose: 'any'
					},
					{
						src: 'pwa/icon-512.png',
						sizes: '512x512',
						type: 'image/png',
						purpose: 'any'
					},
					{
						src: 'pwa/icon-512.png',
						sizes: '512x512',
						type: 'image/png',
						purpose: 'maskable'
					}
				]
			},
			injectManifest: {
				globPatterns: ['client/**/*.{js,css,ico,png,svg,webp,woff,woff2}']
			},
			devOptions: {
				enabled: true,
				type: 'module',
				navigateFallback: '/'
			},
			kit: {
				includeVersionFile: true
			}
		})
	],
	ssr: {
		noExternal: ['three', '@threlte/core', '@threlte/extras']
	}
});
