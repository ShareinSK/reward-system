/// <reference types="@vite-pwa/sveltekit/info" />
/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { clientsClaim } from 'workbox-core';

declare let self: ServiceWorkerGlobalScope;

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);
self.skipWaiting();
clientsClaim();

self.addEventListener('push', (event) => {
	let title = 'QuestorLog';
	let body = 'You have a new update.';
	let url = '/';
	try {
		const data = event.data?.json() as { title?: string; body?: string; url?: string };
		title = data?.title || title;
		body = data?.body || body;
		url = data?.url || url;
	} catch {
		body = event.data?.text() || body;
	}
	event.waitUntil(
		self.registration.showNotification(title, {
			body,
			icon: '/pwa/icon-192.png',
			badge: '/pwa/icon-192.png',
			data: { url }
		})
	);
});

self.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const url = (event.notification.data?.url as string) || '/';
	event.waitUntil(
		self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
			for (const client of clientList) {
				if ('focus' in client) {
					client.navigate(url);
					return client.focus();
				}
			}
			return self.clients.openWindow(url);
		})
	);
});
