import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	authGetUser: vi.fn(),
	upload: vi.fn(),
	getPublicUrl: vi.fn(),
	update: vi.fn(),
	eq: vi.fn(),
	from: vi.fn(),
	storageFrom: vi.fn(),
	createClient: vi.fn((url, key) => key === 'service-role-key' ? ({
		storage: {
			from: mocks.storageFrom
		},
		from: mocks.from
	}) : ({
		auth: {
			getUser: mocks.authGetUser
		}
	}))
}));

vi.mock('@supabase/supabase-js', () => ({
	createClient: mocks.createClient
}));

const forgedToken = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ2aWN0aW0tdXNlciJ9.fake-signature';

function avatarRequest(method) {
	return new Request('https://example.com/api/auth/upload-avatar', {
		method,
		headers: {
			authorization: `Bearer ${forgedToken}`
		}
	});
}

function avatarRequestWithAuthorization(method, authorization) {
	return new Request('https://example.com/api/auth/upload-avatar', {
		method,
		headers: {
			authorization
		}
	});
}

describe('upload-avatar authentication', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
		process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
		process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
		mocks.authGetUser.mockResolvedValue({
			data: { user: null },
			error: { message: 'invalid signature' }
		});
		mocks.upload.mockResolvedValue({ error: null });
		mocks.getPublicUrl.mockReturnValue({
			data: { publicUrl: 'https://cdn.example.com/auth-user-id/avatar.png' }
		});
		mocks.update.mockReturnValue({ eq: mocks.eq });
		mocks.eq.mockResolvedValue({ error: null });
		mocks.from.mockReturnValue({ update: mocks.update });
		mocks.storageFrom.mockReturnValue({
			upload: mocks.upload,
			getPublicUrl: mocks.getPublicUrl
		});
	});

	it('rejects forged bearer tokens before POST storage/database work', async () => {
		const { POST } = await import('./route.js');

		const response = await POST(avatarRequest('POST'));
		const body = await response.json();

		expect(response.status).toBe(401);
		expect(body.error).toBe('Invalid authentication token');
		expect(mocks.authGetUser).toHaveBeenCalledWith(forgedToken);
		expect(mocks.createClient).toHaveBeenCalledTimes(1);
		expect(mocks.createClient).toHaveBeenCalledWith('https://example.supabase.co', 'anon-key');
	});

	it('rejects forged bearer tokens before DELETE database work', async () => {
		const { DELETE } = await import('./route.js');

		const response = await DELETE(avatarRequest('DELETE'));
		const body = await response.json();

		expect(response.status).toBe(401);
		expect(body.error).toBe('Invalid authentication token');
		expect(mocks.authGetUser).toHaveBeenCalledWith(forgedToken);
		expect(mocks.createClient).toHaveBeenCalledTimes(1);
		expect(mocks.createClient).toHaveBeenCalledWith('https://example.supabase.co', 'anon-key');
	});

	it('normalizes bearer scheme casing and extra spaces before validating the token', async () => {
		const { DELETE } = await import('./route.js');

		const response = await DELETE(avatarRequestWithAuthorization('DELETE', `bearer   ${forgedToken}  `));
		const body = await response.json();

		expect(response.status).toBe(401);
		expect(body.error).toBe('Invalid authentication token');
		expect(mocks.authGetUser).toHaveBeenCalledWith(forgedToken);
		expect(mocks.createClient).toHaveBeenCalledTimes(1);
		expect(mocks.createClient).toHaveBeenCalledWith('https://example.supabase.co', 'anon-key');
	});

	it('does not validate an empty bearer header', async () => {
		const { DELETE } = await import('./route.js');

		const response = await DELETE(avatarRequestWithAuthorization('DELETE', 'Bearer   '));
		const body = await response.json();

		expect(response.status).toBe(401);
		expect(body.error).toBe('Authentication required');
		expect(mocks.authGetUser).not.toHaveBeenCalled();
		expect(mocks.createClient).toHaveBeenCalledTimes(1);
		expect(mocks.createClient).toHaveBeenCalledWith('https://example.supabase.co', 'anon-key');
	});

	it('uses the validated content type for the stored avatar extension', async () => {
		vi.spyOn(Date, 'now').mockReturnValue(123456);
		mocks.authGetUser.mockResolvedValue({
			data: { user: { id: 'auth-user-id' } },
			error: null
		});

		const { POST } = await import('./route.js');
		const formData = new FormData();
		formData.set('avatar', new File(['image-bytes'], 'profile.php', { type: 'image/png' }));

		const response = await POST(new Request('https://example.com/api/auth/upload-avatar', {
			method: 'POST',
			headers: {
				authorization: 'Bearer valid-token'
			},
			body: formData
		}));

		expect(response.status).toBe(200);
		expect(mocks.upload).toHaveBeenCalledWith(
			'auth-user-id/123456.png',
			expect.any(ArrayBuffer),
			expect.objectContaining({ contentType: 'image/png' })
		);
		expect(mocks.update).toHaveBeenCalledWith({
			avatar_url: 'https://cdn.example.com/auth-user-id/avatar.png'
		});
	});
});
