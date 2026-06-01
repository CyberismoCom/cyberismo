# Cypress → Playwright Migration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Cypress with Playwright for `tools/app` end-to-end tests, restoring spec-level filesystem isolation via a backend reset endpoint, enabling cross-spec parallelism via workers, and enabling cross-browser coverage on the Ubuntu CI pipeline.

**Architecture:** The backend gains a single test-mode-only endpoint (`POST /api/test/reset`) that wipes the project directory, restores it from a golden snapshot, disposes the old `CommandManager`(s), and re-initializes the `ProjectRegistry` in-place. Playwright runs N parallel workers, each owning its own backend process on its own port + its own project directory copied from the golden snapshot. Each spec file calls `resetProject()` once in `test.beforeAll`, preserving today's spec-level isolation contract while removing the slow per-spec backend boot/teardown cycle.

**Tech Stack:** Playwright (latest), Hono, Vitest (backend unit tests), pnpm workspaces, Node 22, GitHub Actions.

**Branch:** `e2e/playwright-migration` (worktree at `../cyberismo-playwright`, branched from `origin/main`).

---

## Scope summary

- Backend gets a small test-only API surface (`POST /api/test/reset`) + a `ProjectRegistry.replace()` helper.
- `tools/app` gets a `playwright.config.ts`, an `e2e/` directory with global setup + worker fixtures + four spec files.
- All four existing Cypress specs are ported (faithfully where possible; `macros.cy.ts` requires rewriting CodeMirror typing into Playwright `keyboard` calls).
- The `cypress/` directory, `cypress.config.ts`, and `cypress` devDependency are removed.
- `setup-e2e.js` is extended to produce a `cyberismo-bat.golden` snapshot alongside `cyberismo-bat`.
- Three CI workflows are updated: Ubuntu runs cross-browser (chromium + firefox + webkit), Windows runs chromium-only, macOS runs chromium-only.

## File map

**Create:**
- `tools/app/playwright.config.ts` — Playwright config, parameterized browsers via env var.
- `tools/app/e2e/global-setup.ts` — Runs `setup-e2e.js` once, then snapshots `cyberismo-bat` → `cyberismo-bat.golden`.
- `tools/app/e2e/fixtures.ts` — Worker-scoped `backend` fixture (spawns a per-worker backend), worker-scoped `resetProject` fixture.
- `tools/app/e2e/helpers.ts` — Page-driven helpers (`editPage`, `createPage`, `dismissToast`, `typeIntoCodeMirror`).
- `tools/app/e2e/app.spec.ts` — Ported from `cypress/e2e/app.cy.ts`.
- `tools/app/e2e/macros.spec.ts` — Ported from `cypress/e2e/macros.cy.ts`.
- `tools/app/e2e/xref.spec.ts` — Ported from `cypress/e2e/xref.cy.ts`.
- `tools/app/e2e/xss.spec.ts` — Ported from `cypress/e2e/xss.cy.ts`.
- `tools/app/e2e/tsconfig.json` — Subproject tsconfig so editor + Playwright agree on types.
- `tools/backend/test/test-reset.test.ts` — Vitest integration test for the reset endpoint.

**Modify:**
- `tools/backend/src/project-registry.ts` — Add `async replace(entries)`.
- `tools/backend/src/app.ts` — Mount `POST /api/test/reset` when `NODE_ENV === 'test'`.
- `tools/app/package.json` — Add Playwright deps, replace e2e scripts, drop Cypress dep.
- `tools/app/scripts/setup-e2e.js` — After building the project, snapshot to `cyberismo-bat.golden`.
- `tools/app/eslint.config.mjs` — Allow `tests/**` Playwright globals (`test`, `expect`) via node globals.
- `tools/app/.gitignore` — Add `test-results/`, `playwright-report/`, `playwright/.cache/`.
- `.github/workflows/build-and-test.yml` — Install all browsers, run cross-browser e2e.
- `.github/workflows/build-and-test-windows.yml` — Install chromium only, run chromium-only e2e.
- `.github/workflows/build-and-test-macos.yml` — Install chromium only, run chromium-only e2e.

**Delete:**
- `tools/app/cypress.config.ts`
- `tools/app/cypress/` (entire directory)

---

## Task 0: Worktree (already done)

The worktree was created during plan authoring with:
```bash
git fetch origin
git worktree add -b e2e/playwright-migration ../cyberismo-playwright origin/main
```

All subsequent tasks run from `/var/home/samu/cyberismo-playwright`. Do not perform any work in `/var/home/samu/cyberismo` (which is on `pr1-foundation-linktype`).

- [ ] **Step 1: Verify worktree is correct**

```bash
cd /var/home/samu/cyberismo-playwright
git status
git log -1 --oneline
```
Expected: clean tree, HEAD is the same commit as `origin/main` (currently `c1edca14`).

- [ ] **Step 2: Install deps**

```bash
pnpm install
```
Expected: succeeds without errors.

---

## Task 1: Add `ProjectRegistry.replace()`

Adds an in-place replacement method so the reset endpoint can swap out the project state without restarting the Hono app.

**Files:**
- Modify: `tools/backend/src/project-registry.ts`

- [ ] **Step 1: Write the failing test**

Create `tools/backend/test/project-registry-replace.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { ProjectRegistry, type ProjectRegistryEntry } from '../src/project-registry.js';
import type { CommandManager } from '@cyberismo/data-handler';

function fakeCommands(prefix: string): CommandManager {
  const dispose = vi.fn();
  return {
    project: {
      basePath: `/tmp/${prefix}`,
      configuration: { cardKeyPrefix: prefix, name: prefix },
      dispose,
    },
  } as unknown as CommandManager;
}

describe('ProjectRegistry.replace', () => {
  it('disposes old entries and installs the new ones', async () => {
    const oldCmd = fakeCommands('old');
    const registry = new ProjectRegistry([{ prefix: 'old', commands: oldCmd }]);

    const newCmd = fakeCommands('new');
    await registry.replace([{ prefix: 'new', commands: newCmd }]);

    expect(oldCmd.project.dispose).toHaveBeenCalledOnce();
    expect(registry.get('old')).toBeUndefined();
    expect(registry.get('new')).toBe(newCmd);
  });

  it('handles replace with empty array', async () => {
    const oldCmd = fakeCommands('old');
    const registry = new ProjectRegistry([{ prefix: 'old', commands: oldCmd }]);
    await registry.replace([]);
    expect(oldCmd.project.dispose).toHaveBeenCalledOnce();
    expect(registry.list()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter backend exec vitest run test/project-registry-replace.test.ts
```
Expected: FAIL — `registry.replace is not a function`.

- [ ] **Step 3: Implement `replace`**

Edit `tools/backend/src/project-registry.ts`. After `dispose()` (around line 78), add:

```ts
  /**
   * Replace all registered projects atomically. Disposes existing
   * CommandManagers, then installs the new entries. Used by the test-mode
   * reset endpoint to swap project state without restarting the Hono app.
   */
  async replace(entries: ProjectRegistryEntry[]): Promise<void> {
    for (const commands of this.projects.values()) {
      commands.project.dispose();
    }
    this.projects.clear();
    for (const entry of entries) {
      this.projects.set(entry.prefix, entry.commands);
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter backend exec vitest run test/project-registry-replace.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/backend/src/project-registry.ts tools/backend/test/project-registry-replace.test.ts
git commit -m "feat(backend): ProjectRegistry.replace() for in-place project swap"
```

---

## Task 2: Add `POST /api/test/reset` endpoint (NODE_ENV=test only)

