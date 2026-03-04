# CLAUDE.md — AI Assistant Instructions for Cyberismo

This is the single source of truth for AI coding assistants working on this repository.
Read this file in full before making any change. This file is also summarized in `.github/copilot-instructions.md` for GitHub Copilot auto-loading.

---

## 1. What This Project Is

Cyberismo helps organisations manage cybersecurity in software. AGPL-3.0 licensed.

**pnpm monorepo** — all packages live under `tools/`:

| Package          | What it does                                                  | Tests                |
| ---------------- | ------------------------------------------------------------- | -------------------- |
| **data-handler** | Core domain: cards, projects, resources, calculations, macros | Mocha + Chai + Sinon |
| **backend**      | Hono REST API — thin layer over data-handler                  | Vitest               |
| **app**          | React 19 + Vite + MUI Joy/Material + Redux Toolkit + SWR      | Vitest + Cypress e2e |
| **cli**          | Commander CLI — wraps data-handler commands                   | Mocha + Chai         |
| **mcp**          | MCP server for AI tool integration                            | Vitest               |
| **assets**       | JSON schemas, schema version constant                         | —                    |
| **migrations**   | Data migration scripts between schema versions                | —                    |
| **node-clingo**  | Native N-API bindings for Clingo solver                       | Mocha + Chai         |

---

## 2. Hard Rules — Violating Any of These Breaks the Build

### Package manager

Always `pnpm`. Never `npm` or `yarn`. A preinstall script will reject anything else.

### Module system

Pure ESM everywhere (`"type": "module"` in every `package.json`).
**Every** relative import must end in `.js`, even when the source file is `.ts`:

```typescript
// CORRECT
import { Project } from './containers/project.js';
import type { Card } from '../interfaces/project-interfaces.js';

// WRONG — will fail at runtime
import { Project } from './containers/project';
import { Project } from './containers/project.ts';
```

### Type-only imports

ESLint rule `@typescript-eslint/consistent-type-imports` is set to `error`.
If you import something used only as a type, you **must** use `import type`:

```typescript
// CORRECT
import type { Card, CardAttachment } from '../interfaces/project-interfaces.js';
import type { DataType } from '../interfaces/resource-interfaces.js';

// WRONG — lint error
import { Card } from '../interfaces/project-interfaces.js'; // Card only used as a type
```

### Node built-ins

Always use the `node:` prefix:

```typescript
import { join, resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
```

### Workspace imports

Reference sibling packages by name, not relative paths:

```typescript
import { SCHEMA_VERSION } from '@cyberismo/assets';
import { CommandManager } from '@cyberismo/data-handler';
import type { QueryResult } from '@cyberismo/data-handler/types/queries';
```

### Promise handling

In **data-handler**, **backend**, and **cli**, ESLint enforces `no-floating-promises` and `no-misused-promises`. Every promise must be `await`ed, returned, or explicitly handled. A bare `someAsyncFn()` without `await` is a lint error.

### License header

Every new `.ts` / `.tsx` file **must** begin with:

```typescript
/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2026

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/
```

### Formatting

Prettier with **single quotes** (`.prettierrc`). Semicolons on, 2-space indent. Run `pnpm prettier-fix` to auto-format.

---

## 3. Architecture — How the Pieces Fit Together

```
CLI (Commander)          App (React + SWR)
     │                        │
     │  imports directly      │  HTTP calls to /api/*
     ▼                        ▼
 Commands class ◄──── Backend (Hono routers)
     │                        │
     │                        │  middleware injects CommandManager
     ▼                        ▼
 CommandManager (singleton per project path)
     │
     │  owns all command instances + Project
     ▼
 Project (extends CardContainer)
     │
     ├── CalculationEngine    (Clingo-based)
     ├── ResourceHandler      (reads/writes .cards/ resources)
     ├── ProjectConfiguration (project settings, schema version)
     └── Card tree            (cached in memory)
```

### data-handler — the core

```
src/
  command-handler.ts  — Commands class: the public entry point for CLI
  command-manager.ts  — CommandManager: singleton, owns Project + all command instances
  commands/           — One class per verb: Create, Show, Edit, Move, Transition, ...
  containers/         — Domain objects: Project (extends CardContainer), Template
  interfaces/         — TypeScript interfaces (project-interfaces, resource-interfaces, ...)
  types/              — Type definitions (queries, etc.)
  utils/              — Pure utilities (file-utils, card-utils, error-utils, git-manager, rw-lock, ...)
  exceptions/         — DHValidationError, SchemaNotFound, MacroError
  resources/          — Resource reading/writing, resource objects
  macros/             — Macro system (runs inside card content)
  permissions/        — ActionGuard: RBAC permission checks
  migrations/         — Schema migration executor and workers
  index.ts            — Barrel re-exports
```

