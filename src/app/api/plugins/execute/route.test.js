import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	mockGetUser: vi.fn(),
	mockInitialize: vi.fn(),
	mockProcessCommand: vi.fn(),
	mockGetAvailableCommands: vi.fn(),
	mockGetHelpText: vi.fn()
}));

vi.mock('@/lib/supabase.js', () => ({
	createSupabaseServerClient: vi.fn(() => ({
		auth: {
			getUser: mocks.mockGetUser
		}
	}))
}));

vi.mock('@/lib/plugins/PluginManager.js', () => ({
	pluginManager: {
		initialized: false,
		initialize: mocks.mockInitialize,
		processCommand: mocks.mockProcessCommand,
		getAvailableCommands: mocks.mockGetAvailableCommands,
		getHelpText: mocks.mockGetHelpText,
		plugins: new Map()
	}
}));

describe('POST /api/plugins/execute validation', () => {
	it('returns 400 for malformed JSON instead of a generic 500', async () => {
		mocks.mockGetUser.mockResolvedValue({
			data: { user: { id: 'auth-user-id' } },
			error: null
		});

		const { POST } = await import('./route.js');
		const response = await POST({
			json: vi.fn().mockRejectedValue(new SyntaxError('Unexpected token'))
		});
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.error).toBe('Invalid JSON body');
		expect(mocks.mockInitialize).not.toHaveBeenCalled();
		expect(mocks.mockProcessCommand).not.toHaveBeenCalled();
	});
});