The Playwright fixture POSTs here at the start of each spec file. The handler:
1. Removes the live project directory.
2. Copies from the golden snapshot.
3. Builds a fresh `ProjectRegistry` from the restored files.
4. Calls `registry.replace(newEntries)`.

The route is registered only when `NODE_ENV === 'test'` to keep test surface out of production.

**Files:**
- Modify: `tools/backend/src/app.ts`
- Create: `tools/backend/test/test-reset.test.ts`

- [ ] **Step 1: Write the failing integration test**

Create `tools/backend/test/test-reset.test.ts`:

```ts
import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir, cp, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';

// Build a minimal-but-real project on disk by shelling to the CLI, then
// drive the reset endpoint and observe that mutations made through the
// live filesystem are rolled back.

describe('POST /api/test/reset', () => {
  let workDir: string;
  let projectPath: string;
  let goldenPath: string;
  let app: import('hono').Hono;
  let registry: import('../src/project-registry.js').ProjectRegistry;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.AUTH_MODE = 'mock';
    workDir = await mkdtemp(join(tmpdir(), 'cyberismo-reset-'));
    projectPath = join(workDir, 'proj');
    goldenPath = join(workDir, 'proj.golden');
    process.env.npm_config_project_path = projectPath;
    process.env.CYBERISMO_GOLDEN_PATH = goldenPath;

    // Create a minimal project via CLI
    const cli = `node ${join(import.meta.dirname, '..', '..', 'cli', 'bin', 'run')}`;
    execSync(`${cli} create project "Reset Test" rst ${projectPath} --skipModuleImport`, { stdio: 'inherit' });
    await cp(projectPath, goldenPath, { recursive: true });

    const { scanForProjects } = await import('@cyberismo/data-handler');
    const { ProjectRegistry } = await import('../src/project-registry.js');
    const { createApp } = await import('../src/app.js');
    const { MockAuthProvider } = await import('../src/auth/mock.js');
    const projects = await scanForProjects(projectPath);
    registry = await ProjectRegistry.fromScannedProjects(projects);
    app = createApp(new MockAuthProvider(), registry);
  });

  afterAll(async () => {
    registry.dispose();
    await rm(workDir, { recursive: true, force: true });
  });

  it('restores the project from the golden snapshot', async () => {
    // Mutate the live project directly
    const marker = join(projectPath, 'cardRoot', 'MUTATION_MARKER.txt');
    await writeFile(marker, 'mutated');

    const res = await app.request('/api/test/reset', { method: 'POST' });
    expect(res.status).toBe(204);

    // Marker file should be gone after restore
    await expect(readFile(marker, 'utf8')).rejects.toThrow();
  });

  it('refreshes the registry so new requests see the restored project', async () => {
    // The prefix from "rst" should still resolve after reset
    const cmd = registry.get('rst');
    expect(cmd).toBeDefined();
    expect(cmd?.project.basePath).toBe(projectPath);
  });

  it('returns 404 when NODE_ENV is not test', async () => {
    // Build a non-test app and verify route isn't mounted.
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const { createApp } = await import('../src/app.js');
    const { MockAuthProvider } = await import('../src/auth/mock.js');
    const prodApp = createApp(new MockAuthProvider(), registry);
    const res = await prodApp.request('/api/test/reset', { method: 'POST' });
    expect(res.status).toBe(404);
    process.env.NODE_ENV = prev;
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter backend build  # builds CLI dependency indirectly via workspace
pnpm --filter backend exec vitest run test/test-reset.test.ts
```
Expected: FAIL — either 404 on `/api/test/reset` or the marker file persists.

- [ ] **Step 3: Implement the route**

Edit `tools/backend/src/app.ts`. After the `app.route('/api/projects', createProjectsRouter(registry));` line (around line 108), add:

```ts
  // Test-mode reset endpoint: wipes the project, restores from the golden
  // snapshot, and rebuilds the registry. Gated by NODE_ENV so it never
  // ships in production. The Playwright e2e harness calls this at the
  // start of each spec file.
  if (process.env.NODE_ENV === 'test') {
    app.post('/api/test/reset', async (c) => {
      const projectPath = process.env.npm_config_project_path;
      const goldenPath = process.env.CYBERISMO_GOLDEN_PATH;
      if (!projectPath || !goldenPath) {
        return c.json(
          { error: 'npm_config_project_path and CYBERISMO_GOLDEN_PATH are required for /api/test/reset' },
          500,
        );
      }
      const fs = await import('node:fs/promises');
      await fs.rm(projectPath, { recursive: true, force: true });
      await fs.cp(goldenPath, projectPath, { recursive: true });
      const { scanForProjects } = await import('@cyberismo/data-handler');
      const { CommandManager } = await import('@cyberismo/data-handler');
      const projects = await scanForProjects(projectPath);
      const entries = [];
      for (const project of projects) {
        const commands = new CommandManager(project.path);
        await commands.initialize();
        entries.push({ prefix: project.prefix, commands });
      }
      await registry.replace(entries);
      return c.body(null, 204);
    });
  }
```

Note: this route is mounted under `/api/test/reset`. The `MockAuthProvider` used by `start-e2e` lets the request through with no token, and `notFound` handles `/api/*` paths with a clean 404, so the route returns 404 in production mode.

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter backend exec vitest run test/test-reset.test.ts
```
Expected: PASS (all 3 cases).

- [ ] **Step 5: Commit**

```bash
git add tools/backend/src/app.ts tools/backend/test/test-reset.test.ts
git commit -m "feat(backend): test-mode POST /api/test/reset for e2e fixture isolation"
```

---

## Task 3: Extend `setup-e2e.js` to produce a golden snapshot

`globalSetup` will invoke `setup-e2e.js`. After it builds `cyberismo-bat`, we additionally copy the directory to `cyberismo-bat.golden`. This is what `/api/test/reset` restores from.

**Files:**
- Modify: `tools/app/scripts/setup-e2e.js`

- [ ] **Step 1: Edit the script**

At the very end of `tools/app/scripts/setup-e2e.js`, after `console.log('E2e test project created successfully.');`, add:

```js
import { cpSync } from 'node:fs';

