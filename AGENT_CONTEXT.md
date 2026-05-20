# Agent Context

> This file is for LLM agents working on the Cyberismo monorepo. It provides context, conventions, and validation commands so you can work autonomously without back-and-forth.

## Project Overview

Cyberismo is a TypeScript monorepo for a card-and-resource-based knowledge tool, organised as pnpm workspaces under `tools/`. Cards live in a git-tracked file tree; resource definitions (card types, workflows, field types, link types, templates, calculations, reports, graph models, graph views) live alongside them. A logic engine (Clingo via `node-clingo`) computes derived facts. The system is delivered as a CLI (`cyberismo`), a React frontend (`tools/app`) backed by a Hono HTTP server (`tools/backend`), and an MCP server (`tools/mcp`).

## Stack

- **Language:** TypeScript (strict mode), ES modules (`"type": "module"` in every package).
- **Runtime:** Node 22 LTS.
- **Package manager:** pnpm (workspaces). **Never use `npm` or `yarn`.**
- **Test framework:** Vitest in `app`, `backend`, `mcp`, `node-clingo`, `data-handler`. Mocha + Chai historically used in `cli`. Tests live in `test/` (or `__tests__/` in `app`).
- **Type checking:** `tsc --noEmit` (or built-in via `pnpm build`).
- **Backend HTTP:** Hono with Zod validation via `@hono/zod-validator`.
- **Frontend:** React 19 + Vite + SWR for fetching + Redux Toolkit for non-fetch state.

## Directory Structure

```
tools/
├── app/          # React 19 + Vite frontend
├── backend/      # Hono HTTP server
│   └── src/
│       ├── domain/<feature>/   # one folder per feature (index.ts, schema.ts, service.ts)
│       ├── middleware/         # auth, command-manager, validators
│       └── auth/               # Keycloak + mock providers
├── cli/          # The `cyberismo` CLI (commander-based)
├── data-handler/ # Core business logic (Project, resources, commands, mutations engine)
│   └── src/
│       ├── commands/           # User-facing command classes (Create, Update, Remove, Rename, …)
│       ├── containers/         # Project + caches + paths
│       ├── interfaces/         # Type-only files
│       ├── modules/            # Module import resolver and applier
│       ├── permissions/        # ActionGuard etc.
│       ├── resources/          # ResourceObject + subclasses (one per resource type)
│       ├── utils/              # ConfigurationLogger, rw-lock, json, git-manager, etc.
│       └── mutations/          # (NEW — added by the migration-system plans)
├── mcp/          # MCP server exposing data-handler over the Model Context Protocol
├── node-clingo/  # Native Clingo bindings
├── assets/       # Shared JSON schemas and static content
└── migrations/   # The tool's own schema-version migrations (v1→v2→…); unrelated to the new module migration system being built
```

## Conventions

### Naming
- **Files:** kebab-case (`field-type-resource.ts`, `configuration-logger.ts`).
- **Types/interfaces/classes:** PascalCase (`ResourceMutations`, `MigrationEntry`).
- **Functions/variables:** camelCase (`createVersion`, `previousSealedVersion`).

### Imports
- **Use `.js` extensions on every relative import**, even though source is `.ts`:
  ```typescript
  // CORRECT
  import { Project } from './containers/project.js';
  // WRONG
  import { Project } from './containers/project';
  ```
- Use the `node:` prefix on Node built-ins: `import { join } from 'node:path'`.
- Internal package imports use `"workspace:*"` in `package.json` and import as `@cyberismo/<package>` in code (e.g. `import { ResourceMutations } from '@cyberismo/data-handler';`).

### Patterns to follow
- **Backend route:** see `tools/backend/src/domain/cardTypes/index.ts` for the Hono router + Zod validator + service-delegation pattern.
- **Command class:** see `tools/data-handler/src/commands/update.ts`. Constructor takes a `Project`; methods wrap `project.lock.write(...)` and use `runWithDefaultCommitMessage`.
- **Resource subclass:** see `tools/data-handler/src/resources/link-type-resource.ts`. Extends `ResourceObject<T>`; overrides `update`, `rename`, `usage`.
- **Test:** see `tools/data-handler/test/utils/configuration-logger.test.ts`. Vitest `describe`/`it`/`expect`/`beforeAll`/`afterAll`; temp-dir fixtures under `tmp-*/`; clean up in `afterAll`.
- **SSE streaming:** see `tools/backend/src/domain/cards/index.ts` for `streamSSE(c, async (stream) => {...})` usage.
- **File-tree fixtures for tests:** `tools/data-handler/test/test-data/` has prepared project fixtures (`decision-records` is the common one). Copy with `copyDir(FIXTURE_PATH, projectPath)` per the existing tests.

