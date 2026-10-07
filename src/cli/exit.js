// process.exit() does not wait for stdout. Into a pipe (qc read --json | jq, a
// script's subprocess) the write is asynchronous, so anything past the 64 KB
// pipe buffer was dropped and the reader got truncated JSON. Exit once both
// streams have finished; the timer only guards a reader that never reads.
// end(), not write('', cb): under Bun an empty write calls back before the
// earlier data has drained.
export function exitWhenFlushed(code, { timeoutMs = 30_000 } = {}) {
	setTimeout(() => process.exit(code), timeoutMs);
	process.stdout.end(() => process.stderr.end(() => process.exit(code)));
}