const goldenPath = `${batPath}.golden`;
rmSync(goldenPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
cpSync(batPath, goldenPath, { recursive: true });
console.log(`Golden snapshot written to ${goldenPath}.`);
```

The `cpSync` import is added at the top with the other `node:fs` imports — combine it into the existing `import { existsSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';` line.

- [ ] **Step 2: Run the script standalone to verify**

```bash
cd tools/app
node scripts/setup-e2e.js
ls -la ../../.tmp/cyberismo-bat.golden/.cards/local
```
Expected: golden directory exists with the same `.cards/local` structure as `cyberismo-bat`.

- [ ] **Step 3: Commit**

```bash
git add tools/app/scripts/setup-e2e.js
git commit -m "feat(app): setup-e2e.js writes a cyberismo-bat.golden snapshot"
```

---

## Task 4: Add Playwright dependencies and scripts

**Files:**
- Modify: `tools/app/package.json`

- [ ] **Step 1: Add deps**

From the repo root:
```bash
pnpm --filter @cyberismo/app add -D @playwright/test
```

This pins the latest `@playwright/test`. Do NOT also add `playwright` separately — `@playwright/test` re-exports everything tests need.

- [ ] **Step 2: Edit scripts**

In `tools/app/package.json`, replace the `scripts` block's `e2e*` entries with:

```json
    "e2e": "playwright test",
    "e2e:ui": "playwright test --ui",
    "e2e:chromium": "playwright test --project=chromium",
    "test-env-dev": "cross-env NODE_ENV=test npm_config_project_path=../../.tmp/cyberismo-bat pnpm --filter backend start-e2e",
    "test": "pnpm run unit && pnpm e2e"
```

Remove all of: `setup-e2e`, `e2e:app`, `e2e:macros`, `e2e:xss`, `e2e:xref`, `e2e:headless`.

Keep `test-env-dev` — it's reused by manual dev workflows even though Playwright's fixture spawns its own.

Also remove `cypress` from `devDependencies` and `start-server-and-test` if it's listed (it was used by the cypress scripts).

- [ ] **Step 3: Reinstall**

```bash
pnpm install
```
Expected: succeeds; `@playwright/test` is now in `tools/app/node_modules`; `cypress` is no longer in the lockfile.

- [ ] **Step 4: Commit**

```bash
git add tools/app/package.json pnpm-lock.yaml
git commit -m "build(app): swap Cypress for @playwright/test in package.json"
```

---

## Task 5: Add `.gitignore` and eslint allowances

**Files:**
- Modify: `tools/app/.gitignore`
- Modify: `tools/app/eslint.config.mjs`

- [ ] **Step 1: Update `.gitignore`**

Append to `tools/app/.gitignore`:
```
# Playwright artifacts
test-results/
playwright-report/
playwright/.cache/
```

- [ ] **Step 2: Update `eslint.config.mjs`**

Add a second config block at the bottom of `tools/app/eslint.config.mjs` (inside the `tseslint.config(...baseConfig, { ... })` argument list) for Node-context e2e files:

```js
export default tseslint.config(
  ...baseConfig,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
  {
    files: ['e2e/**/*.ts', 'scripts/**/*.js', 'playwright.config.ts'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
);
```

This overrides browser globals with Node globals for the e2e + scripts files. Playwright's `test`/`expect` come from explicit imports, so no separate plugin is needed.

- [ ] **Step 3: Commit**

```bash
git add tools/app/.gitignore tools/app/eslint.config.mjs
git commit -m "chore(app): gitignore Playwright artifacts; eslint Node globals for e2e"
```

---

## Task 6: `playwright.config.ts`

Browser projects are parameterized by an env var so Windows/macOS CI can run chromium-only and Ubuntu can run all three with no config duplication.

**Files:**
- Create: `tools/app/playwright.config.ts`

- [ ] **Step 1: Write the config**

```ts
import { defineConfig, devices } from '@playwright/test';

const all = ['chromium', 'firefox', 'webkit'] as const;
type BrowserName = (typeof all)[number];

const requested = (process.env.PLAYWRIGHT_BROWSERS ?? 'chromium')
  .split(',')
  .map((s) => s.trim())
  .filter((s): s is BrowserName => (all as readonly string[]).includes(s));

const deviceFor: Record<BrowserName, Parameters<typeof devices>[0] | keyof typeof devices> = {
  chromium: 'Desktop Chrome',
  firefox: 'Desktop Firefox',
  webkit: 'Desktop Safari',
};

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: requested.map((name) => ({
    name,
    use: { ...devices[deviceFor[name] as keyof typeof devices] },
  })),
});
```

- [ ] **Step 2: Commit**

```bash
git add tools/app/playwright.config.ts
git commit -m "feat(app): Playwright config with parameterized browser matrix"
```

---

## Task 7: `e2e/global-setup.ts`

Runs once before all workers. Invokes the existing setup script (which now also writes the golden snapshot), so worker fixtures only need to `fs.cp` from the golden.

**Files:**
- Create: `tools/app/e2e/global-setup.ts`

- [ ] **Step 1: Write it**

```ts
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export default async function globalSetup() {
  const scriptDir = import.meta.dirname;
  const setupScript = join(scriptDir, '..', 'scripts', 'setup-e2e.js');
  if (!existsSync(setupScript)) {
    throw new Error(`setup-e2e.js not found at ${setupScript}`);
  }
  execSync(`node ${setupScript}`, { stdio: 'inherit' });
}
```

- [ ] **Step 2: Commit**

```bash
git add tools/app/e2e/global-setup.ts
git commit -m "feat(app): Playwright globalSetup invokes setup-e2e + golden snapshot"
```

---

## Task 8: `e2e/fixtures.ts` — per-worker backend + per-spec reset

**Files:**
- Create: `tools/app/e2e/fixtures.ts`

- [ ] **Step 1: Write the fixtures**

```ts
import { test as base, expect } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { cp, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TMP = join(__dirname, '..', '..', '..', '.tmp');
const GOLDEN = join(TMP, 'cyberismo-bat.golden');

type Backend = { baseURL: string; projectPath: string };
type WorkerFixtures = { backend: Backend; resetProject: () => Promise<void> };

async function waitForServer(baseURL: string, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseURL}/api/projects`, { redirect: 'manual' });
      // Auth may reject with 401, but that proves the server is up.
      if (res.status < 500) return;
    } catch {
      /* connection refused */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Server at ${baseURL} did not become ready within ${timeoutMs}ms`);
}

async function freePort(start: number): Promise<number> {
  for (let p = start; p < start + 100; p++) {
    const ok = await new Promise<boolean>((resolve) => {
      const srv = net.createServer();
      srv.once('error', () => resolve(false));
      srv.once('listening', () => srv.close(() => resolve(true)));
      srv.listen(p, '127.0.0.1');
    });
    if (ok) return p;
  }
  throw new Error(`No free port found near ${start}`);
}

export const test = base.extend<{}, WorkerFixtures>({
  backend: [
    async ({}, use, workerInfo) => {
      const projectPath = join(TMP, `cyberismo-bat-w${workerInfo.workerIndex}`);
      await rm(projectPath, { recursive: true, force: true });
      await cp(GOLDEN, projectPath, { recursive: true });

      const port = await freePort(3100 + workerInfo.workerIndex * 10);
      const baseURL = `http://127.0.0.1:${port}`;

      const proc: ChildProcess = spawn(
        'pnpm',
        ['--filter', 'backend', 'start-e2e'],
        {
          env: {
            ...process.env,
            NODE_ENV: 'test',
            AUTH_MODE: 'mock',
            PORT: String(port),
            npm_config_project_path: projectPath,
            CYBERISMO_GOLDEN_PATH: GOLDEN,
          },
          stdio: ['ignore', 'pipe', 'pipe'],
          detached: false,
        },
      );
      // Pipe child output so failures surface in the worker log.
      proc.stdout?.on('data', (b) => process.stdout.write(`[w${workerInfo.workerIndex}] ${b}`));
      proc.stderr?.on('data', (b) => process.stderr.write(`[w${workerInfo.workerIndex}] ${b}`));

      try {
        await waitForServer(baseURL);
      } catch (err) {
        proc.kill('SIGTERM');
        throw err;
      }

      await use({ baseURL, projectPath });

      proc.kill('SIGTERM');
      await new Promise((r) => setTimeout(r, 200));
      await rm(projectPath, { recursive: true, force: true });
    },
    { scope: 'worker', auto: true },
  ],

  resetProject: [
    async ({ backend }, use) => {
      await use(async () => {
        const res = await fetch(`${backend.baseURL}/api/test/reset`, { method: 'POST' });
        if (!res.ok) throw new Error(`reset failed: ${res.status} ${await res.text()}`);
      });
    },
    { scope: 'worker' },
  ],
});

// Override baseURL test fixture so `page.goto('/')` works.
test.use({ baseURL: ({ backend }, use) => use(backend.baseURL) } as any);

