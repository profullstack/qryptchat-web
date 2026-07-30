import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	deleteMock: vi.fn(),
	eqMock: vi.fn()
}));

vi.mock('@/lib/api/middleware/auth.js', () => ({
	withAuth: (handler) => (request, context) =>
		handler({
			request,
			locals: {
				supabase: {
					from: vi.fn(() => ({
						delete: mocks.deleteMock
					}))
				},
				user: { id: 'auth-user-id' }
			},
			context
		})
}));

describe('DELETE /api/webhooks/[id]', () => {
	it('rejects blank webhook ids before deleting', async () => {
		const { DELETE } = await import('./route.js');
		const response = await DELETE(new Request('https://qrypt.chat/api/webhooks/%20'), {
			params: Promise.resolve({ id: '   ' })
		});
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body).toEqual({ error: 'Webhook id is required' });
		expect(mocks.deleteMock).not.toHaveBeenCalled();
		expect(mocks.eqMock).not.toHaveBeenCalled();
	});

	it('reads the webhook id from route context params', async () => {
		mocks.eqMock.mockReturnThis();
		mocks.deleteMock.mockReturnValue({ eq: mocks.eqMock });

		const { DELETE } = await import('./route.js');
		const response = await DELETE(new Request('https://qrypt.chat/api/webhooks/hook-1'), {
			params: Promise.resolve({ id: 'hook-1' })
		});
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body).toEqual({ success: true });
		expect(mocks.eqMock).toHaveBeenCalledWith('id', 'hook-1');
		expect(mocks.eqMock).toHaveBeenCalledWith('user_id', 'auth-user-id');
	});
});
