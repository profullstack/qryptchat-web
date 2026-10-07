import { describe, expect, it } from 'vitest';
import { compareVersions, installCommand, update } from '../../src/cli/update.js';

const registry = (version) => async () => ({ ok: true, json: async () => ({ version }) });

describe('qc update', () => {
	it('compares versions numerically', () => {
		expect(compareVersions('0.6.10', '0.6.9')).toBe(1);
		expect(compareVersions('0.6.2', '0.6.2')).toBe(0);
		expect(compareVersions('0.7.0', '1.0.0')).toBe(-1);
		expect(compareVersions('1.0.0-beta', '1.0.0')).toBe(-1);
	});

	it('reinstalls with the package manager that installed qc', () => {
		expect(installCommand('/home/a/.local/share/mise/installs/node/lts/lib/node_modules/@profullstack/qryptchat/bin/qc.js')).toEqual({
			cmd: 'npm',
			args: ['install', '-g', '@profullstack/qryptchat@latest'],
		});
		expect(installCommand('/home/a/.bun/install/global/node_modules/@profullstack/qryptchat/bin/qc.js').cmd).toBe('bun');
		expect(installCommand('/home/a/.local/share/pnpm/global/5/node_modules/@profullstack/qryptchat/bin/qc.js').cmd).toBe('pnpm');
		expect(installCommand('/home/a/.npm/_npx/abc/node_modules/@profullstack/qryptchat/bin/qc.js')).toEqual({ npx: true });
	});

	it('does nothing when already current', async () => {
		const ran = [];
		const r = await update({ current: '0.6.2', fetchImpl: registry('0.6.2'), runImpl: async (...a) => ran.push(a) });
		expect(r).toEqual({ updated: false, line: 'qc 0.6.2 is the latest.' });
		expect(ran).toEqual([]);
	});

	it('installs the newer version, or only reports it with --check', async () => {
		const ran = [];
		const runImpl = async (...a) => ran.push(a);
		const checked = await update({ current: '0.6.2', check: true, binPath: '/x/lib/node_modules/q/bin/qc.js', fetchImpl: registry('0.6.3'), runImpl });
		expect(checked.updated).toBe(false);
		expect(checked.line).toContain('npm install -g @profullstack/qryptchat@latest');
		expect(ran).toEqual([]);
		const done = await update({ current: '0.6.2', binPath: '/x/lib/node_modules/q/bin/qc.js', fetchImpl: registry('0.6.3'), runImpl });
		expect(done).toEqual({ updated: true, line: 'qc 0.6.2 -> 0.6.3.' });
		expect(ran).toEqual([['npm', ['install', '-g', '@profullstack/qryptchat@latest']]]);
	});

	it('points npx users at @latest instead of installing', async () => {
		const r = await update({ current: '0.6.1', binPath: '/h/.npm/_npx/1/node_modules/q/bin/qc.js', fetchImpl: registry('0.6.3'), runImpl: async () => {} });
		expect(r.line).toBe('qc 0.6.3 is out (you have 0.6.1). Run: npx @profullstack/qryptchat@latest');
	});
});