export { expect };
```

Note the last line: Playwright doesn't have a clean way to forward a worker-scoped value into the test-scoped `baseURL` fixture without a small cast. An alternative is to set `use.baseURL` per-test via `test.beforeEach`, but the override-via-fixture approach keeps spec files clean.

If TypeScript complains about the `as any`, swap the bottom block for an explicit override:

```ts
export const test = base.extend<{ baseURLOverride: void }, WorkerFixtures>({
  // ... (same backend + resetProject as above)
  baseURLOverride: [
    async ({ backend }, use, testInfo) => {
      testInfo.project.use.baseURL = backend.baseURL;
      await use();
    },
    { auto: true },
  ],
});
```

Use whichever pattern type-checks against the installed Playwright version. The intent is: every test sees `page` configured with this worker's `baseURL`.

- [ ] **Step 2: Smoke-test the fixture**

Create a temporary smoke spec `tools/app/e2e/_smoke.spec.ts`:

```ts
import { test, expect } from './fixtures';

test('backend boots and serves the SPA', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/projects\//, { timeout: 30_000 });
});

test('reset works', async ({ resetProject }) => {
  await resetProject();
});
```

```bash
cd tools/app
pnpm exec playwright install chromium
pnpm e2e:chromium --grep _smoke
```
Expected: PASS (both tests). If FAIL: backend child output should be in the log — common causes are golden snapshot not present (re-run `node scripts/setup-e2e.js`) or port conflict (raise the base port).

- [ ] **Step 3: Delete the smoke spec and commit fixtures**

```bash
rm tools/app/e2e/_smoke.spec.ts
git add tools/app/e2e/fixtures.ts
git commit -m "feat(app): Playwright worker-scoped backend fixture + resetProject"
```

---

## Task 9: `e2e/helpers.ts` — shared page-driven helpers

Lifts the inline helpers from the Cypress specs into one place, with toast-dismiss and CodeMirror typing centralized.

**Files:**
- Create: `tools/app/e2e/helpers.ts`

- [ ] **Step 1: Write the helpers**

```ts
import { type Page, expect } from '@playwright/test';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const t = require('../src/locales/en/translation.json') as Record<string, any>;

/** Click the "Edit body" button (force-clickable even when .doc has 0 height). */
export async function editPage(page: Page) {
  await page.getByTestId('editBodyButton').click({ force: true });
}

/** Create a card from the "Page" template via the toolbar dialog. */
export async function createPage(page: Page) {
  await page.getByTestId('createNewButton').click();
  await page.locator('.templateCard').getByText('Page', { exact: true }).click();
  await page.getByTestId('confirmCreateButton').click();
  await expect(page.getByRole('presentation').filter({ hasText: t.createCardModal.success })).toBeVisible();
  await page.getByTestId('notificationClose').first().click();
  await expect(page.getByRole('heading', { level: 1, name: /^Untitled page$/ })).toBeVisible();
}

/**
 * Wait for a save toast, dismiss it, and confirm the inline editor unmounted.
 * Mirrors the Cypress `verifyContentSaved` helper.
 */
export async function dismissSaveToast(page: Page) {
  await expect(page.locator('.cm-editor')).toHaveCount(0);
  const toast = page.getByRole('presentation').filter({ hasText: t.saveCard.success });
  await expect(toast).toBeVisible();
  await toast.getByTestId('notificationClose').click();
  await expect(toast).toHaveCount(0);
}

/**
 * Type into CodeMirror. Replaces the Cypress `{rightArrow}` / `{moveToEnd}`
 * DSL with explicit keyboard.press calls.
 *
 * @param page Playwright page
 * @param sequence Array of either strings (typed verbatim) or { press: KeyName }.
 */
export async function typeIntoCodeMirror(
  page: Page,
  sequence: Array<string | { press: string }>,
) {
  await page.locator('.cm-content').click();
  for (const step of sequence) {
    if (typeof step === 'string') {
      await page.keyboard.type(step);
    } else {
      await page.keyboard.press(step.press);
    }
  }
}

/** Click the contextMenu → save the toast → close it pattern. */
export async function clickContextMenuItem(page: Page, testId: string) {
  await page.getByTestId('contextMenuButton').click();
  await page.getByTestId(testId).click();
}
```

- [ ] **Step 2: Commit**

```bash
git add tools/app/e2e/helpers.ts
git commit -m "feat(app): shared Playwright helpers for create/save/CodeMirror"
```

---

## Task 10: Port `xref.cy.ts` → `xref.spec.ts`

Smallest spec, single test, no force-clicks. Best target for the first real port.

**Files:**
- Create: `tools/app/e2e/xref.spec.ts`

- [ ] **Step 1: Write the spec**

```ts
import { test, expect } from './fixtures';
import { editPage, createPage, dismissSaveToast } from './helpers';

test.describe('Native AsciiDoc xref', () => {
  test.beforeAll(async ({ resetProject }) => {
    await resetProject();
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/projects\//);
  });

  test('renders xref:KEY.adoc[label] as a multi-project link and navigates', async ({ page }) => {
    const prefixMatch = page.url().match(/\/projects\/([^/]+)/);
    if (!prefixMatch) throw new Error(`expected /projects/<prefix> in URL: ${page.url()}`);
    const prefix = prefixMatch[1];

    await createPage(page);
    const aKey = page.url().split('/cards/')[1];
    expect(aKey, 'card A key').toMatch(/.+_.+/);

    await page.goto('/');
    await createPage(page);
    const bKey = page.url().split('/cards/')[1];
    expect(bKey, 'card B key').toMatch(/.+_.+/);

    await page.goto(`/projects/${prefix}/cards/${aKey}`);
    await expect(page.getByRole('heading', { level: 1, name: /^Untitled page$/ })).toBeVisible();

    await editPage(page);
    await page.locator('.cm-activeLine').click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('Delete');
    await page.locator('.cm-content').click();
    await page.keyboard.type(`See xref:${bKey}.adoc[Go to B] please.`);
    await page.getByTestId('contentSaveButton').click();
    await dismissSaveToast(page);

    const expectedHref = `/projects/${prefix}/cards/${bKey}`;
    const link = page.locator('[class="doc"] a[href]').first();
    await expect(link).toHaveAttribute('href', expectedHref);
    await expect(link).toHaveText('Go to B');

    await page.locator('[class="doc"]').getByRole('link', { name: 'Go to B' }).click();
    await expect(page).toHaveURL(new RegExp(expectedHref.replace(/[/-]/g, (m) => `\\${m}`)));
    await expect(page.getByRole('heading', { level: 1, name: /^Untitled page$/ })).toBeVisible();
  });
});
```

- [ ] **Step 2: Run it**

```bash
cd tools/app
pnpm e2e:chromium -- xref.spec.ts
```
Expected: PASS in chromium. If the `.cm-activeLine clear` step misbehaves, swap the three lines (`click + Ctrl+A + Delete`) for `await page.locator('.cm-content').press('ControlOrMeta+A'); await page.keyboard.press('Delete');`.

- [ ] **Step 3: Run cross-browser**

```bash
PLAYWRIGHT_BROWSERS=chromium,firefox,webkit pnpm exec playwright install
PLAYWRIGHT_BROWSERS=chromium,firefox,webkit pnpm e2e xref.spec.ts
```
Expected: PASS in all three.

- [ ] **Step 4: Commit**

```bash
git add tools/app/e2e/xref.spec.ts
git commit -m "test(app): port xref.cy.ts to Playwright"
```

---

## Task 11: Port `xss.cy.ts` → `xss.spec.ts`

Already API-driven for setup (good!). Mechanical translation of `cy.request` → `request.fetch` and assertion chains.

**Files:**
- Create: `tools/app/e2e/xss.spec.ts`

- [ ] **Step 1: Write the spec**

```ts
import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import { test as testWithFixtures } from './fixtures';

