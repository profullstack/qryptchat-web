import { describe, expect, it } from 'vitest';

import { convertUrlsToLinks } from './url-link-converter.js';

describe('convertUrlsToLinks', () => {
	it('escapes ampersands inside linked URLs', () => {
		const html = convertUrlsToLinks('See https://example.com/search?a=1&b=2');

		expect(html).toContain('href="https://example.com/search?a=1&amp;b=2"');
		expect(html).toContain('>https://example.com/search?a=1&amp;b=2</a>');
	});
});
