import { describe, expect, it, vi } from 'vitest';
import { sseManager } from './sse-manager.js';

describe('sseManager rooms', () => {
	it('keeps a user in their rooms while another of their connections is open', () => {
		vi.spyOn(console, 'log').mockImplementation(() => {});
		const browser = { write: vi.fn() };
		const terminal = { write: vi.fn() };
		sseManager.addConnection(browser, 'u-rooms');
		sseManager.addConnection(terminal, 'u-rooms');
		sseManager.joinRoom('u-rooms', 'conv-rooms');

		// qc reconnecting must not silence the open browser tab.
		sseManager.removeConnection(terminal);
		sseManager.broadcastToRoom('conv-rooms', 'NEW_MESSAGE', { id: 1 });
		expect(browser.write).toHaveBeenCalled();

		sseManager.removeConnection(browser);
		expect(sseManager.conversationRooms.has('conv-rooms')).toBe(false);
	});
});
