import { describe, expect, it } from 'vitest';
import { validateWebhookUrl } from '../src/lib/webhooks/url-validation.js';

describe('validateWebhookUrl', () => {
	it('accepts public http and https webhook URLs', () => {
		expect(validateWebhookUrl('https://example.com/webhook')).toEqual({
			ok: true,
			url: 'https://example.com/webhook'
		});
		expect(validateWebhookUrl(' http://hooks.example.com/path ')).toEqual({
			ok: true,
			url: 'http://hooks.example.com/path'
		});
	});

	it('rejects non-http webhook schemes before server-side fetch', () => {
		expect(validateWebhookUrl('javascript:alert(1)')).toMatchObject({ ok: false });
		expect(validateWebhookUrl('file:///etc/passwd')).toMatchObject({ ok: false });
		expect(validateWebhookUrl('ftp://example.com/hook')).toMatchObject({ ok: false });
	});

	it('rejects localhost and private network webhook destinations', () => {
		for (const url of [
			'http://localhost/hook',
			'http://api.localhost/hook',
			'http://127.0.0.1/hook',
			'http://10.0.0.4/hook',
			'http://172.16.0.1/hook',
			'http://192.168.1.1/hook',
			'http://[::1]/hook',
			'http://[fe80::1]/hook',
			'http://[fd00::1]/hook'
		]) {
			expect(validateWebhookUrl(url)).toMatchObject({ ok: false });
		}
	});
});
