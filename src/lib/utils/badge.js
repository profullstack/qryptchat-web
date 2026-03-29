/**
 * @fileoverview PWA App Badge utility using the Badging API
 * Updates the OS taskbar/dock badge with unread message count
 */

import { browser } from '$app/environment';

/**
 * Check if the Badging API is supported
 * @returns {boolean}
 */
export function isBadgingSupported() {
	return browser && 'setAppBadge' in navigator;
}

/**
 * Update the app badge with the given unread count
 * @param {number} count - Total unread message count
 */
export async function updateAppBadge(count) {
	if (!isBadgingSupported()) return;

	try {
		if (count > 0) {
			await navigator.setAppBadge(count);
		} else {
			await navigator.clearAppBadge();
		}
	} catch (error) {
		// Silently fail - badge API may throw in some contexts (e.g., non-installed PWA)
		console.warn('Failed to update app badge:', error);
	}
}

/**
 * Clear the app badge
 */
export async function clearAppBadge() {
	if (!isBadgingSupported()) return;

	try {
		await navigator.clearAppBadge();
	} catch (error) {
		console.warn('Failed to clear app badge:', error);
	}
}
