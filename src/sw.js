/**
 * @fileoverview Service Worker for QryptChat PWA
 * Handles offline functionality, caching, and background sync
 */

import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst, CacheFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { BackgroundSync } from 'workbox-background-sync';
import { ExpirationPlugin } from 'workbox-expiration';

// Precache all static assets
precacheAndRoute(self.__WB_MANIFEST);

// Clean up outdated caches
cleanupOutdatedCaches();

// Cache strategy for API calls
registerRoute(
	({ url }) => url.origin === 'https://your-project.supabase.co' && !url.pathname.includes('/auth/'),
	new NetworkFirst({
		cacheName: 'supabase-api-cache',
		plugins: [
			new ExpirationPlugin({
				maxEntries: 100,
				maxAgeSeconds: 60 * 60 * 24 // 24 hours
			})
		]
	})
);

// Cache strategy for images
registerRoute(
	({ request }) => request.destination === 'image',
	new CacheFirst({
		cacheName: 'images-cache',
		plugins: [
			new ExpirationPlugin({
				maxEntries: 200,
				maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
			})
		]
	})
);

// Cache strategy for fonts
registerRoute(
	({ request }) => request.destination === 'font',
	new CacheFirst({
		cacheName: 'fonts-cache',
		plugins: [
			new ExpirationPlugin({
				maxEntries: 50,
				maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
			})
		]
	})
);

// Background sync for failed message sends
const bgSync = new BackgroundSync('message-queue', {
	maxRetentionTime: 24 * 60 // Retry for max of 24 Hours (specified in minutes)
});

// Register background sync for message sending
registerRoute(
	({ url }) => url.pathname.includes('/api/messages'),
	new NetworkFirst({
		cacheName: 'messages-cache',
		plugins: [bgSync]
	}),
	'POST'
);

// Handle push notifications
self.addEventListener('push', (event) => {
	if (!event.data) return;

	try {
		const data = event.data.json();
		const { title, body, icon, badge, tag, data: notificationData } = data;

		const options = {
			body,
			icon: icon || '/icons/icon-192x192.png',
			badge: badge || '/icons/badge-72x72.png',
			tag: tag || 'qryptchat-message',
			data: notificationData,
			requireInteraction: true,
			actions: [
				{
					action: 'reply',
					title: 'Reply',
					icon: '/icons/action-reply.png'
				},
				{
					action: 'view',
					title: 'View',
					icon: '/icons/action-view.png'
				}
			]
		};

		event.waitUntil(self.registration.showNotification(title, options));
	} catch (error) {
		console.error('Error handling push notification:', error);
	}
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
	event.notification.close();

	const { action, data } = event;
	const { conversationId, messageId } = data || {};

	let url = '/chat';
	if (conversationId) {
		url = `/chat/${conversationId}`;
	}

	if (action === 'reply') {
		// Open chat with reply focus
		url += '?reply=true';
	} else if (action === 'view') {
		// Just open the conversation
		url += `#message-${messageId}`;
	}

	event.waitUntil(
		clients.matchAll({ type: 'window' }).then((clientList) => {
			// Check if app is already open
			for (const client of clientList) {
				if (client.url.includes('/chat') && 'focus' in client) {
					client.postMessage({
						type: 'NAVIGATE',
						url,
						conversationId,
						messageId,
						action
					});
					return client.focus();
				}
			}

			// Open new window if app is not open
			if (clients.openWindow) {
				return clients.openWindow(url);
			}
		})
	);
});

// Handle background sync
self.addEventListener('sync', (event) => {
	if (event.tag === 'message-queue') {
		event.waitUntil(
			// Process queued messages
			processQueuedMessages()
		);
	}
});

/**
 * Process queued messages when back online
 */
async function processQueuedMessages() {
	try {
		// Get queued messages from IndexedDB
		const queuedMessages = await getQueuedMessages();

		for (const message of queuedMessages) {
			try {
				// Attempt to send the message
				const response = await fetch('/api/messages', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify(message.data)
				});

				if (response.ok) {
					// Remove from queue if successful
					await removeQueuedMessage(message.id);
				}
			} catch (error) {
				console.error('Failed to send queued message:', error);
			}
		}
	} catch (error) {
		console.error('Error processing queued messages:', error);
	}
}

/**
 * Get queued messages from IndexedDB
 */
async function getQueuedMessages() {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open('qryptchat-queue', 1);

		request.onerror = () => reject(request.error);

		request.onsuccess = () => {
			const db = request.result;
			const transaction = db.transaction(['messages'], 'readonly');
			const store = transaction.objectStore('messages');
			const getAllRequest = store.getAll();

			getAllRequest.onsuccess = () => resolve(getAllRequest.result);
			getAllRequest.onerror = () => reject(getAllRequest.error);
		};

		request.onupgradeneeded = () => {
			const db = request.result;
			if (!db.objectStoreNames.contains('messages')) {
				db.createObjectStore('messages', { keyPath: 'id', autoIncrement: true });
			}
		};
	});
}

/**
 * Remove queued message from IndexedDB
 */
async function removeQueuedMessage(id) {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open('qryptchat-queue', 1);

		request.onerror = () => reject(request.error);

		request.onsuccess = () => {
			const db = request.result;
			const transaction = db.transaction(['messages'], 'readwrite');
			const store = transaction.objectStore('messages');
			const deleteRequest = store.delete(id);

			deleteRequest.onsuccess = () => resolve();
			deleteRequest.onerror = () => reject(deleteRequest.error);
		};
	});
}

// Handle app updates
self.addEventListener('message', (event) => {
	if (event.data && event.data.type === 'SKIP_WAITING') {
		self.skipWaiting();
	}
});

// Activate event - claim clients immediately
self.addEventListener('activate', (event) => {
	event.waitUntil(clients.claim());
});

// Install event
self.addEventListener('install', (event) => {
	// Skip waiting to activate immediately
	self.skipWaiting();
});