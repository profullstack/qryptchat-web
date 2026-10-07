/**
 * New-message alerts drawn by the terminal itself: a desktop notification
 * escape plus a bell. The terminal raises them on the machine you are sitting
 * at, so they work over SSH, where notify-send would pop up on the server.
 *
 * Kitty speaks OSC 99; iTerm2, WezTerm, Ghostty, foot and Windows Terminal
 * speak OSC 9. Inside tmux the escape is wrapped for passthrough
 * (set -g allow-passthrough on) and the bare bell still marks the window.
 *
 * Only the chat and sender are shown, never the message: a notification
 * centre is outside the end-to-end encryption.
 *
 * QC_NOTIFY=0 turns alerts off, QC_NOTIFY=bell rings without a notification.
 */

const ESC = '\x1b';
const BEL = '\x07';
const ST = `${ESC}\\`;

/** Strip control characters so a name cannot end the escape early. */
const clean = (s) => String(s ?? '').replace(/[\x00-\x1f\x7f;]/g, ' ').trim();

/** The bytes for one alert in this environment ('' when alerts are off). */
export function notifySequence(title, body, env = process.env) {
	const mode = String(env.QC_NOTIFY ?? '1').toLowerCase();
	if (['0', 'off', 'false', 'no'].includes(mode)) return '';
	if (mode === 'bell') return BEL;
	const t = clean(title);
	const b = clean(body);
	const kitty = env.KITTY_WINDOW_ID || env.TERM === 'xterm-kitty';
	let osc = kitty
		? `${ESC}]99;i=qc:d=0:o=unfocused;${t}${ST}${ESC}]99;i=qc:d=1:p=body;${b}${ST}`
		: `${ESC}]9;${t}: ${b}${BEL}`;
	if (env.TMUX) osc = `${ESC}Ptmux;${osc.replaceAll(ESC, ESC + ESC)}${ST}`;
	return osc + BEL;
}

/** Write an alert to the first of stdout/stderr that is a terminal. */
export function notify(title, body, { env = process.env, streams = [process.stdout, process.stderr] } = {}) {
	const seq = notifySequence(title, body, env);
	const tty = streams.find((s) => s?.isTTY);
	if (seq && tty) tty.write(seq);
	return Boolean(seq && tty);
}
