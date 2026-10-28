import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

// vitest runs from the repo root; import.meta.url is http:// under jsdom.
const exitJs = pathToFileURL(resolve('src/cli/exit.js')).href;
const SIZE = 1024 * 1024;

// Run a child that writes SIZE bytes to a piped stdout, then exits the given way.
// `node` is Bun under `bun --bun vitest`, so this covers both runtimes between
// a local `node` run and CI.
function run(exit) {
	const script = `import { exitWhenFlushed } from ${JSON.stringify(exitJs)};
process.stdout.write('x'.repeat(${SIZE}));
${exit}`;
	const r = spawnSync('node', ['--input-type=module', '-e', script], { maxBuffer: SIZE * 2 });
	return r;
}

describe('exitWhenFlushed', () => {
	it('delivers all of a large piped stdout before exiting', () => {
		const r = run('exitWhenFlushed(0);');
		expect(r.status).toBe(0);
		expect(r.stdout.length).toBe(SIZE);
	});

	it('keeps the exit code', () => {
		expect(run('exitWhenFlushed(3);').status).toBe(3);
	});

	// Why exitWhenFlushed exists: a bare process.exit usually truncates at the
	// pipe buffer. "Usually" is the problem: whether the reader drains in time
	// is up to the runner, and CI flushed the whole 1 MiB twice on 2026-10-28,
	// so asserting the truncation made the suite flaky. The test above pins the
	// behaviour that matters.
	it.skip('is needed: a bare process.exit truncates at the pipe buffer', () => {
		expect(run('process.exit(0);').stdout.length).toBeLessThan(SIZE);
	});
});