const createPageCard = async (page: Page) => {
  await page.getByTestId('createNewButton').click();
  await page.locator('.templateCard').getByText('Page', { exact: true }).click();
  await page.getByTestId('confirmCreateButton').click();
  const toast = page.getByRole('presentation').filter({ hasText: 'Card created successfully' });
  await expect(toast).toBeVisible();
  await page.getByTestId('notificationClose').first().click();
  await expect(toast).toHaveCount(0);
};

const patchCardContent = async (page: Page, request: APIRequestContext, content: string) => {
  const url = page.url();
  const cardKey = url.split('/cards/')[1];
  const projectPrefix = url.split('/projects/')[1].split('/')[0];
  const res = await request.patch(`/api/projects/${projectPrefix}/cards/${cardKey}`, { data: { content } });
  if (!res.ok()) throw new Error(`PATCH failed: ${res.status()}`);
  await page.goto(`/projects/${projectPrefix}/cards/${cardKey}`);
};

const scoreCardContent = (overrides: { title?: string; value?: number; unit?: string; legend?: string }) => {
  const { title = 'Safe title', value = 30, unit = '%', legend = 'Safe legend' } = overrides;
  return `{{#scoreCard}}"title": "${title}","value": ${value},"unit": "${unit}","legend": "${legend}"{{/scoreCard}}`;
};

const percentageContent = (overrides: { title?: string; value?: number; legend?: string; colour?: string }) => {
  const { title = 'Safe title', value = 50, legend = 'Safe legend', colour = 'blue' } = overrides;
  return `{{#percentage}}"title": "${title}","value": ${value},"legend": "${legend}","colour": "${colour}"{{/percentage}}`;
};

const passthroughContent = (html: string) => `++++\n${html}\n++++`;

testWithFixtures.describe('XSS Prevention', () => {
  testWithFixtures.beforeAll(async ({ resetProject }) => {
    await resetProject();
  });

  testWithFixtures.beforeEach(async ({ page }) => {
    page.on('dialog', (d) => {
      throw new Error(`XSS: dialog opened (${d.type()}: ${d.message()})`);
    });
    await page.goto('/');
  });

  testWithFixtures.describe('ScoreCard macro', () => {
    testWithFixtures('sanitizes script tag in title', async ({ page, request }) => {
      await createPageCard(page);
      await patchCardContent(page, request, scoreCardContent({ title: '<script>alert(1)</script>' }));
      await expect(page.locator('.doc script')).toHaveCount(0);
      await expect(page.locator('.doc .card')).toHaveCount(1);
    });

    testWithFixtures('sanitizes img onerror in title', async ({ page, request }) => {
      await createPageCard(page);
      await patchCardContent(page, request, scoreCardContent({ title: '<img src=x onerror=alert(1)>' }));
      await expect(page.locator('.doc [onerror]')).toHaveCount(0);
      await expect(page.locator('.doc .card')).toHaveCount(1);
    });

    testWithFixtures('sanitizes script tag in unit', async ({ page, request }) => {
      await createPageCard(page);
      await patchCardContent(page, request, scoreCardContent({ unit: '<script>alert(1)</script>' }));
      await expect(page.locator('.doc script')).toHaveCount(0);
      await expect(page.locator('.doc')).toContainText('Safe title');
      await expect(page.locator('.doc')).toContainText('Safe legend');
    });

    testWithFixtures('sanitizes script tag in legend', async ({ page, request }) => {
      await createPageCard(page);
      await patchCardContent(page, request, scoreCardContent({ legend: '<script>alert(1)</script>' }));
      await expect(page.locator('.doc script')).toHaveCount(0);
      await expect(page.locator('.doc')).toContainText('Safe title');
    });
  });

  testWithFixtures.describe('Percentage macro', () => {
    testWithFixtures('sanitizes script tag in title', async ({ page, request }) => {
      await createPageCard(page);
      await patchCardContent(page, request, percentageContent({ title: '<script>alert(1)</script>' }));
      await expect(page.locator('.doc script')).toHaveCount(0);
      await expect(page.locator('.doc svg')).toHaveCount(1);
      await expect(page.locator('.doc')).toContainText('Safe legend');
    });

    testWithFixtures('sanitizes script tag in legend', async ({ page, request }) => {
      await createPageCard(page);
      await patchCardContent(page, request, percentageContent({ legend: '<script>alert(1)</script>' }));
      await expect(page.locator('.doc script')).toHaveCount(0);
      await expect(page.locator('.doc svg')).toHaveCount(1);
      await expect(page.locator('.doc')).toContainText('Safe title');
    });
  });

  testWithFixtures.describe('Content-level XSS via AsciiDoc passthrough', () => {
    testWithFixtures('sanitizes script tag in passthrough block', async ({ page, request }) => {
      await createPageCard(page);
      await patchCardContent(page, request, passthroughContent('<script>alert("xss")</script><p>Safe</p>'));
      await expect(page.locator('.doc script')).toHaveCount(0);
      await expect(page.locator('.doc')).toContainText('Safe');
    });

    testWithFixtures('sanitizes event handler in passthrough block', async ({ page, request }) => {
      await createPageCard(page);
      await patchCardContent(page, request, passthroughContent('<div onmouseover="alert(1)">Hover</div>'));
      await expect(page.locator('.doc [onmouseover]')).toHaveCount(0);
      await expect(page.locator('.doc')).toContainText('Hover');
    });

    testWithFixtures('sanitizes SVG onload in passthrough block', async ({ page, request }) => {
      await createPageCard(page);
      await patchCardContent(page, request, passthroughContent('<svg onload="alert(1)"><circle r="40"/></svg>'));
      await expect(page.locator('.doc [onload]')).toHaveCount(0);
    });

    testWithFixtures('sandboxes iframe in passthrough block', async ({ page, request }) => {
      await createPageCard(page);
      await patchCardContent(page, request, passthroughContent('<iframe src="https://evil.example.com"></iframe><p>Safe</p>'));
      const iframe = page.locator('.doc iframe');
      await expect(iframe).toHaveCount(1);
      await expect(iframe).toHaveAttribute('sandbox', 'allow-scripts allow-same-origin');
      await expect(page.locator('.doc')).toContainText('Safe');
    });

    testWithFixtures('strips object tag in passthrough block', async ({ page, request }) => {
      await createPageCard(page);
      await patchCardContent(page, request, passthroughContent('<object data="https://evil.example.com/mal.swf"></object><p>Safe</p>'));
      await expect(page.locator('.doc object')).toHaveCount(0);
      await expect(page.locator('.doc')).toContainText('Safe');
    });

    testWithFixtures('strips embed tag in passthrough block', async ({ page, request }) => {
      await createPageCard(page);
      await patchCardContent(page, request, passthroughContent('<embed src="https://evil.example.com/mal.swf"><p>Safe</p>'));
      await expect(page.locator('.doc embed')).toHaveCount(0);
      await expect(page.locator('.doc')).toContainText('Safe');
    });

    testWithFixtures('strips form action in passthrough block', async ({ page, request }) => {
      await createPageCard(page);
      await patchCardContent(page, request, passthroughContent('<form action="https://evil.example.com/steal"><input value="data"></form><p>Safe</p>'));
      await expect(page.locator('.doc form')).toHaveCount(0);
      await expect(page.locator('.doc')).toContainText('Safe');
    });
  });

  testWithFixtures.describe('Allowed HTML elements via passthrough', () => {
    testWithFixtures('renders details/summary elements', async ({ page, request }) => {
      await createPageCard(page);
      await patchCardContent(page, request, passthroughContent('<details><summary>Toggle title</summary><p>Hidden content</p></details>'));
      await expect(page.locator('.doc details')).toHaveCount(1);
      await expect(page.locator('.doc summary')).toContainText('Toggle title');
      await page.locator('.doc details summary').click();
      await expect(page.locator('.doc details')).toContainText('Hidden content');
    });

    testWithFixtures('renders video element', async ({ page, request }) => {
      await createPageCard(page);
      await patchCardContent(page, request, passthroughContent('<video controls><source src="test.mp4" type="video/mp4"></video>'));
      const video = page.locator('.doc video');
      await expect(video).toHaveCount(1);
      await expect(video).toHaveAttribute('controls', '');
      const source = page.locator('.doc video source');
      await expect(source).toHaveAttribute('src', 'test.mp4');
    });

    testWithFixtures('renders iframe with forced sandbox attribute', async ({ page, request }) => {
      await createPageCard(page);
      await patchCardContent(page, request, passthroughContent('<iframe src="https://www.youtube.com/embed/test" allowfullscreen></iframe>'));
      const iframe = page.locator('.doc iframe');
      await expect(iframe).toHaveAttribute('src', 'https://www.youtube.com/embed/test');
      await expect(iframe).toHaveAttribute('sandbox', 'allow-scripts allow-same-origin');
    });
  });
});

