# Quarantined tests

`pnpm test` and CI skip the files listed in [`tests/quarantine.js`](./quarantine.js).

This exists because the suite could not run at all. `vitest.config.js` failed to
load (`@vitejs/plugin-react@6` peers vite ^8, vitest 4 ships vite 7), and CI only
ever ran CodeQL, Semgrep, npm-audit and gitleaks — never vitest — so nothing
noticed. With the config fixed, 139 test files sorted into:

| | files |
|---|---|
| passing, run by CI | **80** (469 tests, ~33s) |
| quarantined | **59** |

Quarantining rather than deleting keeps CI meaningful — a permanently red build
gets ignored, and these files still document behaviour worth porting.

## Why the 59 fail

| cause | files | what it takes to fix |
|---|---|---|
| failing assertions | 19 | Real work: the test and the code genuinely disagree. Each needs reading — some assert behaviour that has since changed, some may be real bugs. |
| dead imports | 13 | Orphaned by the SvelteKit → Next.js migration; still import `+server.js` endpoints and `$lib/*` aliases that no longer exist. Repoint at `src/app/api/**/route.js`, or delete if the endpoint is gone. |
| needs Supabase | 12 | Reach a live database. Either give CI a throwaway project and secrets, or mock the client. |
| other | 9 | Assorted — worth a look individually. |
| missing globals | 5 | e.g. `sinon` used without being imported. Usually a one-line fix. |
| parse error | 1 | `tests/api/auth/send-sms.test.js`: top-level `await` in a non-async function. |

`tests/pwa-session-integration.test.js` is the one that *hangs* rather than
fails — it never exits, so it is quarantined too. Worth fixing early, since a
hang is what makes a suite unrunnable rather than merely red.

## Working the backlog

```sh
pnpm test:quarantined          # run only the quarantined files (expect failures)
pnpm test:quarantined tests/foo.test.js   # just one
```

When a file passes, delete its line from `tests/quarantine.js` and it rejoins
the default suite. The goal is for that array to end up empty.

Do not add to this list to make a build go green. A newly-failing test means the
change under review broke something.

## Already fixed

Recovered while triaging, so they now run in CI:

- **24 files** imported `describe`/`it` from `mocha` while the repo runs vitest,
  which yields `undefined` and dies with `Cannot read properties of undefined`.
  Removed the import (vitest sets `globals: true`) and renamed mocha's
  `before`/`after` to `beforeAll`/`afterAll`.
- **jsdom has no IndexedDB**, but the app stores private keys there, so any test
  touching key storage died on `ReferenceError: indexedDB is not defined`.
  `tests/setup.js` now imports `fake-indexeddb/auto`.

Net effect: 72 → 80 passing files.
