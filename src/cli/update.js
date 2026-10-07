/**
 * `qc update`: compare this qc with the npm registry and reinstall it with the
 * package manager that put it there (judged from where the qc binary lives).
 */
import { spawn } from 'node:child_process';
import { realpathSync } from 'node:fs';

export const PACKAGE = '@profullstack/qryptchat';

/** -1, 0 or 1, comparing x.y.z versions (a pre-release sorts before its release). */
export function compareVersions(a, b) {
	const parse = (v) => {
		const [core, pre = ''] = String(v).replace(/^v/, '').split('-');
		return { nums: core.split('.').map((n) => Number.parseInt(n, 10) || 0), pre };
	};
	const x = parse(a);
	const y = parse(b);
	for (let i = 0; i < 3; i++) {
		const d = (x.nums[i] ?? 0) - (y.nums[i] ?? 0);
		if (d) return Math.sign(d);
	}
	if (x.pre === y.pre) return 0;
	if (!x.pre) return 1;
	if (!y.pre) return -1;
	return x.pre < y.pre ? -1 : 1;
}

/**
 * The install command for where qc lives, or { npx: true } when it runs from
 * the npx cache (`npx @profullstack/qryptchat@latest` already fetches the newest).
 */
export function installCommand(binPath = '') {
	const p = binPath.replaceAll('\\', '/');
	const spec = `${PACKAGE}@latest`;
	if (p.includes('/_npx/')) return { npx: true };
	if (p.includes('/.bun/')) return { cmd: 'bun', args: ['add', '-g', spec] };
	if (p.includes('/pnpm/')) return { cmd: 'pnpm', args: ['add', '-g', spec] };
	return { cmd: 'npm', args: ['install', '-g', spec] };
}

export async function latestVersion(fetchImpl = fetch) {
	const res = await fetchImpl(`https://registry.npmjs.org/${PACKAGE}/latest`, { headers: { accept: 'application/json' } });
	if (!res.ok) throw new Error(`Could not reach the npm registry (HTTP ${res.status}).`);
	const { version } = await res.json();
	if (!version) throw new Error('The npm registry did not say which version is latest.');
	return version;
}

function run(cmd, args) {
	return new Promise((resolve, reject) => {
		const child = spawn(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
		child.on('error', (err) => reject(new Error(`Could not run ${cmd}: ${err.message}`)));
		child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} exited with ${code}.`))));
	});
}

/** Returns a line for the user; installs unless `check` is set. */
export async function update({ current, check = false, binPath = process.argv[1], fetchImpl = fetch, runImpl = run }) {
	const latest = await latestVersion(fetchImpl);
	if (compareVersions(latest, current) <= 0) return { updated: false, line: `qc ${current} is the latest.` };
	let real = binPath || '';
	try {
		real = realpathSync(real);
	} catch {}
	const how = installCommand(real);
	if (how.npx) return { updated: false, line: `qc ${latest} is out (you have ${current}). Run: npx ${PACKAGE}@latest` };
	const command = `${how.cmd} ${how.args.join(' ')}`;
	if (check) return { updated: false, line: `qc ${latest} is out (you have ${current}). Update with: qc update  (runs ${command})` };
	await runImpl(how.cmd, how.args);
	return { updated: true, line: `qc ${current} -> ${latest}.` };
}
