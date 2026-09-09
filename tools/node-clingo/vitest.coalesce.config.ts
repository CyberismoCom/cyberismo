import { defineConfig } from 'vitest/config';

// Coalescing (ClingoContext::pump() in src/binding.cc) only kicks in once a solve({
// snapshot: true }) call misses the cache while every worker slot is already busy, so
// test/coalesce.test.ts and test/models.test.ts both pin NODE_CLINGO_MAX_CONCURRENT=1 to
// make that deterministic instead of racing real hardware concurrency -- models.test.ts
// needs it for the same reason: exercising the models-multiplexed solve (buildModels() /
// ClingoSolver::solveModels()) means forcing several solve({ snapshot: true }) calls to
// queue up and be dispatched together.
//
// That value is read once into a process-wide static (see helpers.h's env_int and
// ClingoContext::maxConcurrent() in binding.cc), so it cannot share a process with the
// rest of the suite -- vitest.config.ts excludes these files, and package.json's `test`
// script runs this config as its own separate `vitest run` invocation (a separate OS
// process) instead of relying on per-file worker isolation.
export default defineConfig({
  test: {
    include: ['test/coalesce.test.ts', 'test/models.test.ts'],
    globals: true,
    environment: 'node',
    env: {
      NODE_CLINGO_MAX_CONCURRENT: '1',
    },
  },
});
