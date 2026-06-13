import { describe, expect, it, vi } from 'vitest';

const mockSupabase = {
	auth: {
		getUser: vi.fn(),
	},
	from: vi.fn(),
};

vi.mock('@/lib/supabase.js', () => ({
	createSupabaseServerClient: vi.fn(async () => mockSupabase),
	createSupabaseServerClientWithToken: vi.fn(async () => mockSupabase),
}));

import { POST } from '../../src/app/api/webhooks/route.js';

function jsonRequest(body) {
	return {
		headers: {
			get: vi.fn(() => null),
		},
		json: vi.fn(async () => body),
	};
}

describe('POST /api/webhooks', () => {
	it('parses the authenticated event request body before creating a webhook', async () => {
		mockSupabase.auth.getUser.mockResolvedValue({
			data: { user: { id: 'user-123' } },
			error: null,
		});

		const single = vi.fn(async () => ({
			data: {
				id: 'webhook-123',
				url: 'https://example.com/hook',
				events: ['message.created'],
				created_at: '2026-06-13T00:00:00.000Z',
			},
			error: null,
		}));
		const select = vi.fn(() => ({ single }));
		const insert = vi.fn(() => ({ select }));
		mockSupabase.from.mockReturnValue({ insert });

		const response = await POST(jsonRequest({
			url: 'https://example.com/hook',
			events: ['message.created'],
		}));
		const body = await response.json();

		expect(response.status).toBe(201);
		expect(body.webhook.id).toBe('webhook-123');
		expect(insert).toHaveBeenCalledWith({
			user_id: 'user-123',
			url: 'https://example.com/hook',
			events: ['message.created'],
		});
	});
});