Key patterns:

- `Commands` class — primary public method is `command(cmd, args, options)` returning `requestStatus`.
- `CommandManager` is a **singleton per project path** — `await CommandManager.getInstance(path)` (async).
- Command classes receive `Project` via constructor injection.
- The `@write` and `@read` decorators on methods acquire locks via `RWLock`.

### backend — thin API layer

```
src/
  app.ts              — createApp(authProvider, commands): builds the Hono instance
  index.ts            — Barrel + createServer() for running the backend
  domain/             — One folder per entity: cards/, cardTypes/, workflows/, resources/, ...
    cards/
      index.ts        — Hono router with route handlers
      service.ts      — Business logic functions (call CommandManager)
      lib.ts          — Card-specific utilities (no schema.ts here)
    labels/
      index.ts        — Hono router with route handlers
      service.ts      — Business logic functions (call CommandManager)
    ...               — Other domains typically have: index.ts, service.ts, schema.ts
  middleware/
    auth.ts           — Auth middleware + requireRole() guard
    commandManager.ts — Injects CommandManager into Hono context
    tree.ts           — Tree-related context
    zvalidator.ts     — Zod validator middleware
  auth/               — AuthProvider implementations (MockAuthProvider, KeycloakAuthProvider)
```

Key patterns:

- `createApp(authProvider, commandManager)` — second arg is a `CommandManager` instance, not a path.
- Every domain folder exports a `Hono` router as its default export.
- Route handlers get `CommandManager` from `c.get('commands')`.
- Role-based access via `requireRole(UserRole.Reader)` middleware.
- Error handling: `app.onError()` returns `{ error: message }` as JSON with status 500.

### app — React frontend

```
src/
  lib/
    store.ts          — Redux store (configureStore + redux-persist)
    swr.ts            — SWR fetcher, callApi(), apiPaths
    slices/           — Redux slices (card, notifications, pageState, recentlyViewed, swr)
    api/              — Custom hooks per entity (useCardData, useCardMutations, ...)
    hooks/            — Shared React hooks
    definitions.ts    — Frontend type definitions
    utils.ts          — Utility functions
  components/         — React components
  pages/              — Page-level components
  providers/          — Context providers
  locales/            — i18n translations (i18next)
```

Key patterns:

- Data fetching uses **SWR** (`useSWRHook` helper in `lib/api/common.ts`), not RTK Query.
- API calls go through `callApi()` from `lib/swr.ts` which handles error responses.
- `ApiCallError` is the custom error class for failed API calls.
- State persistence via `redux-persist` with `localStorage`.

### cli — Commander wrapper

```
src/
  index.ts            — Single file: all Commander commands, option parsing, calls Commands class
  resource-type-parser.ts — Parses resource type strings from CLI input
```

Key pattern: every CLI command calls `commandHandler.command(Cmd.xxx, args, options)` and passes the `requestStatus` result through `handleResponse()`.

---

## 4. Writing Code That Fits

### TypeScript conventions

- **Strict mode** is on. Never use `any` without a comment explaining why.
- Use `interface` for object shapes. Use `type` for unions, aliases, and mapped types.
- Add **JSDoc** to every public class, method, interface, and exported function.
- Only use `//` comments when the code genuinely needs explanation.
- Prefer named exports. The barrel file (`index.ts`) re-exports explicitly — no `export *` from internal modules.

### Error handling

Three custom error classes exist in `data-handler/src/exceptions/`:

```typescript
// Validation failures — carries optional JSON schema validation errors
throw new DHValidationError('Card type not found', validationErrors);

// Schema resolution failures
throw new SchemaNotFound('Schema file missing');

// Macro execution failures — carries full execution context
throw new MacroError(message, cardKey, macroName, parameters, dependency);
```

Use `errorFunction(error)` from `utils/error-utils.ts` to safely extract a message from any caught `unknown`:

```typescript
try {
  await riskyOperation();
} catch (error) {
  return { statusCode: 400, message: errorFunction(error) };
}
```

