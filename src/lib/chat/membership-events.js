/**
 * Live events for changes to who is in a chat and how a user files it, so every
 * open device (each browser tab, each qc session) updates its chat list at once
 * instead of waiting for its next poll.
 *
 *   PARTICIPANTS_JOINED   { conversationId, userIds }   to everyone in the chat, joiners included
 *   PARTICIPANT_LEFT      { conversationId, userId }    to everyone left, and to the leaver's devices
 *   CONVERSATION_ARCHIVED { conversationId, archived }  to the one user's devices (archiving is per user)
 *
 * sseManager.sendToUser writes to every connection a user has, which is what
 * makes these reach all devices. Announcing never fails the request it follows.
 */

export const MEMBERSHIP_EVENTS = {
	JOINED: 'PARTICIPANTS_JOINED',
	LEFT: 'PARTICIPANT_LEFT',
	ARCHIVED: 'CONVERSATION_ARCHIVED',
};

/** The window event the web store raises for any of them (the sidebar keeps its own list). */
export const CHATS_CHANGED_EVENT = 'qrypt:chats-changed';

/** Events after which a client should reload its chat list. */
export const CHAT_LIST_EVENTS = new Set(['CONVERSATION_CREATED', ...Object.values(MEMBERSHIP_EVENTS)]);

const safely = (fn) => {
	try {
		fn();
	} catch (error) {
		console.error('[membership-events] announce failed:', error?.message);
	}
};

/** New members are in: put them in the live room and tell the whole chat. */
export function announceJoined(sse, conversationId, userIds) {
	if (!conversationId || !userIds?.length) return;
	safely(() => {
		for (const id of userIds) sse.joinRoom(id, conversationId);
		sse.broadcastToRoom(conversationId, MEMBERSHIP_EVENTS.JOINED, { conversationId, userIds, at: new Date().toISOString() });
	});
}

/** Someone left (or deleted the chat for themselves). */
export function announceLeft(sse, conversationId, userId) {
	if (!conversationId || !userId) return;
	safely(() => {
		const data = { conversationId, userId, at: new Date().toISOString() };
		sse.leaveRoom(userId, conversationId);
		sse.broadcastToRoom(conversationId, MEMBERSHIP_EVENTS.LEFT, data);
		sse.sendToUser(userId, MEMBERSHIP_EVENTS.LEFT, data);
	});
}

/** A user archived or unarchived a chat: only their own devices care. */
export function announceArchived(sse, userId, conversationId, archived) {
	if (!conversationId || !userId) return;
	safely(() => sse.sendToUser(userId, MEMBERSHIP_EVENTS.ARCHIVED, { conversationId, archived: !!archived, at: new Date().toISOString() }));
}
