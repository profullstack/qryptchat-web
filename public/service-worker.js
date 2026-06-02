/**
 * Simple Service Worker for QryptChat PWA
 * Based on working zymo.tv implementation
 */

self.addEventListener('install', function (event) {
	console.log('Service Worker: Installed');
	event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', function (event) {
	console.log('Service Worker: Activated');
	event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
	// Basic fetch handling - serve from network
	// console.log('Fetch event:', event.request.url);
});

// Handle push notifications
self.addEventListener('push', (event) => {
	if (!event.data) return;

	try {
		const data = event.data.json();
		const { title, body, icon, tag } = data;

		const options = {
			body: body || 'New message received',
			icon: icon || '/icons/icon-192x192.png',
			tag: tag || 'qryptchat-message',
			requireInteraction: true
		};

		event.waitUntil(
			self.registration.showNotification(title || 'QryptChat', options)
		);
	} catch (error) {
		console.error('Error handling push notification:', error);
		// Show a generic notification
		event.waitUntil(
			self.registration.showNotification('QryptChat', {
				body: 'New message received',
				icon: '/icons/icon-192x192.png'
			})
		);
	}
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
	event.notification.close();

	const url = '/chat';

	event.waitUntil(
		self.clients.matchAll({ type: 'window' }).then((clientList) => {
			// Check if app is already open
			for (const client of clientList) {
				if (client.url.includes('/chat') && 'focus' in client) {
					return client.focus();
				}
			}

			// Open new window if app is not open
			if (self.clients.openWindow) {
				return self.clients.openWindow(url);
			}
		})
	);
});

// Handle app updates
self.addEventListener('message', (event) => {
	if (event.data && event.data.type === 'SKIP_WAITING') {
		self.skipWaiting();
	}
});

console.log('Service Worker loaded');