import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	createSupabaseServerClient: vi.fn(),
	createClient: vi.fn()
}));

vi.mock('@/lib/supabase.js', () => ({
	createSupabaseServerClient: mocks.createSupabaseServerClient
}));

vi.mock('@supabase/supabase-js', () => ({
	createClient: mocks.createClient
}));

describe('POST /api/keys/reset validation', () => {
	it('rejects non-string public keys before auth or service clients', async () => {
		const { POST } = await import('./route.js');
		const response = await POST({
			json: vi.fn().mockResolvedValue({
				publicKey: { key: 'not-a-string' }
			})
		});
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.error).toBe('Missing required field: publicKey');
		expect(mocks.createSupabaseServerClient).not.toHaveBeenCalled();
		expect(mocks.createClient).not.toHaveBeenCalled();
	});
});
