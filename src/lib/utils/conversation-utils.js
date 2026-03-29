/**
 * @fileoverview Shared conversation utility functions
 * Used by both SSE and WebSocket chat stores
 */

import { browser } from '$app/environment';

/**
 * Update the cached set of archived conversation IDs.
 * The service worker reads this cache entry to suppress push notifications
 * for archived conversations.
 * @param {string} conversationId - Conversation ID
 * @param {boolean} archived - Whether the conversation is now archived
 */
export async function updateArchivedConversationsCache(conversationId, archived) {
	if (!browser) return;
	try {
		const cache = await caches.open('settings-cache');
		const res = await cache.match('archived-conversations');
		let ids = [];
		if (res) {
			ids = await res.json();
		}
		if (archived) {
			if (!ids.includes(conversationId)) {
				ids.push(conversationId);
			}
		} else {
			ids = ids.filter(id => id !== conversationId);
		}
		await cache.put('archived-conversations', new Response(JSON.stringify(ids)));
	} catch (err) {
		console.error('Failed to update archived conversations cache:', err);
	}
}

/**
 * Check if a conversation is archived according to the local cache.
 * @param {string} conversationId - Conversation ID
 * @returns {Promise<boolean>}
 */
export async function isConversationArchived(conversationId) {
	if (!browser) return false;
	try {
		const cache = await caches.open('settings-cache');
		const res = await cache.match('archived-conversations');
		if (!res) return false;
		const ids = await res.json();
		return ids.includes(conversationId);
	} catch {
		return false;
	}
}

/**
 * Archive a conversation
 * @param {Function} apiPost - API POST function (from chat store)
 * @param {Function} loadConversations - Function to reload conversations
 * @param {string} conversationId - Conversation ID
 * @returns {Promise<Object>} Result object with success status
 */
export async function archiveConversation(apiPost, loadConversations, conversationId) {
	try {
		const response = await apiPost('/api/conversations/archive', { conversationId });

		if (response.success) {
			await updateArchivedConversationsCache(conversationId, true);
			await loadConversations();
			return { success: true };
		}
		return { success: false, error: response.error || 'Failed to archive conversation' };
	} catch (error) {
		console.error('Failed to archive conversation:', error);
		return { success: false, error: 'Failed to archive conversation' };
	}
}

/**
 * Unarchive a conversation
 * @param {Function} apiPost - API POST function (from chat store)
 * @param {Function} loadConversations - Function to reload conversations
 * @param {string} conversationId - Conversation ID
 * @returns {Promise<Object>} Result object with success status
 */
export async function unarchiveConversation(apiPost, loadConversations, conversationId) {
	try {
		const response = await apiPost('/api/conversations/unarchive', { conversationId });

		if (response.success) {
			await updateArchivedConversationsCache(conversationId, false);
			await loadConversations();
			return { success: true };
		}
		return { success: false, error: response.error || 'Failed to unarchive conversation' };
	} catch (error) {
		console.error('Failed to unarchive conversation:', error);
		return { success: false, error: 'Failed to unarchive conversation' };
	}
}

/**
 * Delete a conversation permanently
 * @param {Function} apiPost - API POST function (from chat store)
 * @param {Function} loadConversations - Function to reload conversations
 * @param {string} conversationId - Conversation ID
 * @returns {Promise<Object>} Result object with success status
 */
export async function deleteConversation(apiPost, loadConversations, conversationId) {
	try {
		const response = await apiPost('/api/conversations/delete', { conversationId });

		if (response.success) {
			await loadConversations();
			return { success: true };
		}
		return { success: false, error: response.error || 'Failed to delete conversation' };
	} catch (error) {
		console.error('Failed to delete conversation:', error);
		return { success: false, error: 'Failed to delete conversation' };
	}
}