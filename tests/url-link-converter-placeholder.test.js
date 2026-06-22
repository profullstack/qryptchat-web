import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { convertUrlsToLinks } from '../src/lib/utils/url-link-converter.js';

describe('convertUrlsToLinks code block placeholders', () => {
	it('does not replace user-authored placeholder-like text with code block HTML', () => {
		const html = convertUrlsToLinks('literal __CODE_BLOCK_0__ here\n```js\nconsole.log(1)\n```');

		assert.match(html, /literal __CODE_BLOCK_0__ here/);
		assert.match(html, /<pre><code>js\nconsole\.log\(1\)\n<\/code><\/pre>/);
		assert.doesNotMatch(html, /<br>__CODE_BLOCK_0__$/);
	});
});
