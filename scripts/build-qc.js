#!/usr/bin/env bun
/**
 * Build the publishable qc package: `bun scripts/build-qc.js`.
 *
 * Bundles src/cli (and the web app's own crypto it imports) into
 * packages/qryptchat/dist, leaving the runtime dependencies external so npm
 * installs them. The TUI and MCP server stay separate chunks, loaded only by
 * the commands that need them.
 */
import { readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dir, '..');
const out = join(root, 'packages', 'qryptchat', 'dist');
const pkg = JSON.parse(readFileSync(join(root, 'packages', 'qryptchat', 'package.json'), 'utf8'));

rmSync(out, { recursive: true, force: true });
const result = await Bun.build({
	entrypoints: [join(root, 'src/cli/commands.js'), join(root, 'src/cli/tui.js'), join(root, 'src/cli/mcp.js')],
	outdir: out,
	target: 'node',
	format: 'esm',
	splitting: true,
	external: Object.keys(pkg.dependencies),
	naming: { entry: '[name].js', chunk: 'chunk-[hash].js' },
});
if (!result.success) {
	for (const log of result.logs) console.error(log);
	process.exit(1);
}
console.log(result.outputs.map((o) => `${o.path.replace(`${root}/`, '')} ${(o.size / 1024).toFixed(0)} KB`).join('\n'));
