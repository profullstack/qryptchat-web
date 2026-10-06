/**
 * The composer's DOM model: a contenteditable element that shows emoji as
 * OpenEmoji images while the message itself stays plain Unicode text.
 *
 *   value -> DOM   text nodes, <img class="openemoji" alt="😀">, <br> for '\n'
 *   DOM -> value   text + each image's alt + '\n' per <br> (or block break)
 *
 * A textarea can only draw characters, so it shows the system emoji font no
 * matter what the picker inserted; images are the only way to show our art
 * in every browser. Offsets below are positions in the VALUE string, so the
 * caret survives a rebuild of the DOM.
 */
import { artworkKey, emojiSrc } from './openemoji.js';

const PICTOGRAPHIC = /\p{Extended_Pictographic}|\p{Regional_Indicator}|⃣/u;
const segmenter = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
const graphemes = (s) => (segmenter ? Array.from(segmenter.segment(s), (x) => x.segment) : Array.from(s));

const isEmojiImg = (n) => n.nodeType === 1 && n.nodeName === 'IMG' && n.classList.contains('openemoji');
const isBr = (n) => n.nodeType === 1 && n.nodeName === 'BR';
const isBlock = (n) => n.nodeType === 1 && (n.nodeName === 'DIV' || n.nodeName === 'P');

/** The plain-text value of the editor. */
export function serialize(root) {
	let out = '';
	const walk = (node) => {
		for (const child of node.childNodes) {
			if (child.nodeType === 3) out += child.nodeValue;
			else if (isEmojiImg(child)) out += child.alt;
			else if (isBr(child)) {
				// A lone trailing <br> is the browser's placeholder for an empty line.
				if (!(child === node.lastChild && child.dataset?.trail === '1')) out += '\n';
			} else if (child.nodeType === 1) {
				// Chrome wraps new lines in <div>; treat each block as a line.
				if (isBlock(child) && out && !out.endsWith('\n')) out += '\n';
				walk(child);
			}
		}
	};
	walk(root);
	return out;
}

/** True when some emoji is still a raw character in a text node (typed or pasted). */
export function hasRawEmoji(root) {
	const walker = root.ownerDocument.createTreeWalker(root, 4 /* SHOW_TEXT */);
	for (let n = walker.nextNode(); n; n = walker.nextNode()) {
		if (PICTOGRAPHIC.test(n.nodeValue)) {
			for (const g of graphemes(n.nodeValue)) if (PICTOGRAPHIC.test(g) && artworkKey(g)) return true;
		}
	}
	return false;
}

/** Replace the editor's contents with nodes for a value. */
export function render(root, value) {
	const doc = root.ownerDocument;
	const frag = doc.createDocumentFragment();
	let text = '';
	const flush = () => {
		if (text) frag.appendChild(doc.createTextNode(text));
		text = '';
	};
	for (const g of graphemes(value)) {
		if (g === '\n' || g === '\r\n') {
			flush();
			frag.appendChild(doc.createElement('br'));
			continue;
		}
		const key = PICTOGRAPHIC.test(g) ? artworkKey(g) : null;
		if (!key) {
			text += g;
			continue;
		}
		flush();
		const img = doc.createElement('img');
		img.className = 'openemoji';
		img.src = emojiSrc(key);
		img.alt = g;
		img.draggable = false;
		frag.appendChild(img);
	}
	flush();
	// A value ending in a newline needs a placeholder <br> or the caret has no line to sit on.
	if (value.endsWith('\n')) {
		const trail = doc.createElement('br');
		trail.dataset.trail = '1';
		frag.appendChild(trail);
	}
	root.replaceChildren(frag);
}

/** Value length of a node (text length, alt length, 1 per <br>). */
function lengthOf(node) {
	if (node.nodeType === 3) return node.nodeValue.length;
	if (isEmojiImg(node)) return node.alt.length;
	if (isBr(node)) return node.dataset?.trail === '1' ? 0 : 1;
	let n = 0;
	for (const c of node.childNodes) n += lengthOf(c);
	return n;
}

/** Value offset of a DOM position (container + offset, as in a Range). */
export function valueOffset(root, container, offset) {
	let total = 0;
	const walk = (node) => {
		for (let i = 0; i < node.childNodes.length; i++) {
			const child = node.childNodes[i];
			if (node === container && i === offset) return true;
			if (child === container) {
				if (child.nodeType === 3) {
					total += offset;
					return true;
				}
				for (let j = 0; j < offset && j < child.childNodes.length; j++) total += lengthOf(child.childNodes[j]);
				return true;
			}
			if (child.nodeType === 1 && !isEmojiImg(child) && !isBr(child) && child.contains(container)) {
				if (walk(child)) return true;
				continue;
			}
			total += lengthOf(child);
		}
		return node === container;
	};
	walk(root);
	return total;
}

/** The current selection as value offsets, or null when it is outside the editor. */
export function selectionOffsets(root) {
	const sel = root.ownerDocument.getSelection?.();
	if (!sel || sel.rangeCount === 0) return null;
	const range = sel.getRangeAt(0);
	if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
	const start = valueOffset(root, range.startContainer, range.startOffset);
	const end = valueOffset(root, range.endContainer, range.endOffset);
	return { start: Math.min(start, end), end: Math.max(start, end) };
}

/** Put the caret at a value offset (after a rebuild). */
export function setCaret(root, target) {
	const doc = root.ownerDocument;
	const sel = doc.getSelection?.();
	if (!sel) return;
	const range = doc.createRange();
	let acc = 0;
	for (const child of root.childNodes) {
		const len = lengthOf(child);
		if (child.nodeType === 3 && target <= acc + len) {
			range.setStart(child, target - acc);
			range.collapse(true);
			sel.removeAllRanges();
			sel.addRange(range);
			return;
		}
		if (child.nodeType !== 3 && target <= acc) {
			range.setStartBefore(child);
			range.collapse(true);
			sel.removeAllRanges();
			sel.addRange(range);
			return;
		}
		acc += len;
	}
	// Past the end: after the last real node (before a trailing placeholder <br>).
	const last = root.lastChild;
	if (last && isBr(last) && last.dataset?.trail === '1') {
		range.setStartBefore(last);
		range.collapse(true);
	} else {
		range.selectNodeContents(root);
		range.collapse(false);
	}
	sel.removeAllRanges();
	sel.addRange(range);
}

/** Splice text into a value at a selection; returns the new value and caret. */
export function spliceValue(value, sel, text) {
	const start = sel ? sel.start : value.length;
	const end = sel ? sel.end : value.length;
	return { value: value.slice(0, start) + text + value.slice(end), caret: start + text.length };
}