### Things to avoid
- **`.only()` in tests** — enforced by `--forbid-only` in the test config; will fail CI.
- **`as any`** in TypeScript — use proper types or `as unknown as <Type>` where strictly necessary.
- **Mutating arguments** — return new arrays/objects instead.
- **`--no-verify` on commits** — pre-commit hooks are part of the contract; fix the failure, don't bypass.
- **`npm` / `yarn`** — always `pnpm`.
- **Skipping the `.js` extension** — NodeNext resolution requires it.
- **Direct `console.log`** in library code — use `getChildLogger({ module: '...' })` from `tools/data-handler/src/utils/log-utils.ts`. CLI code may use `console.log` for user-visible output.

## Validation Commands

Run these after making changes and include results in your completion report.

### Tests (per package)
```bash
# Run all tests in the data-handler package
pnpm --filter @cyberismo/data-handler test

# Run a single test file
pnpm --filter @cyberismo/data-handler test test/path/to/file.test.ts

# Run tests in a specific test name
pnpm --filter @cyberismo/data-handler test -t "describe or it name"
```

### Tests (whole monorepo)
```bash
pnpm test
```

### Type check / build
```bash
# Per package
pnpm --filter @cyberismo/data-handler build

# Whole monorepo
pnpm build
```

### Lint
```bash
pnpm --filter @cyberismo/data-handler lint   # per package
pnpm lint                                      # all packages
```

### Formatting
```bash
pnpm prettier-check   # check; CI uses this
pnpm prettier-fix     # auto-fix
```

## Common Gotchas

- **The migration system being built is NOT the same as `tools/migrations/`.** That folder holds schema migrations for the tool's own internal data format (v1→v2→…), and has its own `commands/migrate.ts` and `migrations/migration-executor.ts`. The new feature uses "mutation" and "module update" terminology in user-facing CLI / HTTP to avoid confusion.
- **`ConfigurationLogger` log format** (`tools/data-handler/src/utils/configuration-logger.ts`): JSONL, one breaking change per line. The migration plans change the entry shape from `{operation: ConfigurationOperation, ...}` to `{kind: MigrationEntryKind, ...}` with a `kind` discriminator.
- **`Operation<T>`** (in `tools/data-handler/src/resources/resource-object.ts`) has four variants: `add | change | rank | remove`. The discriminated union shape (e.g. `ChangeOperation<T>` carries `target` and `to`) is reused across the codebase.
- **`@write` decorator** (`tools/data-handler/src/utils/rw-lock.ts`) wraps mutating command methods in a project-wide write lock. Reentrant — nested write calls are no-ops within the same async context.
- **`runWithDefaultCommitMessage`** (`tools/data-handler/src/utils/commit-context.ts`) sets a default git-commit message for any commits the operation triggers. Wrap the lock body when you want a custom message.
- **Resource cache** (`tools/data-handler/src/containers/project/resource-cache.ts`): mutations must invalidate the right cache entries. Resource subclasses handle this in their `create`/`delete`/`rename`/`write` methods — don't bypass.
- **`Project.lock.write(async () => {...})`** is the correct pattern for any code that writes files in `cardRoot` or `.cards/`.

## Environment

- No environment variables required for tests.
- No database, no external services — file-system based with git as the source of truth.
- `node-clingo` requires a build step (`pnpm build`) before tests run.
- Tests under `data-handler/test/` use temp directories under `tools/data-handler/test/<test-name>/tmp-*` that are cleaned up by `afterAll`/`afterEach`. Failures may leave debris — clean with `rm -rf tools/data-handler/test/**/tmp-*` if needed.

## Test fixture quick reference

`tools/data-handler/test/test-data/` (verify by listing):
- `decision-records` or `valid/decision-records` — a small project with card types, workflows, field types, link types, templates, calculations. Use this for any test that needs a working project.

If a plan references a fixture that doesn't exist under exactly the path it gives, fall back to `decision-records` (or its `valid/` variant) and note the substitution in the commit message.

## Git workflow

- Local commits only — never push from inside a task.
- One commit per task. Match the commit message in the plan exactly.
- Never use `git reset --hard`, `git checkout --`, `git clean -f`, or `git push --force`. If you need to undo, use `git revert` (a new commit that undoes the previous one).
- Pre-commit hooks may run lint/format. Let them run; fix what they flag.
