/**
 * `qc voice`: the PairUX CLI, under qc.
 *
 *   qc voice                 a fresh end-to-end encrypted room link (made here, no account)
 *   qc voice --send <chat>   ...and post it into a chat
 *   qc voice <anything>      runs `pairux <anything>`: login, logout, whoami, join, say, ...
 *
 * The link is made locally (src/lib/chat/voice.js), so the default works without
 * PairUX installed; every other subcommand is the installed `pairux` launcher.
 */
import { spawn } from 'node:child_process';
import { newVoiceRoomLink, PAIRUX_URL } from '../lib/chat/voice.js';

export const PAIRUX_INSTALL = 'curl -fsSL https://installer.pairux.com/install.sh | bash';

export const VOICE_HELP = `qc voice: end-to-end encrypted voice rooms on PairUX (an alias for the pairux CLI)

Usage:
  qc voice [--send <chat>] [--json]   print a link to a fresh anonymous room; --send posts it to a chat.
                                      Made on this machine: the key is in the #fragment, so PairUX
                                      never sees it, and nobody needs an account to join.
  qc voice login|logout|whoami        sign the pairux CLI in or out
  qc voice join <CODE> | say | who | listen | status | leave | help
                                      any other subcommand runs \`pairux <subcommand>\`

The pairux CLI comes with the PairUX app: ${PAIRUX_INSTALL}
PAIRUX_API_URL changes the server (default ${PAIRUX_URL}).`;

/** What `qc voice <argv>` should do: make a link, show help, or hand off to pairux. */
export function parseVoiceArgs(argv) {
	const [first] = argv;
	if (first === 'help' || first === '--help' || first === '-h') return { action: 'help' };
	if (first === undefined || first.startsWith('--') || first === 'link' || first === 'room' || first === 'new') {
		const rest = first && !first.startsWith('--') ? argv.slice(1) : argv;
		const flags = { json: false, send: null };
		for (let i = 0; i < rest.length; i++) {
			if (rest[i] === '--json') flags.json = true;
			else if (rest[i] === '--send' && rest[i + 1]) flags.send = rest[++i];
			else if (rest[i].startsWith('--send=')) flags.send = rest[i].slice(7);
			else throw new Error(`Unknown option "${rest[i]}" for qc voice.\n\n${VOICE_HELP}`);
		}
		return { action: 'link', ...flags };
	}
	return { action: 'pairux', args: argv };
}

/** A room link, from PAIRUX_API_URL when set (the same variable the pairux CLI reads). */
export const voiceLink = (env = process.env) => newVoiceRoomLink(env.PAIRUX_API_URL || PAIRUX_URL);

/** Run `pairux <args>` attached to this terminal; resolves with its exit code. */
export function runPairux(args, { spawnImpl = spawn, env = process.env } = {}) {
	return new Promise((resolve, reject) => {
		const child = spawnImpl(env.PAIRUX_BIN || 'pairux', args, { stdio: 'inherit', env });
		child.on('error', (err) => {
			reject(err.code === 'ENOENT' ? new Error(`The pairux CLI is not installed. Install PairUX: ${PAIRUX_INSTALL}`) : err);
		});
		child.on('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)));
	});
}