Never catch and silently ignore. Either rethrow, return an error status, or log.

### Naming

- Files: `kebab-case.ts` (e.g., `card-utils.ts`, `error-utils.ts`).
- Classes: `PascalCase` (e.g., `CommandManager`, `Project`).
- Interfaces/types: `PascalCase` (e.g., `Card`, `CardAttachment`, `ProjectMetadata`).
- Functions/methods: `camelCase` (e.g., `errorFunction`, `getTestProject`).
- Constants: `UPPER_SNAKE_CASE` for true constants (e.g., `SCHEMA_VERSION`, `ROOT`), `camelCase` for const references (e.g., `const router = new Hono()`).
- Test files: `<subject>.test.ts` (e.g., `command-create.test.ts`, `utils.test.ts`).

---

## 5. Test-Driven Development — the Non-Negotiable Workflow

### The rule

1. **Before writing new code**, write a test that describes the expected behavior. Watch it fail.
2. **Before fixing a bug**, write a test that reproduces it. Watch it fail.
3. Implement the minimal change to make the test pass.
4. Clean up. Ensure all related tests still pass.

### Running tests

```bash
# Full suite (slow — runs all packages sequentially)
pnpm test

# Target one package
pnpm test-data-handler
pnpm test-backend
pnpm test-app
pnpm test-cli
pnpm test-clingo
pnpm test-mcp

# Target one file — data-handler or cli (Mocha)
pnpm --filter data-handler exec mocha --require mocha-suppress-logs \
  --disable-warning=ExperimentalWarning "test/command-create.test.ts"

# Target one file — backend (Vitest)
pnpm --filter backend exec vitest run test/api.test.ts

# Target one file — app (Vitest)
pnpm --filter app exec vitest run __tests__/utils.test.ts
```

**Always build before testing** if you changed data-handler source (backend and cli depend on its compiled output):

```bash
pnpm --filter data-handler build
```

### Writing tests — package-specific patterns

#### data-handler & cli (Mocha + Chai)

```typescript
import { expect } from 'chai';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { copyDir, resolveTilde } from '../src/utils/file-utils.js';
import { getTestProject } from './helpers/test-utils.js';

const baseDir = import.meta.dirname;
const testDir = join(baseDir, 'tmp-my-feature-tests');

describe('my feature', () => {
  before(async () => {
    // Always copy fixtures to a temp dir — never mutate source test data
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data', testDir);
  });

  after(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('returns expected result for valid input', async () => {
    const project = getTestProject(join(testDir, 'valid/decision-records'));
    const result = await project.someMethod();
    expect(result).to.deep.equal(expectedValue);
  });

  it('throws on invalid input', async () => {
    try {
      await project.someMethod(badInput);
      expect.fail('should have thrown');
    } catch (error) {
      expect(error).to.be.instanceOf(DHValidationError);
    }
  });
});
```

- `getTestProject(path)` creates a `Project` with `autoSave: false` and injects the current schema version.
- `mockEnsureModuleListUpToDate()` stubs network calls during tests (returns a sinon stub to restore).
- Test data lives in `test/test-data/`. The `valid/decision-records` project is the primary fixture.
- `mocha-suppress-logs` suppresses `console.log` output during tests.

#### backend (Vitest)

```typescript
import { expect, test, beforeEach, afterEach } from 'vitest';
import { CommandManager } from '@cyberismo/data-handler';
import { createApp } from '../src/app.js';
import { MockAuthProvider } from '../src/auth/mock.js';
import { createTempTestData, cleanupTempTestData } from './test-utils.js';

let app: ReturnType<typeof createApp>;
let tempTestDataPath: string;

beforeEach(async () => {
  tempTestDataPath = await createTempTestData('decision-records');
  const commands = await CommandManager.getInstance(tempTestDataPath);
  app = createApp(new MockAuthProvider(), commands);
});

afterEach(async () => {
  await cleanupTempTestData(tempTestDataPath);
});

test('GET /api/cards returns project info', async () => {
  const response = await app.request('/api/cards');
  expect(response.status).toBe(200);

  const result = await response.json();
  expect(result.name).toBe('decision');
});
```

