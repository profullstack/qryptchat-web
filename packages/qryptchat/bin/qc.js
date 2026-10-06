#!/usr/bin/env node
// qc: qrypt.chat in the terminal. `qc` opens the chat client; `qc --help` lists the rest.
import { readFileSync } from 'node:fs';
import { main } from '../dist/commands.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

main(process.argv.slice(2), { version: pkg.version }).then(
	() => process.exit(0),
	(err) => {
		process.stderr.write(`qc: ${err?.message ?? err}\n`);
		process.exit(1);
	},
);
