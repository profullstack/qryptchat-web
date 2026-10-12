import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { newVoiceRoomLink, parseSlashCommand, voiceMessage } from '../src/lib/chat/voice.js';
import { parseVoiceArgs, runPairux, voiceLink } from '../src/cli/voice.js';

const LINK = /^https:\/\/pairux\.com\/r\/[A-Za-z0-9_-]{22}#k=[A-Za-z0-9_-]{43}$/;

describe('/voice room links', () => {
	it('are a 128-bit room id and a 32-byte key in the fragment, fresh every time', () => {
		const a = newVoiceRoomLink();
		expect(a).toMatch(LINK);
		expect(newVoiceRoomLink()).not.toBe(a);
		expect(newVoiceRoomLink('http://localhost:3000/')).toMatch(/^http:\/\/localhost:3000\/r\//);
		expect(voiceLink({ PAIRUX_API_URL: 'https://pairux.test' })).toMatch(/^https:\/\/pairux\.test\/r\//);
		expect(voiceMessage(a)).toContain(a);
	});

	it('only treat known slash commands as commands', () => {
		expect(parseSlashCommand('/voice', ['voice'])).toEqual({ name: 'voice', args: '' });
		expect(parseSlashCommand('  /archive  ', ['archive'])).toEqual({ name: 'archive', args: '' });
		expect(parseSlashCommand('/shrug', ['voice'])).toBeNull();
		expect(parseSlashCommand('/voice', [])).toBeNull();
		expect(parseSlashCommand('see /voice', ['voice'])).toBeNull();
		expect(parseSlashCommand('/usr/bin/env', ['voice'])).toBeNull();
	});
});

describe('qc voice', () => {
	it('makes a link by default and hands every other subcommand to pairux', () => {
		expect(parseVoiceArgs([])).toEqual({ action: 'link', json: false, send: null });
		expect(parseVoiceArgs(['--send', 'alice', '--json'])).toEqual({ action: 'link', json: true, send: 'alice' });
		expect(parseVoiceArgs(['room', '--send=team chat'])).toEqual({ action: 'link', json: false, send: 'team chat' });
		expect(parseVoiceArgs(['help'])).toEqual({ action: 'help' });
		expect(parseVoiceArgs(['login'])).toEqual({ action: 'pairux', args: ['login'] });
		expect(parseVoiceArgs(['join', 'ABC123', '--name', 'Bot'])).toEqual({ action: 'pairux', args: ['join', 'ABC123', '--name', 'Bot'] });
		expect(() => parseVoiceArgs(['--bogus'])).toThrow(/Unknown option/);
	});

	it('runs pairux attached to the terminal and returns its exit code', async () => {
		const child = new EventEmitter();
		const spawnImpl = vi.fn(() => child);
		const done = runPairux(['whoami'], { spawnImpl, env: { PATH: '/usr/bin' } });
		child.emit('exit', 3, null);
		expect(await done).toBe(3);
		expect(spawnImpl).toHaveBeenCalledWith('pairux', ['whoami'], expect.objectContaining({ stdio: 'inherit' }));
	});

	it('says how to install PairUX when pairux is missing', async () => {
		const child = new EventEmitter();
		const done = runPairux(['login'], { spawnImpl: () => child, env: {} });
		child.emit('error', Object.assign(new Error('spawn pairux ENOENT'), { code: 'ENOENT' }));
		await expect(done).rejects.toThrow(/installer\.pairux\.com/);
	});
});