- Test Hono **without starting a server** — use `app.request(path)`.
- `createApp` takes `(AuthProvider, CommandManager)` — create a `CommandManager` instance first.
- `createTempTestData('decision-records')` copies fixtures to a temp dir and returns the path.
- `cleanupTempTestData(path)` removes the temp dir.
- Use `MockAuthProvider` — tests run without real authentication.

#### app (Vitest + Testing Library)

```typescript
import { expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';

test('renders card title', () => {
  render(<CardHeader title="Test Card" />);
  expect(screen.getByText('Test Card')).toBeDefined();
});
```

### Test quality rules

- **One behavior per test.** If you need "and" in the test name, split it.
- **Test names describe behavior**, not implementation: "returns empty array when no cards exist", not "tests getCards".
- **Include failure cases.** Every new feature should have at least one test for the error/edge path.
- **Deterministic.** No `setTimeout` waits, no reliance on external services, no non-deterministic ordering.
- **Never commit `.only`** — CI runs with `--forbid-only` and will fail.
- **Don't over-mock.** Prefer exercising real code paths. Mock only external I/O (network calls, file system when destructive).

---

## 6. Common Mistakes AI Assistants Make in This Codebase

| Mistake                                       | Why it breaks                                     | Fix                                                                            |
| --------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------ |
| Missing `.js` in import path                  | Runtime crash — Node ESM requires file extensions | Always add `.js` to relative imports                                           |
| Using `import { Foo }` for types              | ESLint `consistent-type-imports` error            | Use `import type { Foo }` when it's only used as a type                        |
| `import path from 'path'`                     | Violates `node:` prefix convention                | `import { join } from 'node:path'`                                             |
| Using `npm install` or `yarn add`             | Rejected by preinstall script                     | `pnpm add <pkg>` or `pnpm install`                                             |
| Forgetting license header                     | Code review rejection                             | Add the full AGPL-3.0 block at the top of every new file                       |
| `console.log` in data-handler source          | Use structured logging                            | Use `getChildLogger()` from `utils/log-utils.ts`                               |
| Creating test data inline                     | Inconsistent with patterns                        | Copy from `test/test-data/` to a temp dir                                      |
| Mutating test fixture files                   | Breaks other tests                                | Always `copyDir` to temp dir, `rmSync` in `after()`                            |
| `any` without justification                   | Strict mode + review rejection                    | Use proper types; add `// eslint-disable-next-line` only with a reason comment |
| Bare promise without `await`                  | `no-floating-promises` lint error                 | `await` the call, return it, or explicitly handle                              |
| Mixing Chai and Vitest assertions             | Using `expect(x).toBe(y)` in Mocha tests          | Mocha/Chai: `expect(x).to.equal(y)`. Vitest: `expect(x).toBe(y)`               |
| Adding to index.ts barrel without real export | Breaks the public API surface                     | Only add to barrel if it's genuinely part of the public API                    |

---

## 7. Verification Checklist

Run all of these before considering any change complete:

```bash
# 1. Build what changed (data-handler builds are needed by downstream packages)
pnpm --filter <package> build

# 2. Run the relevant test suite
pnpm test-<package>
# Or a single file:
pnpm --filter <package> exec mocha ... "test/file.test.ts"  # Mocha packages
pnpm --filter <package> exec vitest run test/file.test.ts    # Vitest packages

# 3. Lint
pnpm --filter <package> lint

# 4. Format check
pnpm prettier-check
```

If you changed data-handler and other packages depend on it, build data-handler first, then test the dependents.

---

## 8. Workflow for AI-Assisted Changes

1. **Read first.** Open the source file, its test file, and any related interfaces before writing code. Understand the patterns in that specific package.
2. **Write the test first.** Even for "simple" changes. This catches misunderstandings early.
3. **Make minimal changes.** One concern per change. Don't refactor unrelated code.
4. **Match existing style exactly.** If the file uses `const` over `let`, if it uses early returns, if it destructures — do the same.
5. **Build, test, lint, format.** In that order. Fix issues before moving on.
6. **Don't add dependencies** without discussion. The monorepo has specific version management with pnpm overrides.

---

## 9. Quick Reference

```bash
pnpm install              # Install all dependencies
pnpm build                # Build all packages
pnpm dev                  # Start all packages in dev/watch mode
pnpm lint                 # Lint all packages
pnpm test                 # Run all tests
pnpm prettier-check       # Check formatting
pnpm prettier-fix         # Fix formatting
pnpm clean                # Remove all node_modules
```