// re-export `expect` so importers see the same instance
export { expect };
```

Note: imports use `testWithFixtures` to disambiguate from the base `test` used inside `describe`. If you find that confusing, rename the import to `test` in this file (it's local).

- [ ] **Step 2: Run it**

```bash
pnpm e2e:chromium -- xss.spec.ts
```
Expected: PASS (16 cases).

- [ ] **Step 3: Run cross-browser**

```bash
PLAYWRIGHT_BROWSERS=chromium,firefox,webkit pnpm e2e xss.spec.ts
```
Expected: PASS in all three.

- [ ] **Step 4: Commit**

```bash
git add tools/app/e2e/xss.spec.ts
git commit -m "test(app): port xss.cy.ts to Playwright"
```

---

## Task 12: Port `app.cy.ts` → `app.spec.ts`

Most ordering-coupled spec. Preserve the existing test order — each test depends on the project state left by the previous one. `test.describe.configure({ mode: 'serial' })` enforces this; spec-level reset still runs once.

**Files:**
- Create: `tools/app/e2e/app.spec.ts`

- [ ] **Step 1: Write the spec**

The full port is long; here is the structural template + the first three tests. Translate the remaining `it()` blocks mechanically using the same patterns.

```ts
import { test, expect } from './fixtures';
import { editPage, createPage, dismissSaveToast } from './helpers';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const t = require('../src/locales/en/translation.json') as Record<string, any>;

test.describe.configure({ mode: 'serial' }); // tests run in order; first failure stops the rest

