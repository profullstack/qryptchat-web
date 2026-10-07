import { describe, expect, it } from 'vitest';
import { notify, notifySequence } from '../../src/cli/notify.js';

describe('qc new-message alerts', () => {
	it('sends OSC 9 and a bell by default', () => {
		expect(notifySequence('qrypt.chat', 'new message from Anthony', {})).toBe('\x1b]9;qrypt.chat: new message from Anthony\x07\x07');
	});

	it('uses OSC 99 in Kitty', () => {
		const seq = notifySequence('qrypt.chat', 'hi', { TERM: 'xterm-kitty' });
		expect(seq).toBe('\x1b]99;i=qc:d=0:o=unfocused;qrypt.chat\x1b\\\x1b]99;i=qc:d=1:p=body;hi\x1b\\\x07');
	});

	it('wraps the escape for tmux passthrough and keeps the bare bell', () => {
		const seq = notifySequence('a', 'b', { TMUX: '/tmp/tmux-1/default,1,0' });
		expect(seq).toBe('\x1bPtmux;\x1b\x1b]9;a: b\x07\x1b\\\x07');
	});

	it('can be turned off or reduced to a bell', () => {
		expect(notifySequence('a', 'b', { QC_NOTIFY: '0' })).toBe('');
		expect(notifySequence('a', 'b', { QC_NOTIFY: 'bell' })).toBe('\x07');
	});

	it('strips control characters so a name cannot break out of the escape', () => {
		expect(notifySequence('x', 'evil\x07\x1b]52;c;bad', {})).toBe('\x1b]9;x: evil  ]52 c bad\x07\x07');
	});

	it('writes only to a terminal', () => {
		const written = [];
		const pipe = { isTTY: false, write: (s) => written.push(['pipe', s]) };
		const tty = { isTTY: true, write: (s) => written.push(['tty', s]) };
		expect(notify('a', 'b', { env: {}, streams: [pipe, tty] })).toBe(true);
		expect(written).toEqual([['tty', '\x1b]9;a: b\x07\x07']]);
		expect(notify('a', 'b', { env: {}, streams: [pipe] })).toBe(false);
	});
});
