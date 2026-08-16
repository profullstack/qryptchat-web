import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	from: vi.fn(),
	getServiceRoleClient: vi.fn()
}));

vi.mock('@/lib/api/middleware/auth.js', () => ({
	withAuth: (handler) => (request, context) =>
		handler({
			request,
			locals: {
				supabase: { from: mocks.from },
				user: { id: 'auth-user-id' }
			},
			context
		})
}));

vi.mock('@/lib/supabase/service-role.js', () => ({
	getServiceRoleClient: mocks.getServiceRoleClient
}));

function selectSingle(data) {
	const query = {
		select: vi.fn(() => query),
		eq: vi.fn(() => query),
		single: vi.fn().mockResolvedValue({ data, error: null })
	};
	return query;
}

function participantLookup() {
	const query = {
		select: vi.fn(() => query),
		eq: vi.fn(() => query),
		is: vi.fn(() => query),
		maybeSingle: vi.fn().mockResolvedValue({
			data: { id: 'participant-id', left_at: null, archived_at: null },
			error: null
		})
	};
	return query;
}

function deleteQuery() {
	const query = {
		error: null,
		delete: vi.fn(() => query),
		eq: vi.fn(() => query)
	};
	return query;
}

describe('POST /api/conversations/delete', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
	});

	/**
	 * Service-role view of who is still in the conversation after the caller leaves.
	 * @param {Array<{id: string}>} rows
	 */
	function remainingParticipants(rows) {
		// Doubles as the delete target used by the orphan cleanup, so it carries both
		// the select chain and delete/eq.
		const query = {
			error: null,
			select: vi.fn(() => query),
			delete: vi.fn(() => query),
			eq: vi.fn(() => query),
			is: vi.fn(() => query),
			limit: vi.fn().mockResolvedValue({ data: rows, error: null })
		};
		return query;
	}

	/**
	 * Wire up the happy path for a caller leaving `type` conversation, with `rows`
	 * describing who remains behind afterwards.
	 */
	function setup({ type, rows }) {
		const messages = deleteQuery();
		const files = deleteQuery();
		const participantDelete = deleteQuery();
		let participantQueries = 0;

		mocks.from.mockImplementation((table) => {
			if (table === 'users') return selectSingle({ id: 'internal-user-id' });
			if (table === 'conversations') return selectSingle({ type });
			if (table === 'messages') return messages;
			if (table === 'file_attachments') return files;
			if (table === 'conversation_participants') {
				participantQueries += 1;
				return participantQueries === 1 ? participantLookup() : participantDelete;
			}
			throw new Error(`Unexpected table: ${table}`);
		});

		const serviceTables = {
			conversation_participants: remainingParticipants(rows),
			messages: deleteQuery(),
			sms_notifications: deleteQuery(),
			typing_indicators: deleteQuery(),
			conversations: deleteQuery()
		};
		mocks.getServiceRoleClient.mockReturnValue({
			from: vi.fn((table) => serviceTables[table])
		});

		return { messages, files, participantDelete, serviceTables };
	}

	it('keeps a two-member group and removes only the requesting participant data', async () => {
		const { messages, files, participantDelete, serviceTables } = setup({
			type: 'group',
			rows: [{ id: 'someone-else' }]
		});

		const { POST } = await import('./route.js');
		const response = await POST({
			json: vi.fn().mockResolvedValue({ conversationId: 'group-1' })
		});

		expect(response.status).toBe(200);
		expect(messages.eq).toHaveBeenCalledWith('sender_id', 'internal-user-id');
		expect(files.eq).toHaveBeenCalledWith('uploaded_by', 'internal-user-id');
		expect(participantDelete.eq).toHaveBeenCalledWith('user_id', 'internal-user-id');
		expect(serviceTables.conversations.delete).not.toHaveBeenCalled();
	});

	// GHSA-xm8x-rpr6-4j7h: a single participant used to be able to hard-delete an entire
	// direct conversation -- every other party's ciphertext and files included.
	it('does not destroy a direct conversation while the other party is still in it', async () => {
		const { messages, serviceTables } = setup({
			type: 'direct',
			rows: [{ id: 'the-other-party' }]
		});

		const { POST } = await import('./route.js');
		const response = await POST({
			json: vi.fn().mockResolvedValue({ conversationId: 'direct-1' })
		});

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ success: true, conversationRemoved: false });
		// The caller's own messages go; nothing wipes the conversation wholesale.
		expect(messages.eq).toHaveBeenCalledWith('sender_id', 'internal-user-id');
		expect(serviceTables.messages.delete).not.toHaveBeenCalled();
		expect(serviceTables.conversations.delete).not.toHaveBeenCalled();
	});

	it('garbage-collects the conversation once the last participant leaves', async () => {
		const { serviceTables } = setup({ type: 'direct', rows: [] });

		const { POST } = await import('./route.js');
		const response = await POST({
			json: vi.fn().mockResolvedValue({ conversationId: 'direct-2' })
		});

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ success: true, conversationRemoved: true });
		expect(serviceTables.conversations.delete).toHaveBeenCalled();
	});
});
