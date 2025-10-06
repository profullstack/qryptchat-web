/**
 * @fileoverview Shared conversation utility functions
 * Used by both SSE and WebSocket chat stores
 */

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
			await loadConversations();
			return { success: true };
		}
		return { success: false, error: response.error || 'Failed to unarchive conversation' };
	} catch (error) {
		console.error('Failed to unarchive conversation:', error);
		return { success: false, error: 'Failed to unarchive conversation' };
	}
}