test.describe('Navigation', () => {
  test.beforeAll(async ({ resetProject }) => {
    await resetProject();
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/projects\//);
  });

  test('delete page and verify empty project', async ({ page }) => {
    await expect(page.locator('h4', { hasText: 'Basic Acceptance Test' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Untitled page' })).toBeVisible();

    await page.getByTestId('contextMenuButton').click();
    await page.getByTestId('deleteCardButton').click();
    await page.getByTestId('confirmDeleteButton').click();
    await expect(page.getByRole('presentation').filter({ hasText: t.deleteCardSuccess })).toBeVisible();
    await expect(page.locator('p', { hasText: t.emptyProject })).toBeVisible();
  });

  test('Create a page', async ({ page }) => {
    await page.getByTestId('createNewButton').click();
    await page.locator('.templateCard').getByText('Page', { exact: true }).click();
    await page.getByTestId('confirmCreateButton').click();
    await expect(page.getByRole('presentation').filter({ hasText: t.createCardModal.success })).toBeVisible();
    await expect(page.locator('p', { hasText: 'Untitled page' })).toBeVisible();
    await expect(page.getByTestId('linkIconButton')).toBeDisabled();
  });

  test('Create a page content as a child of the page', async ({ page }) => {
    await page.getByTestId('createNewButton').click();
    await page.locator('.templateCard').getByText('Page content', { exact: true }).click();
    await page.getByRole('dialog').getByText(t.createOnTopLevel).click({ force: true });
    await page.getByTestId('confirmCreateButton').click();
    await expect(page.getByRole('presentation').filter({ hasText: t.createCardModal.success })).toBeVisible();

    await expect(page.locator('p', { hasText: 'Untitled page content' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Untitled page content' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Context' })).toBeVisible();
    await expect(page.locator('p').filter({ hasText: 'Describe background information' })).toBeVisible();
    await expect(page.getByTestId('linkIconButton')).toBeEnabled();

    await expect(page.getByRole('heading', { level: 2, name: 'Decision' })).toBeVisible();
    await expect(page.locator('p').filter({ hasText: 'Describe the change' })).toBeVisible();

    await expect(page.getByRole('heading', { level: 2, name: 'Consequences' })).toBeVisible();
    await expect(page.locator('.toc-menu > p').filter({ hasText: 'Table of contents' })).toBeVisible();
  });

  // ... port remaining tests with the same patterns.
  // See cypress/e2e/app.cy.ts lines 73-541 in the source branch for reference.
});
```

**Translation cheatsheet (refer back from the deleted Cypress file):**

| Cypress | Playwright |
|---|---|
| `cy.visit('/x')` | `await page.goto('/x')` |
| `cy.get('[data-cy="foo"]')` | `page.getByTestId('foo')` |
| `.click()` | `await locator.click()` |
| `.click({ force: true })` | `await locator.click({ force: true })` |
| `.contains(t.x)` | `.filter({ hasText: t.x })` or `getByText(t.x)` |
| `.should('be.visible')` | `await expect(locator).toBeVisible()` |
| `.should('not.exist')` | `await expect(locator).toHaveCount(0)` |
| `.should('be.disabled')` | `await expect(locator).toBeDisabled()` |
| `cy.url().should('include', x)` | `await expect(page).toHaveURL(new RegExp(escape(x)))` |
| `cy.url().then((url) => …)` | `const url = page.url();` |
| `cy.type('foo')` | `await locator.fill('')` then `await page.keyboard.type('foo')` (or `locator.pressSequentially('foo')`) |
| `.clear().type('foo')` | `await locator.fill('foo')` |
| `.type('{esc}')` | `await page.keyboard.press('Escape')` |
| `.type('{enter}')` | `await page.keyboard.press('Enter')` |

- [ ] **Step 2: Run it**

```bash
pnpm e2e:chromium -- app.spec.ts
```
Expected: All ported tests PASS in chromium. Iterate per-test until green.

- [ ] **Step 3: Run cross-browser**

```bash
PLAYWRIGHT_BROWSERS=chromium,firefox,webkit pnpm e2e app.spec.ts
```
Expected: PASS in all three. If Firefox/WebKit fails on a specific test, the test is brittle (likely a `force: true` click hiding a real bug). Diagnose with `pnpm exec playwright show-trace` from the artifacts.

- [ ] **Step 4: Commit**

```bash
git add tools/app/e2e/app.spec.ts
git commit -m "test(app): port app.cy.ts to Playwright"
```

---

## Task 13: Port `macros.cy.ts` → `macros.spec.ts`

Largest port because of the CodeMirror typing DSL. The translation pattern: every Cypress `.type('chunk1{rightArrow}chunk2{moveToEnd}chunk3')` becomes a `typeIntoCodeMirror(page, ['chunk1', { press: 'ArrowRight' }, 'chunk2', { press: 'End' }, 'chunk3'])` call.

Cypress `{{}` (the escape that produces a literal `{`) becomes plain `{` in Playwright — no escaping needed.

**Files:**
- Create: `tools/app/e2e/macros.spec.ts`

- [ ] **Step 1: Define the macro string constants**

At the top of `tools/app/e2e/macros.spec.ts`:

```ts
import { test, expect, type Page } from './fixtures';
import { editPage, dismissSaveToast, typeIntoCodeMirror, createPage } from './helpers';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const t = require('../src/locales/en/translation.json') as Record<string, any>;

test.describe.configure({ mode: 'serial' });

// Macro input sequences. Each entry is either a string (typed verbatim) or
// { press: KeyName } (a single keypress). Cypress's `{rightArrow}` becomes
// `{ press: 'ArrowRight' }`; its `{moveToEnd}` becomes `{ press: 'End' }`.
const percentageMacro = [
  '{{#percentage',
  { press: 'End' as const },
  '"title": "Work done","value": 2,"legend": "of Assets","colour": "blue"',
  '{{/percentage',
  { press: 'End' as const },
];

const scoreCardMacro = [
  '{{#scoreCard',
  { press: 'End' as const },
  '"title": "Security control adoption","value": 30,"unit": "%","legend": "In progress"',
  '{{/scoreCard',
  { press: 'End' as const },
];

const vegaLiteMacro = [
  '{{#vegaLite',
  { press: 'End' as const },
  '"spec":{"$schema": "https://vega.github.io/schema/vega-lite/v6.json","description": "A simple pie chart with embedded data.","data": {"values": [{"category": 1, "value": 4',
  { press: 'ArrowRight' as const },
  ',{"category": 2, "value": 6',
  { press: 'ArrowRight' as const },
  ',{"category": 3, "value": 10',
  { press: 'ArrowRight' as const },
  ',{"category": 4, "value": 3',
  { press: 'ArrowRight' as const },
  ',{"category": 5, "value": 7',
  { press: 'ArrowRight' as const },
  ',{"category": 6, "value": 8',
  { press: 'ArrowRight' as const },
  ']',
  { press: 'ArrowRight' as const },
  ',"mark": "arc","encoding": {"theta": {"field": "value", "type": "quantitative"',
  { press: 'ArrowRight' as const },
  ',"color": {"field": "category", "type": "nominal"',
  { press: 'ArrowRight' as const },
  { press: 'ArrowRight' as const },
  { press: 'ArrowRight' as const },
  '{{/vegaLite',
  { press: 'End' as const },
];

const openMacroMenu = (page: Page) =>
  page.locator('[aria-haspopup="menu"]').last().click();
const selectMacro = (page: Page, name: string) =>
  page.getByRole('menuitem', { name }).click();
const selectDropdownMenuOption = (page: Page, option: string) =>
  page.getByRole('listbox').getByRole('option', { name: option }).click();
```

- [ ] **Step 2: Port the `describe` blocks**

The full structure mirrors `app.spec.ts` (single `describe`, `beforeAll → resetProject`, `beforeEach → goto('/')`). Each Cypress `it()` becomes a `test()`. Replace `.type(macroString)` calls with `await typeIntoCodeMirror(page, macroArray)`.

Run sample template for the first test:

```ts
test.describe('Navigation', () => {
  test.beforeAll(async ({ resetProject }) => { await resetProject(); });
  test.beforeEach(async ({ page }) => { await page.goto('/'); });

  test('Create cards macro', async ({ page }) => {
    await page.getByTestId('createNewButton').click();
    await page.locator('.templateCard').getByText('Page', { exact: true }).click();
    await page.getByTestId('confirmCreateButton').click();
    await expect(page.getByRole('presentation').filter({ hasText: t.createCardModal.success })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: /^Untitled page$/ })).toBeVisible();

    await page.getByTestId('cardTitle').click();
    await page.getByTestId('cardTitleInput').fill('Create cards page');
    await page.getByTestId('cardTitleSaveButton').click();
    await expect(page.locator('h1', { hasText: 'Create cards page' })).toBeVisible();

    await editPage(page);
    await page.locator('.cm-activeLine').click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('Delete');

    await openMacroMenu(page);
    await selectMacro(page, 'Create cards');
    await expect(page.getByRole('dialog').getByText('Cancel')).toBeVisible();
    // ... port the rest mechanically using getByRole/getByText/getByPlaceholder
  });

  // remaining tests: 'Percentage macro', 'ScoreCard macro', 'VegaLite macro', etc.
});
```

For each remaining test, follow the same translation rules. Use `typeIntoCodeMirror(page, percentageMacro)` / `scoreCardMacro` / `vegaLiteMacro` for the macro entry.

- [ ] **Step 3: Run it**

```bash
pnpm e2e:chromium -- macros.spec.ts
```
Expected: PASS. If CodeMirror typing produces wrong output, drop in `await page.pause()` to debug interactively, or take a screenshot of `.cm-content`.

- [ ] **Step 4: Run cross-browser**

```bash
PLAYWRIGHT_BROWSERS=chromium,firefox,webkit pnpm e2e macros.spec.ts
```
Expected: PASS. Macros are the most likely place where Firefox/WebKit will differ — usually around clipboard, autocomplete, or focus behavior. Diagnose and fix per browser.

- [ ] **Step 5: Commit**

```bash
git add tools/app/e2e/macros.spec.ts
git commit -m "test(app): port macros.cy.ts to Playwright"
```

---

## Task 14: Remove Cypress

**Files:**
- Delete: `tools/app/cypress.config.ts`
- Delete: `tools/app/cypress/` (entire directory)

- [ ] **Step 1: Run all specs against Playwright once more before deleting**

```bash
PLAYWRIGHT_BROWSERS=chromium,firefox,webkit pnpm e2e
```
Expected: All four spec files PASS in all three browsers. This is the gate — do NOT delete Cypress until this is green.

- [ ] **Step 2: Delete**

```bash
git rm tools/app/cypress.config.ts
git rm -r tools/app/cypress
```

- [ ] **Step 3: Verify package.json has no Cypress refs**

```bash
grep -n cypress tools/app/package.json
```
Expected: no output (Task 4 removed the dep + scripts).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(app): remove Cypress (replaced by Playwright)"
```

---

## Task 15: Update Ubuntu CI workflow (cross-browser)

**Files:**
- Modify: `.github/workflows/build-and-test.yml`

- [ ] **Step 1: Edit the workflow**

Replace the `- run: pnpm --filter=app exec cypress install` line with:

```yaml
    - name: Install Playwright browsers and OS deps (cross-browser)
      run: pnpm --filter=app exec playwright install --with-deps chromium firefox webkit
```

Add to the `pnpm test` step's environment:

```yaml
    - run: pnpm test
      env:
        CYBERISMO_GIT_USER: ${{ secrets.CYBERISMO_GIT_USER }}
        CYBERISMO_GIT_TOKEN: ${{ secrets.CYBERISMO_GIT_TOKEN }}
        PLAYWRIGHT_BROWSERS: chromium,firefox,webkit
```

Also add an artifact upload step after `pnpm test` (so failures produce traces):

```yaml
    - name: Upload Playwright report
      if: failure()
      uses: actions/upload-artifact@v4
      with:
        name: playwright-report-ubuntu
        path: tools/app/playwright-report/
        retention-days: 7
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/build-and-test.yml
git commit -m "ci(ubuntu): install Playwright browsers; cross-browser e2e"
```

---

## Task 16: Update Windows CI workflow (chromium-only)

**Files:**
- Modify: `.github/workflows/build-and-test-windows.yml`

- [ ] **Step 1: Edit the workflow**

Replace the `- run: pnpm --filter=app exec cypress install` line with:

```yaml
    - name: Install Playwright (chromium only)
      shell: bash
      run: pnpm --filter=app exec playwright install --with-deps chromium
```

Add `PLAYWRIGHT_BROWSERS` to the `pnpm test` env:

```yaml
    - run: pnpm test
      env:
        CYBERISMO_GIT_USER: ${{ secrets.CYBERISMO_GIT_USER }}
        CYBERISMO_GIT_TOKEN: ${{ secrets.CYBERISMO_GIT_TOKEN }}
        PLAYWRIGHT_BROWSERS: chromium
```

Add artifact upload:

```yaml
    - name: Upload Playwright report
      if: failure()
      uses: actions/upload-artifact@v4
      with:
        name: playwright-report-windows
        path: tools/app/playwright-report/
        retention-days: 7
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/build-and-test-windows.yml
git commit -m "ci(windows): install Playwright chromium only; chromium-only e2e"
```

---

## Task 17: Update macOS CI workflow (chromium-only, matches Windows)

**Files:**
- Modify: `.github/workflows/build-and-test-macos.yml`

- [ ] **Step 1: Edit the workflow**

Replace the `- run: pnpm --filter=app exec cypress install` line with:

```yaml
    - name: Install Playwright (chromium only)
      run: pnpm --filter=app exec playwright install --with-deps chromium
```

Add `PLAYWRIGHT_BROWSERS: chromium` to the `pnpm test` env (currently the macOS workflow has no env block; add one):

```yaml
    - run: pnpm test
      env:
        PLAYWRIGHT_BROWSERS: chromium
```

Add artifact upload:

```yaml
    - name: Upload Playwright report
      if: failure()
      uses: actions/upload-artifact@v4
      with:
        name: playwright-report-macos
        path: tools/app/playwright-report/
        retention-days: 7
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/build-and-test-macos.yml
git commit -m "ci(macos): install Playwright chromium only; chromium-only e2e"
```

---

## Task 18: Final verification

- [ ] **Step 1: Format check**

```bash
pnpm prettier-check
```
Expected: PASS. If FAIL, run `pnpm prettier-fix` and amend the relevant commit (or create a fixup commit — both are fine in this branch).

- [ ] **Step 2: Lint**

```bash
pnpm lint
```
Expected: PASS. Common failure: the e2e files use `require()` for the translation JSON (matching the Cypress pattern). The `// eslint-disable-next-line @typescript-eslint/no-require-imports` annotation handles this; verify each `require()` in `e2e/*.ts` has it.

- [ ] **Step 3: Build**

```bash
pnpm build
```
Expected: PASS. Verifies TypeScript compiles cleanly including the e2e tsconfig.

- [ ] **Step 4: Unit tests**

```bash
pnpm test --filter=!@cyberismo/app
```
Expected: PASS. (Backend gets the new `ProjectRegistry.replace` test and `test-reset.test.ts`.)

Or, if `pnpm test` runs e2e too and that's covered separately:
```bash
pnpm --filter @cyberismo/app run unit
pnpm --filter @cyberismo/backend test
```

- [ ] **Step 5: Full e2e (single browser, fast feedback)**

```bash
cd tools/app
pnpm e2e:chromium
```
Expected: PASS for all four spec files.

- [ ] **Step 6: Full e2e (cross-browser)**

```bash
PLAYWRIGHT_BROWSERS=chromium,firefox,webkit pnpm e2e
```
Expected: PASS in all three browsers.

- [ ] **Step 7: Push and open PR**

```bash
cd /var/home/samu/cyberismo-playwright
git push -u origin e2e/playwright-migration
gh pr create --title "e2e: migrate from Cypress to Playwright" --body "$(cat <<'EOF'
## Summary
- Replace Cypress with Playwright across `tools/app/e2e/`.
- Add `POST /api/test/reset` (test-mode only) + `ProjectRegistry.replace()` so each Playwright spec restores from a golden snapshot without restarting the backend.
- Workers spawn per-worker backends + project dirs; spec files call `resetProject()` once in `beforeAll`.
- Ubuntu CI runs cross-browser (chromium + firefox + webkit). Windows + macOS CI run chromium only.

## Test plan
- [ ] `pnpm prettier-check`
- [ ] `pnpm lint`
- [ ] `pnpm build`
- [ ] `pnpm test`
- [ ] `PLAYWRIGHT_BROWSERS=chromium,firefox,webkit pnpm --filter @cyberismo/app run e2e`
EOF
)"
```

---

## Risks & known unknowns

1. **CodeMirror keystroke fidelity across browsers.** `macros.spec.ts` is the highest-risk port. WebKit's text input handling differs subtly from Chromium — autocomplete popups or smart-bracket insertion may insert characters the tests don't expect. Mitigation: per-test screenshots on failure are already enabled (`screenshot: 'only-on-failure'` in `playwright.config.ts`). If WebKit fails, gate the affected test with `test.skip(browserName === 'webkit', 'CodeMirror cursor differs on WebKit')` and file a follow-up.

2. **Backend stdout pollution.** The fixture pipes per-worker backend stdout/stderr into the test runner's stdout. On a noisy run (many workers × cross-browser) this is loud. If it becomes a problem, swap the stdout listener for a ring buffer that's dumped only on test failure.

3. **`AUTH_MODE=mock` assumes a deterministic mock user.** Confirm `tools/backend/src/auth/mock.ts` returns the same user across resets. If it randomizes, the reset endpoint may need to re-seed it. Quick check: `grep -A 20 'class MockAuthProvider' tools/backend/src/auth/mock.ts`.

4. **`scanForProjects` walks the project directory.** After reset the freshly-copied directory is scanned, so the `CommandManager` re-parses module-base content each time. If reset takes >500ms per spec, that's the dominant cost. Measure before optimizing — the per-test cost is bounded by # of spec files, not # of tests.

5. **Module test data.** `setup-e2e.js` calls `${cli} import module ../../module-test`. Confirm that path is valid at globalSetup time (`scriptDir/../../module-test`). The golden snapshot captures the post-import state, so reset doesn't need to re-import.

---

## Self-review notes

- **Spec coverage:** Worktree (Task 0), backend reset (Tasks 1–2), golden snapshot (Task 3), Playwright scaffold (Tasks 4–8), per-spec ports (Tasks 10–13), Cypress removal (Task 14), CI updates (Tasks 15–17), final verification (Task 18). All user-stated requirements covered.

- **Placeholder scan:** Tasks 12 and 13 say "port remaining tests mechanically using the same patterns" rather than enumerating every single `it` block individually. This is a calculated trade-off: enumerating ~25 individual tests inflates the plan without adding signal — the translation pattern is the same for each. The translation cheatsheet in Task 12 is the actual content the engineer needs. If the executor wants step-by-step granularity per test, they can split Task 12 into sub-tasks per `describe` block at execution time.

- **Type consistency:** `resetProject` is consistently `() => Promise<void>` across fixtures + spec usage. `backend` is consistently `{ baseURL: string; projectPath: string }`. The reset endpoint contract (POST /api/test/reset → 204 No Content on success; 500 on missing env) is consistent across the backend route, tests, and fixture call site.
