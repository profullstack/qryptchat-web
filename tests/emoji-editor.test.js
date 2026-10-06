import { describe, it, expect, beforeEach } from 'vitest';
import { render, serialize, hasRawEmoji, valueOffset, selectionOffsets, setCaret, spliceValue } from '../src/lib/emoji/editor-dom.js';

let root;
beforeEach(() => {
	root = document.createElement('div');
	root.contentEditable = 'true';
	document.body.replaceChildren(root);
});

describe('editor DOM model', () => {
	it('draws emoji as OpenEmoji images and serializes back to the same text', () => {
		const value = 'ship it 🚀 now\n👩‍💻 ❤️ 👍🏽 done';
		render(root, value);
		const imgs = [...root.querySelectorAll('img.openemoji')];
		expect(imgs.map((i) => i.alt)).toEqual(['🚀', '👩‍💻', '❤️']);
		expect(imgs[0].getAttribute('src')).toBe('/openemoji/64/1f680.webp');
		expect(root.querySelectorAll('br')).toHaveLength(1);
		// Skin-tone variants have no shipped art: they stay text, value intact.
		expect(serialize(root)).toBe(value);
		expect(hasRawEmoji(root)).toBe(false);
	});

	it('keeps a trailing newline editable without adding to the value', () => {
		render(root, 'line\n');
		expect(root.lastChild.nodeName).toBe('BR');
		expect(serialize(root)).toBe('line\n');
	});

	it('spots an emoji typed as a raw character', () => {
		root.textContent = 'hi 🔥';
		expect(hasRawEmoji(root)).toBe(true);
		render(root, serialize(root));
		expect(hasRawEmoji(root)).toBe(false);
		expect(root.querySelector('img').alt).toBe('🔥');
	});

	it('reads Chrome-style <div> lines as newlines', () => {
		root.innerHTML = 'one<div>two</div><div>three</div>';
		expect(serialize(root)).toBe('one\ntwo\nthree');
	});

	it('maps DOM positions to value offsets across images and line breaks', () => {
		render(root, 'ab🚀cd\nef');
		const [t1, img, t2, br, t3] = root.childNodes;
		expect(img.alt).toBe('🚀');
		expect(valueOffset(root, t1, 1)).toBe(1);
		expect(valueOffset(root, t2, 0)).toBe(4); // after "ab" + 🚀 (2 code units)
		expect(valueOffset(root, t3, 2)).toBe(9);
		expect(valueOffset(root, root, 2)).toBe(4); // before the second text node
		expect(br.nodeName).toBe('BR');
	});

	it('puts the caret back at a value offset after a rebuild', () => {
		render(root, 'ab🚀cd');
		setCaret(root, 5);
		expect(selectionOffsets(root)).toEqual({ start: 5, end: 5 });
		setCaret(root, 2);
		expect(selectionOffsets(root)).toEqual({ start: 2, end: 2 });
		setCaret(root, 999);
		expect(selectionOffsets(root)?.start).toBe(6);
	});

	it('splices text at a selection', () => {
		expect(spliceValue('hello world', { start: 6, end: 11 }, '🌍')).toEqual({ value: 'hello 🌍', caret: 8 });
		expect(spliceValue('hi', null, '!')).toEqual({ value: 'hi!', caret: 3 });
	});
});
