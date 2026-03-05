---
name: fix-e2e
description: Fix failing Cypress e2e tests. Use when e2e tests are failing and need to be fixed.
disable-model-invocation: true
---

# Fix failing e2e tests

Follow these steps to diagnose and fix failing Cypress e2e tests.

## 1. Check diffs

Run `git diff` to understand what has changed and what might be causing failures.

## 2. Build first

Run `pnpm build` from the repo root before running tests. The backend serves the built frontend, so a fresh build is required.

## 3. Run e2e tests

```bash
pnpm --filter app e2e:headless
```

This runs Cypress in headless mode. The test setup script (`pnpm --filter app setup-e2e`) creates a test project and runs automatically as part of `e2e:headless`.

## 4. Fix and iterate

Read the Cypress error output carefully, fix the issue in the source code, rebuild with `pnpm build` if changes are NOT ONLY in tests, and re-run `pnpm --filter app e2e:headless`. Repeat until all tests pass.

## Key paths

- E2e tests: `tools/app/cypress/e2e/`
- Cypress config: `tools/app/cypress.config.ts`
