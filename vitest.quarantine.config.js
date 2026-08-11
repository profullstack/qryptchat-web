/**
 * Runs ONLY the quarantined test files, so the backlog can be chipped away at
 * without un-quarantining anything first: `pnpm test:quarantined`.
 *
 * Expect failures here — that is the point. When a file starts passing, delete
 * its entry from tests/quarantine.js and it rejoins the default suite.
 */
import { defineConfig, configDefaults } from 'vitest/config';
import base from './vitest.config.js';
import { quarantined } from './tests/quarantine.js';

export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: quarantined,
    exclude: configDefaults.exclude,
  },
});
