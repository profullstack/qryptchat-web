import { describe, expect, it } from 'vitest';

import { convertUrlsToLinks } from './url-link-converter.js';

describe('convertUrlsToLinks', () => {
	it('escapes ampersands inside linked URLs', () => {
		const html = convertUrlsToLinks('See https://example.com/search?a=1&b=2');

		expect(html).toContain('href="https://example.com/search?a=1&amp;b=2"');
		expect(html).toContain('>https://example.com/search?a=1&amp;b=2</a>');
	});

	it('renders fenced code blocks instead of escaped placeholders', () => {
		const html = convertUrlsToLinks('Before\n```const value = 1;\n```\nAfter');

		expect(html).toContain('<pre><code>const value = 1;\n</code></pre>');
		expect(html).not.toContain('CODE_BLOCK');
		expect(html).not.toContain('&lt;[CODE_BLOCK_0]&gt;');
	});

	it('does not linkify URLs inside fenced code blocks', () => {
		const html = convertUrlsToLinks('```https://example.com/search?a=1&b=2```');

		expect(html).toContain('<pre><code>https://example.com/search?a=1&amp;b=2</code></pre>');
		expect(html).not.toContain('<a href=');
	});

	it('escapes HTML inside fenced code blocks', () => {
		const html = convertUrlsToLinks('```<script>alert("x")</script>```');

		expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
		expect(html).not.toContain('<script>');
	});

	it('preserves text that resembles an internal code block placeholder', () => {
		const html = convertUrlsToLinks(
			'Literal __QRYPTCHAT_CODE_BLOCK_0__ then ```const value = 1;```'
		);

		expect(html).toBe(
			'Literal __QRYPTCHAT_CODE_BLOCK_0__ then <pre><code>const value = 1;</code></pre>'
		);
	});
});
