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

	it('keeps a two-member group and removes only the requesting participant data', async () => {
		const messages = deleteQuery();
		const files = deleteQuery();
		const participantDelete = deleteQuery();
		participantDelete.count = 2;
		participantDelete.select = vi.fn(() => participantDelete);
		let participantQueries = 0;

		mocks.from.mockImplementation((table) => {
			if (table === 'users') return selectSingle({ id: 'internal-user-id' });
			if (table === 'conversations') return selectSingle({ type: 'group' });
			if (table === 'messages') return messages;
			if (table === 'file_attachments') return files;
			if (table === 'conversation_participants') {
				participantQueries += 1;
				return participantQueries === 1 ? participantLookup() : participantDelete;
			}
			throw new Error(`Unexpected table: ${table}`);
		});

		const { POST } = await import('./route.js');
		const response = await POST({
			json: vi.fn().mockResolvedValue({ conversationId: 'group-1' })
		});

		expect(response.status).toBe(200);
		expect(mocks.getServiceRoleClient).not.toHaveBeenCalled();
		expect(messages.eq).toHaveBeenCalledWith('sender_id', 'internal-user-id');
		expect(files.eq).toHaveBeenCalledWith('uploaded_by', 'internal-user-id');
		expect(participantDelete.eq).toHaveBeenCalledWith('user_id', 'internal-user-id');
	});
});
