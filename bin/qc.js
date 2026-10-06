#!/usr/bin/env node
// qc: qrypt.chat in the terminal. `qc` opens the chat client; `qc --help` lists the rest.
import { readFileSync } from 'node:fs';
import { errorLine, main } from '../src/cli/commands.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

// main resolves when the command is done (the TUI quit, stdin closed under
// mcp); exit then, or the SSE socket and timers would hold the process open.
main(process.argv.slice(2), { version: pkg.version }).then(
	() => process.exit(0),
	(err) => {
		process.stderr.write(`${errorLine(err)}\n`);
		process.exit(1);
	},
);
