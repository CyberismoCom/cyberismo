# Migration System — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the foundation of the migration system per `migration-system.allium` and `migration-system.md`: a preview/apply mutation engine with fingerprinting, a dispatcher, support for empty sealed logs, the four-variant `MigrationEntry` format, and one cascade handler (LinkType) end-to-end. After this plan, one specific kind of breaking edit flows through the new engine and the architecture is validated.

**Architecture:** A new `tools/data-handler/src/mutations/` folder holds the engine. Each (resource type × variant) cascade lives in `mutations/handlers/`. The existing `ConfigurationLogger` keeps the on-disk format compatible after a small entry-shape change (`kind` discriminator). One existing resource (`LinkTypeResource`) loses its cascade methods to the new handler; its tests and the existing `commands/update.ts` flow get rerouted through the new engine to prove the design end-to-end.

**Tech Stack:** TypeScript, Node 22, ESM with `.js` extensions on relative imports, Vitest for tests, pnpm workspaces, Hono (backend — not touched in this plan), `node:crypto` for fingerprints. Existing patterns to follow: `tools/data-handler/src/utils/configuration-logger.ts` (singleton log), `tools/data-handler/src/resources/resource-object.ts` (Operation<T> shape), `tools/data-handler/test/utils/configuration-logger.test.ts` (Vitest style, temp-dir fixtures).

---

## Scope

**In scope (this plan):**
- `mutations/types.ts` — `MutationInput`, `PreviewResult`, `MutationFingerprint`, `CascadePreview`, `ApplyOptions`, `MutationPlan`, `Handler` interface.
- `mutations/dispatcher.ts` — handler registry and `dispatch()` function.
- `mutations/fingerprint.ts` — deterministic SHA-256 over input + affected file digests.
- `mutations/plan.ts` — `ResourceMutations` class with `plan()` and `apply()`.
- `mutations/handlers/default-no-cascade.ts` — fallback handler for display-only changes.
- `mutations/handlers/link-type-rename.ts` — first real cascade handler, extracts existing `LinkTypeResource.updateCardLinks` plus the rename machinery.
- `ConfigurationLogger` updates — new `MigrationEntry` shape with `kind` discriminator; drop `MODULE_REMOVE`; support empty seals via `createVersion()` not throwing on a missing source file.
- `commands/update.ts` — one path (link-type rename) reroutes through the new engine; the rest remain on the existing path.

**Out of scope (follow-on plans needed):**
- Plan 2: FieldType edit/delete handlers (enum operations, dataType changes — the largest cascade family).
- Plan 3: CardType edit/delete/workflow-change handlers.
- Plan 4: Workflow handlers (state-add/remove/rename, transitions).
- Plan 5: ResourceDelete handlers for all remaining types.
- Plan 6: ProjectRename handler.
- Plan 7: Module update flow (`PreviewModuleUpdate`, `UpdateModule`, replay engine, `appliedModules.json`).
- Plan 8: HTTP routes (`POST /mutations/preview`, `POST /mutations/apply`, SSE for module updates).
- Plan 9: CLI integration for the remaining verbs.

This plan establishes the foundation. Follow-on plans reuse the engine and dispatcher; each follow-on plan adds handlers and routes through them.

---

## File structure

**New files:**
- `tools/data-handler/src/mutations/types.ts`
- `tools/data-handler/src/mutations/handler.ts`
- `tools/data-handler/src/mutations/dispatcher.ts`
- `tools/data-handler/src/mutations/fingerprint.ts`
- `tools/data-handler/src/mutations/plan.ts`
- `tools/data-handler/src/mutations/handlers/default-no-cascade.ts`
- `tools/data-handler/src/mutations/handlers/link-type-rename.ts`
- `tools/data-handler/test/mutations/dispatcher.test.ts`
- `tools/data-handler/test/mutations/fingerprint.test.ts`
- `tools/data-handler/test/mutations/plan.test.ts`
- `tools/data-handler/test/mutations/handlers/link-type-rename.test.ts`

**Modified files:**
- `tools/data-handler/src/utils/configuration-logger.ts` — add `MigrationEntryKind` enum, new entry shape, empty-seal support; drop `MODULE_REMOVE`.
- `tools/data-handler/test/utils/configuration-logger.test.ts` — update for new shape and empty-seal behaviour.
- `tools/data-handler/src/commands/update.ts` — route link-type renames through the new engine.
- `tools/data-handler/src/resources/link-type-resource.ts` — remove `updateCardLinks` and related helpers (now in the handler).

---

## Tasks

### Task 1: Add `MutationEntryKind` and update `ConfigurationLogEntry` shape

**Files:**
- Modify: `tools/data-handler/src/utils/configuration-logger.ts`
- Test: `tools/data-handler/test/utils/configuration-logger.test.ts`

The existing on-disk shape is `{ timestamp, operation: ConfigurationOperation, target, parameters? }`. The new shape is `{ timestamp, kind: MutationEntryKind, target, payload }`. `MODULE_REMOVE` and `PROJECT_RENAME` are removed from the enum (the spec drops `MODULE_REMOVE`; `PROJECT_RENAME` will return as a kind in a later plan). Existing entries written before the change are not migrated — clean break.

- [ ] **Step 1: Write the failing test**

In `tools/data-handler/test/utils/configuration-logger.test.ts`, near the existing `describe('configuration logger', …)` block, add:

```typescript
it('writes entries with the new kind-discriminated shape', async () => {
  const projectPath = await freshProject('shape-test');
  await ConfigurationLogger.log(projectPath, {
    kind: 'resource_edit',
    target: 'foo/cardTypes/bar',
    payload: { key: 'customFields', operation: { name: 'remove', target: 'priority' } },
  });
  const entries = await ConfigurationLogger.entries(projectPath);
  expect(entries).toHaveLength(1);
  expect(entries[0].kind).toBe('resource_edit');
  expect(entries[0].target).toBe('foo/cardTypes/bar');
  expect(entries[0]).not.toHaveProperty('operation'); // old field is gone
});
```

If `freshProject` helper does not exist in the test file already, extract one from the existing `beforeAll` setup — it must `mkdir` the temp project root with the `.cards/local/migrationLog` subtree the logger expects.

- [ ] **Step 2: Run test to verify it fails**

```bash
cd tools/data-handler && pnpm test test/utils/configuration-logger.test.ts
```

Expected: FAIL — `Property 'kind' does not exist on type 'ConfigurationLogEntry'`.

- [ ] **Step 3: Update the entry shape in `configuration-logger.ts`**

Replace `ConfigurationOperation` enum and `ConfigurationLogEntry` interface with:

```typescript
export type MigrationEntryKind =
  | 'resource_edit'
  | 'resource_delete'
  | 'resource_rename';
// Note: project_rename comes in a later plan.

export interface ConfigurationLogEntry {
  timestamp: string;
  kind: MigrationEntryKind;
  target: string;
  payload: Record<string, unknown>;
}
```

Update `ConfigurationLogger.log` to accept the new shape (drop the `Omit<ConfigurationLogEntry, 'timestamp'>` typing if it referenced the old enum). Update `logResourceUpdate`, `logResourceRename`, `logResourceDelete` to emit the new shape:

```typescript
public static async logResourceUpdate<T>(
  projectPath: string,
  target: string,
  resourceType: ResourceFolderType,
  op: Operation<T>,
  key: string,
): Promise<void> {
  if (op.name === 'add' || op.name === 'rank') return;
  if (NON_BREAKING_KEYS.includes(key)) return;
  if (op.name === 'change') {
    if (NON_BREAKING_CHANGE_KEYS.includes(key)) return;
    if (ConfigurationLogger.isNonBreakingArrayChange(key, op)) return;
  }
  await ConfigurationLogger.log(projectPath, {
    kind: 'resource_edit',
    target,
    payload: { type: resourceType, operation: op, key },
  });
}

public static async logResourceRename(
  projectPath: string,
  target: string,
  resourceType: ResourceFolderType,
  op: ChangeOperation<string>,
): Promise<void> {
  await ConfigurationLogger.log(projectPath, {
    kind: 'resource_rename',
    target,
    payload: { type: resourceType, newName: op.to },
  });
}

public static async logResourceDelete(
  projectPath: string,
  target: string,
  resourceType: ResourceFolderType,
): Promise<void> {
  await ConfigurationLogger.log(projectPath, {
    kind: 'resource_delete',
    target,
    payload: { type: resourceType },
  });
}
```

Delete the `logResourceModuleRemove` method and any reference to `MODULE_REMOVE` / `PROJECT_RENAME` (search the file).

- [ ] **Step 4: Update `entries()` validation**

The current `entries()` checks `entry.timestamp && entry.operation && entry.target`. Change to:

```typescript
if (entry.timestamp && entry.kind && entry.target) {
  entries.push(entry);
}
```

- [ ] **Step 5: Find and update all callers**

```bash
cd tools/data-handler && grep -rn "ConfigurationOperation\." src/
```

Each match references the old enum. There should be exactly:
- `commands/remove.ts:~350` — module removal path; remove the `MODULE_REMOVE` log call (the spec drops this).
- `commands/rename.ts:~290` — project-rename log call; remove it (a later plan adds project_rename back).

Both are deletions of single statements; no replacement needed in this plan.

- [ ] **Step 6: Update the existing logger tests for the new shape**

Open `tools/data-handler/test/utils/configuration-logger.test.ts`. Replace each `expect(entries[0].operation).toBe(ConfigurationOperation.RESOURCE_*)` with `expect(entries[0].kind).toBe('resource_*')`. Remove the `ConfigurationOperation` import.

- [ ] **Step 7: Run tests to verify all pass**

```bash
cd tools/data-handler && pnpm test
```

Expected: PASS. If any other test imported `ConfigurationOperation`, update it the same way.

- [ ] **Step 8: Commit**

```bash
git add tools/data-handler/src/utils/configuration-logger.ts \
        tools/data-handler/test/utils/configuration-logger.test.ts \
        tools/data-handler/src/commands/remove.ts \
        tools/data-handler/src/commands/rename.ts
git commit -m "refactor: kind-discriminated MigrationEntry shape

Replaces ConfigurationOperation enum with MigrationEntryKind = resource_edit
| resource_delete | resource_rename. Drops MODULE_REMOVE and PROJECT_RENAME
log calls per the migration-system spec (module removal decomposes into
primitive entries; project_rename returns in a later plan)."
```

---

### Task 2: Support empty-log seals in `createVersion()`

**Files:**
- Modify: `tools/data-handler/src/utils/configuration-logger.ts:105-129`
- Test: `tools/data-handler/test/utils/configuration-logger.test.ts`

Today's `createVersion()` throws `'No current migration log exists to version'` when `migrationLog.jsonl` is absent. The spec wants empty seals to succeed silently (no file is written; replay against a missing file is a no-op).

- [ ] **Step 1: Write the failing test**

Add to `configuration-logger.test.ts`:

```typescript
it('createVersion succeeds with no current log (empty seal)', async () => {
  const projectPath = await freshProject('empty-seal');
  // No entries have been logged; migrationLog.jsonl does not exist.
  await ConfigurationLogger.createVersion(projectPath, '1.0.1');
  // The versioned log file should also not exist (empty seal = no file).
  const paths = new ProjectPaths(projectPath);
  const versionedPath = join(
    paths.migrationLogFolder,
    'migrationLog_1.0.1.jsonl',
  );
  expect(await pathExists(versionedPath)).toBe(false);
});
```

Add `ProjectPaths` and `join` to imports if missing.

- [ ] **Step 2: Run test to verify it fails**

```bash
cd tools/data-handler && pnpm test test/utils/configuration-logger.test.ts -t "empty seal"
```

Expected: FAIL — throws `No current migration log exists to version`.

- [ ] **Step 3: Modify `createVersion()`**

Replace the early throw with a silent no-op:

```typescript
public static async createVersion(
  projectPath: string,
  version: string,
): Promise<string | null> {
  const paths = new ProjectPaths(projectPath);
  const currentLogPath = paths.configurationChangesLog;
  const versionedLogPath = join(
    paths.migrationLogFolder,
    `migrationLog_${version}.jsonl`,
  );

  if (!pathExists(currentLogPath)) {
    // Empty seal: no log file to rename; the version is sealed with no
    // breaking changes. Per the spec, replay against a missing log is
    // a no-op success.
    const logger = getChildLogger({ module: 'ConfigurationLogger' });
    logger.info(`Sealed empty migration log for version: ${version}`);
    return null;
  }

  await rename(currentLogPath, versionedLogPath);

  const logger = getChildLogger({ module: 'ConfigurationLogger' });
  logger.info(
    `Created migration to version: ${version} at ${versionedLogPath}`,
  );

  return versionedLogPath;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd tools/data-handler && pnpm test test/utils/configuration-logger.test.ts
```

Expected: PASS.

- [ ] **Step 5: Update callers that depend on the return value**

```bash
cd tools/data-handler && grep -rn "createVersion(" src/ test/
```

Find every caller; ensure none of them assume a non-null return. The `commands/version.ts` caller already gates on `hasBreakingChanges` so it never calls `createVersion` for empty logs today — but verify that gate either stays in place (defensive) or is removed (we want empty seals to be possible). For this plan, keep the gate (we are not yet adding the patch-bump UX); just verify nothing crashes when the gate is bypassed in tests.

- [ ] **Step 6: Commit**

```bash
git add tools/data-handler/src/utils/configuration-logger.ts \
        tools/data-handler/test/utils/configuration-logger.test.ts
git commit -m "feat: createVersion returns null on empty seal

Per the migration-system spec, an empty sealed log is encoded on disk as
the absence of migrationLog_<version>.jsonl. Replay against a missing
file is a no-op success."
```

---

### Task 3: Mutation engine types

**Files:**
- Create: `tools/data-handler/src/mutations/types.ts`

Pure type declarations. No runtime logic, no tests.

- [ ] **Step 1: Create the file**

```typescript
// tools/data-handler/src/mutations/types.ts

import type { Operation, UpdateOperations } from '../resources/resource-object.js';
import type { UpdateKey } from '../interfaces/resource-interfaces.js';
import type { ResourceName } from '../utils/resource-utils.js';

/** The four kinds of breaking change recorded in the migration log. */
export type MutationKind =
  | 'edit'         // sub-property add/change/rank/remove
  | 'delete'       // whole-resource delete
  | 'rename'       // whole-resource rename
  | 'project_rename';

/** Discriminated input describing the change a maintainer wants to make. */
export type MutationInput =
  | {
      kind: 'edit';
      target: ResourceName;
      updateKey: UpdateKey<string>;
      operation: Operation<unknown>;
    }
  | { kind: 'delete'; target: ResourceName }
  | { kind: 'rename'; target: ResourceName; newIdentifier: string }
  | { kind: 'project_rename'; newPrefix: string };

/** What the cascade would touch. Aggregate counts plus a human summary. */
export interface CascadePreview {
  affectedCardCount: number;
  affectedLinkCount: number;
  affectedCalculationCount: number;
  affectedHandlebarFileCount: number;
  dataLossExpected: boolean;
  summary: string;
}

/** Deterministic hash over input + current state of every artefact the cascade touches. */
export interface MutationFingerprint {
  digest: string;
}

/** Returned from plan(); safe to serialise across HTTP. */
export interface PreviewResult {
  input: MutationInput;
  isBreaking: boolean;
  preview: CascadePreview;
  fingerprint: MutationFingerprint;
}

/** Options accepted by apply(). */
export interface ApplyOptions {
  /**
   * Required when isBreaking and the preview shows cascade effects. In the
   * CLI's same-process flow the caller can compute the fingerprint inline.
   * The HTTP layer must round-trip it from the preview response.
   */
  fingerprint?: MutationFingerprint;
  /** Commit message used by runWithDefaultCommitMessage; optional. */
  commitMessage?: string;
}

/** Result of apply(). */
export interface ApplyResult {
  success: true;
}
```

- [ ] **Step 2: Run the type-checker**

```bash
cd tools/data-handler && pnpm build
```

Expected: build succeeds. No tests yet.

- [ ] **Step 3: Commit**

```bash
git add tools/data-handler/src/mutations/types.ts
git commit -m "feat: mutation engine shared types"
```

---

### Task 4: Handler interface

**Files:**
- Create: `tools/data-handler/src/mutations/handler.ts`

The contract every cascade handler implements. The dispatcher selects exactly one handler per `MutationInput`.

- [ ] **Step 1: Create the file**

```typescript
// tools/data-handler/src/mutations/handler.ts

import type { Project } from '../containers/project.js';
import type {
  CascadePreview,
  MutationInput,
} from './types.js';

export interface MutationContext {
  project: Project;
  input: MutationInput;
}

export interface Handler {
  /** True when this handler matches the input's (kind, target, key, operation) tuple. */
  matches(ctx: MutationContext): boolean;

  /** Whether matching inputs are classified as breaking changes. */
  readonly isBreaking: boolean;

  /** Compute the cascade preview. Does not mutate any state. */
  preview(ctx: MutationContext): Promise<CascadePreview>;

  /** Apply the resource-definition change and the cascade. */
  apply(ctx: MutationContext): Promise<void>;
}
```

- [ ] **Step 2: Build**

```bash
cd tools/data-handler && pnpm build
```

Expected: success.

- [ ] **Step 3: Commit**

```bash
git add tools/data-handler/src/mutations/handler.ts
git commit -m "feat: Handler interface for cascade implementations"
```

---

### Task 5: Default no-cascade handler

**Files:**
- Create: `tools/data-handler/src/mutations/handlers/default-no-cascade.ts`
- Test: `tools/data-handler/test/mutations/handlers/default-no-cascade.test.ts`

A catch-all handler for display-only edits (`displayName`, `description`, `category` changes; enum-value adds, etc.). It performs the resource-definition update through the existing `ResourceObject.update()` path and reports zero cascade effects.

- [ ] **Step 1: Write the failing test**

```typescript
// tools/data-handler/test/mutations/handlers/default-no-cascade.test.ts

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../../src/containers/project.js';
import { DefaultNoCascadeHandler } from '../../../src/mutations/handlers/default-no-cascade.js';
import { resourceName } from '../../../src/utils/resource-utils.js';
import { deleteDir } from '../../../src/utils/file-utils.js';

const testDir = join(import.meta.dirname, 'tmp-default-handler');

describe('DefaultNoCascadeHandler', () => {
  beforeAll(async () => {
    await mkdir(testDir, { recursive: true });
  });
  afterAll(async () => {
    await deleteDir(testDir);
  });

  it('reports zero affected items in preview', async () => {
    const project = await Project.openLocal(/* path to a minimal test project */);
    const handler = new DefaultNoCascadeHandler();
    const ctx = {
      project,
      input: {
        kind: 'edit' as const,
        target: resourceName('test/cardTypes/foo'),
        updateKey: { key: 'displayName' },
        operation: { name: 'change' as const, target: 'Old', to: 'New' },
      },
    };
    expect(handler.matches(ctx)).toBe(true);
    const preview = await handler.preview(ctx);
    expect(preview.affectedCardCount).toBe(0);
    expect(preview.affectedLinkCount).toBe(0);
    expect(preview.dataLossExpected).toBe(false);
  });

  it('is not breaking', () => {
    const handler = new DefaultNoCascadeHandler();
    expect(handler.isBreaking).toBe(false);
  });
});
```

Note: the project-setup boilerplate (`Project.openLocal` and fixture path) needs a minimal fixture. Use one of the existing test fixtures under `tools/data-handler/test/test-data/`; e.g. `test-data/decision-records` (verify name with `ls tools/data-handler/test/test-data/`).

- [ ] **Step 2: Run test to verify it fails**

```bash
cd tools/data-handler && pnpm test test/mutations/handlers/default-no-cascade.test.ts
```

Expected: FAIL — handler module not found.

- [ ] **Step 3: Implement the handler**

```typescript
// tools/data-handler/src/mutations/handlers/default-no-cascade.ts

import type { Handler, MutationContext } from '../handler.js';
import type { CascadePreview } from '../types.js';

export class DefaultNoCascadeHandler implements Handler {
  readonly isBreaking = false;

  matches(ctx: MutationContext): boolean {
    // Catch-all: dispatcher consults specific handlers first.
    return ctx.input.kind === 'edit';
  }

  async preview(_ctx: MutationContext): Promise<CascadePreview> {
    return {
      affectedCardCount: 0,
      affectedLinkCount: 0,
      affectedCalculationCount: 0,
      affectedHandlebarFileCount: 0,
      dataLossExpected: false,
      summary: '(no cascade effects)',
    };
  }

  async apply(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'edit') {
      throw new Error('DefaultNoCascadeHandler only supports edits');
    }
    const { target, updateKey, operation } = ctx.input;
    const type = ctx.project.resources.extractType(
      `${target.prefix}/${target.type}/${target.identifier}`,
    );
    const resource = ctx.project.resources.byType(
      `${target.prefix}/${target.type}/${target.identifier}`,
      type,
    );
    if (!resource) {
      throw new Error('Resource not found');
    }
    await resource.update(updateKey, operation);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd tools/data-handler && pnpm test test/mutations/handlers/default-no-cascade.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/data-handler/src/mutations/handlers/default-no-cascade.ts \
        tools/data-handler/test/mutations/handlers/default-no-cascade.test.ts
git commit -m "feat: DefaultNoCascadeHandler for display-only edits"
```

---

### Task 6: Dispatcher

**Files:**
- Create: `tools/data-handler/src/mutations/dispatcher.ts`
- Test: `tools/data-handler/test/mutations/dispatcher.test.ts`

A static registry plus `dispatch(ctx)` that returns the first matching handler. The order in the registry matters: specific handlers come before the default.

- [ ] **Step 1: Write the failing test**

```typescript
// tools/data-handler/test/mutations/dispatcher.test.ts

import { describe, it, expect } from 'vitest';
import { dispatch } from '../../src/mutations/dispatcher.js';
import { DefaultNoCascadeHandler } from '../../src/mutations/handlers/default-no-cascade.js';
import { resourceName } from '../../src/utils/resource-utils.js';

describe('dispatcher', () => {
  it('routes display-name change to DefaultNoCascadeHandler', () => {
    const ctx = {
      project: undefined as any, // dispatcher does not touch project
      input: {
        kind: 'edit' as const,
        target: resourceName('test/cardTypes/foo'),
        updateKey: { key: 'displayName' },
        operation: { name: 'change' as const, target: 'Old', to: 'New' },
      },
    };
    const handler = dispatch(ctx);
    expect(handler).toBeInstanceOf(DefaultNoCascadeHandler);
  });

  it('throws when no handler matches', () => {
    const ctx = {
      project: undefined as any,
      input: {
        kind: 'project_rename' as const,
        newPrefix: 'foo',
      },
    };
    expect(() => dispatch(ctx)).toThrow(/no.*handler/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd tools/data-handler && pnpm test test/mutations/dispatcher.test.ts
```

Expected: FAIL — dispatcher module not found.

- [ ] **Step 3: Implement the dispatcher**

```typescript
// tools/data-handler/src/mutations/dispatcher.ts

import type { Handler, MutationContext } from './handler.js';
import { DefaultNoCascadeHandler } from './handlers/default-no-cascade.js';

const HANDLERS: Handler[] = [
  // Specific handlers are inserted ahead of the default in later plans.
  new DefaultNoCascadeHandler(),
];

export function dispatch(ctx: MutationContext): Handler {
  for (const handler of HANDLERS) {
    if (handler.matches(ctx)) return handler;
  }
  throw new Error(
    `No mutation handler for input: ${JSON.stringify(ctx.input)}`,
  );
}

/** Test-only escape hatch for registering a handler ahead of the default. */
export function _registerHandlerForTest(handler: Handler): () => void {
  HANDLERS.unshift(handler);
  return () => {
    const idx = HANDLERS.indexOf(handler);
    if (idx >= 0) HANDLERS.splice(idx, 1);
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd tools/data-handler && pnpm test test/mutations/dispatcher.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/data-handler/src/mutations/dispatcher.ts \
        tools/data-handler/test/mutations/dispatcher.test.ts
git commit -m "feat: handler dispatcher with default fallback"
```

---

### Task 7: Fingerprint computation

**Files:**
- Create: `tools/data-handler/src/mutations/fingerprint.ts`
- Test: `tools/data-handler/test/mutations/fingerprint.test.ts`

Deterministic SHA-256 over (canonical-JSON of input) + (sorted (path, sha256(content)) list of every file the cascade would touch). The function takes the input and the cascade preview's set of affected items as inputs.

- [ ] **Step 1: Write the failing test**

```typescript
// tools/data-handler/test/mutations/fingerprint.test.ts

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { computeFingerprint } from '../../src/mutations/fingerprint.js';
import { deleteDir } from '../../src/utils/file-utils.js';
import { resourceName } from '../../src/utils/resource-utils.js';

const testDir = join(import.meta.dirname, 'tmp-fingerprint');

describe('computeFingerprint', () => {
  beforeAll(async () => {
    await mkdir(testDir, { recursive: true });
    await writeFile(join(testDir, 'a.json'), '{"x":1}');
    await writeFile(join(testDir, 'b.json'), '{"y":2}');
  });
  afterAll(async () => {
    await deleteDir(testDir);
  });

  const input = {
    kind: 'edit' as const,
    target: resourceName('test/cardTypes/foo'),
    updateKey: { key: 'displayName' },
    operation: { name: 'change' as const, target: 'A', to: 'B' },
  };

  it('produces the same digest for identical inputs and file state', async () => {
    const fp1 = await computeFingerprint(input, [
      join(testDir, 'a.json'),
      join(testDir, 'b.json'),
    ]);
    const fp2 = await computeFingerprint(input, [
      join(testDir, 'a.json'),
      join(testDir, 'b.json'),
    ]);
    expect(fp1.digest).toEqual(fp2.digest);
  });

  it('produces a different digest when a touched file changes', async () => {
    const before = await computeFingerprint(input, [join(testDir, 'a.json')]);
    await writeFile(join(testDir, 'a.json'), '{"x":2}');
    const after = await computeFingerprint(input, [join(testDir, 'a.json')]);
    expect(before.digest).not.toEqual(after.digest);
  });

  it('produces the same digest regardless of the file-list order', async () => {
    const fp1 = await computeFingerprint(input, [
      join(testDir, 'a.json'),
      join(testDir, 'b.json'),
    ]);
    const fp2 = await computeFingerprint(input, [
      join(testDir, 'b.json'),
      join(testDir, 'a.json'),
    ]);
    expect(fp1.digest).toEqual(fp2.digest);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd tools/data-handler && pnpm test test/mutations/fingerprint.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `computeFingerprint`**

```typescript
// tools/data-handler/src/mutations/fingerprint.ts

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import type { MutationFingerprint, MutationInput } from './types.js';

/**
 * Deterministic hash over the proposed mutation plus the contents of every
 * file the cascade would touch.
 *
 * The file list comes from the handler's preview implementation; passing it
 * separately keeps computeFingerprint pure (no project / no cache access).
 */
export async function computeFingerprint(
  input: MutationInput,
  affectedFilePaths: string[],
): Promise<MutationFingerprint> {
  const hash = createHash('sha256');
  hash.update(canonicalJson(input));

  // Sort to make the digest independent of file enumeration order.
  const sorted = [...affectedFilePaths].sort();
  for (const path of sorted) {
    const contentDigest = createHash('sha256');
    contentDigest.update(await readFile(path));
    hash.update(path);
    hash.update(contentDigest.digest());
  }

  return { digest: hash.digest('hex') };
}

/** Canonical JSON: object keys sorted recursively, no whitespace. */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  const entries = Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd tools/data-handler && pnpm test test/mutations/fingerprint.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/data-handler/src/mutations/fingerprint.ts \
        tools/data-handler/test/mutations/fingerprint.test.ts
git commit -m "feat: deterministic fingerprint over input and touched files"
```

---

### Task 8: `ResourceMutations.plan()` and `apply()`

**Files:**
- Create: `tools/data-handler/src/mutations/plan.ts`
- Test: `tools/data-handler/test/mutations/plan.test.ts`

The engine entry point. `plan()` returns a `PreviewResult` value (not a closure). `apply()` is a separate method on `ResourceMutations` that takes the same `MutationInput` plus optional fingerprint. This shape is the one the HTTP layer can serve directly.

- [ ] **Step 1: Write the failing test**

```typescript
// tools/data-handler/test/mutations/plan.test.ts

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../src/containers/project.js';
import { ResourceMutations } from '../../src/mutations/plan.js';
import { resourceName } from '../../src/utils/resource-utils.js';
import { deleteDir } from '../../src/utils/file-utils.js';

const testDir = join(import.meta.dirname, 'tmp-plan');

describe('ResourceMutations.plan + apply', () => {
  let project: Project;

  beforeAll(async () => {
    await mkdir(testDir, { recursive: true });
    project = await /* open a small test fixture */;
  });
  afterAll(async () => {
    await deleteDir(testDir);
  });

  it('plan() returns a PreviewResult for a display-only edit', async () => {
    const mutations = new ResourceMutations(project);
    const input = {
      kind: 'edit' as const,
      target: resourceName(`${project.projectPrefix}/cardTypes/some-card-type`),
      updateKey: { key: 'displayName' },
      operation: { name: 'change' as const, target: 'Old', to: 'New' },
    };
    const result = await mutations.plan(input);
    expect(result.isBreaking).toBe(false);
    expect(result.preview.affectedCardCount).toBe(0);
    expect(result.fingerprint.digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it('apply() succeeds for a non-cascading edit without fingerprint', async () => {
    const mutations = new ResourceMutations(project);
    const input = {
      kind: 'edit' as const,
      target: resourceName(`${project.projectPrefix}/cardTypes/some-card-type`),
      updateKey: { key: 'description' },
      operation: { name: 'change' as const, target: 'Old', to: 'New' },
    };
    await expect(mutations.apply(input)).resolves.toEqual({ success: true });
  });
});
```

Replace `/* open a small test fixture */` with the project-open pattern used in `test/command-edit.test.ts` (look it up; the data-handler test directory has a standard fixture-path helper).

- [ ] **Step 2: Run test to verify it fails**

```bash
cd tools/data-handler && pnpm test test/mutations/plan.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `ResourceMutations`**

```typescript
// tools/data-handler/src/mutations/plan.ts

import type { Project } from '../containers/project.js';
import { computeFingerprint } from './fingerprint.js';
import { dispatch } from './dispatcher.js';
import type { Handler, MutationContext } from './handler.js';
import type {
  ApplyOptions,
  ApplyResult,
  MutationInput,
  PreviewResult,
} from './types.js';
import { ConfigurationLogger } from '../utils/configuration-logger.js';

export class ResourceMutations {
  constructor(private project: Project) {}

  async plan(input: MutationInput): Promise<PreviewResult> {
    const ctx: MutationContext = { project: this.project, input };
    const handler = dispatch(ctx);
    const preview = await handler.preview(ctx);
    const affectedPaths = await this.affectedFilePathsFor(ctx, handler);
    const fingerprint = await computeFingerprint(input, affectedPaths);

    return {
      input,
      isBreaking: handler.isBreaking,
      preview,
      fingerprint,
    };
  }

  async apply(input: MutationInput, options: ApplyOptions = {}): Promise<ApplyResult> {
    const ctx: MutationContext = { project: this.project, input };
    const handler = dispatch(ctx);
    const preview = await handler.preview(ctx);
    const needsConfirm =
      handler.isBreaking &&
      (preview.affectedCardCount > 0 ||
        preview.affectedLinkCount > 0 ||
        preview.dataLossExpected);

    if (needsConfirm) {
      if (!options.fingerprint) {
        throw new Error('Mutation has cascade effects; fingerprint required');
      }
      const affectedPaths = await this.affectedFilePathsFor(ctx, handler);
      const current = await computeFingerprint(input, affectedPaths);
      if (current.digest !== options.fingerprint.digest) {
        throw new Error('Stale fingerprint; re-preview before retrying');
      }
    }

    await this.project.lock.write(async () => {
      await handler.apply(ctx);
      if (handler.isBreaking) {
        await this.recordLogEntry(input);
      }
    });
    return { success: true };
  }

  /** Defaults to "no files touched" for the default handler; real handlers override via a separate method (next plan). */
  private async affectedFilePathsFor(
    _ctx: MutationContext,
    _handler: Handler,
  ): Promise<string[]> {
    return [];
  }

  private async recordLogEntry(input: MutationInput): Promise<void> {
    if (input.kind === 'edit') {
      await ConfigurationLogger.log(this.project.basePath, {
        kind: 'resource_edit',
        target: `${input.target.prefix}/${input.target.type}/${input.target.identifier}`,
        payload: { operation: input.operation, key: input.updateKey.key },
      });
    } else if (input.kind === 'delete') {
      await ConfigurationLogger.log(this.project.basePath, {
        kind: 'resource_delete',
        target: `${input.target.prefix}/${input.target.type}/${input.target.identifier}`,
        payload: { type: input.target.type },
      });
    } else if (input.kind === 'rename') {
      await ConfigurationLogger.log(this.project.basePath, {
        kind: 'resource_rename',
        target: `${input.target.prefix}/${input.target.type}/${input.target.identifier}`,
        payload: { type: input.target.type, newName: input.newIdentifier },
      });
    }
    // project_rename is added in a later plan.
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd tools/data-handler && pnpm test test/mutations/plan.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/data-handler/src/mutations/plan.ts \
        tools/data-handler/test/mutations/plan.test.ts
git commit -m "feat: ResourceMutations.plan() and apply() entry points"
```

---

### Task 9: LinkType rename handler — write the failing test

**Files:**
- Create: `tools/data-handler/test/mutations/handlers/link-type-rename.test.ts`

The existing `LinkTypeResource.updateCardLinks` (in `tools/data-handler/src/resources/link-type-resource.ts:41-65`) walks cards that have the old link-type name in their `metadata.links` array and rewrites them. This handler reproduces that behaviour through the new engine. The cascade is small (~25 lines of card-metadata rewriting), making it the ideal first real handler.

- [ ] **Step 1: Write the failing test**

```typescript
// tools/data-handler/test/mutations/handlers/link-type-rename.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../../src/containers/project.js';
import { LinkTypeRenameHandler } from '../../../src/mutations/handlers/link-type-rename.js';
import { resourceName } from '../../../src/utils/resource-utils.js';
import { copyDir } from '../../../src/utils/file-utils.js';

// Reuse the existing decision-records fixture. Find its actual path with:
//   ls tools/data-handler/test/test-data/
// Adjust the FIXTURE_PATH constant below to match.
const FIXTURE_PATH = join(
  import.meta.dirname,
  '..',
  '..',
  'test-data',
  'decision-records',
);
const tmpDir = join(import.meta.dirname, 'tmp-link-type-rename');

describe('LinkTypeRenameHandler', () => {
  let project: Project;
  let projectPath: string;

  beforeEach(async () => {
    projectPath = join(tmpDir, `proj-${Date.now()}`);
    await mkdir(projectPath, { recursive: true });
    await copyDir(FIXTURE_PATH, projectPath);
    project = new Project(projectPath);
    await project.initialize();
  });
  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('matches a link-type rename input', () => {
    const handler = new LinkTypeRenameHandler();
    const ctx = {
      project,
      input: {
        kind: 'rename' as const,
        target: resourceName(`${project.projectPrefix}/linkTypes/causes`),
        newIdentifier: 'is-caused-by',
      },
    };
    expect(handler.matches(ctx)).toBe(true);
  });

  it('previewed counts include cards that reference the link type', async () => {
    const handler = new LinkTypeRenameHandler();
    const ctx = {
      project,
      input: {
        kind: 'rename' as const,
        target: resourceName(`${project.projectPrefix}/linkTypes/causes`),
        newIdentifier: 'is-caused-by',
      },
    };
    const preview = await handler.preview(ctx);
    expect(preview.affectedLinkCount).toBeGreaterThan(0);
    expect(preview.dataLossExpected).toBe(false);
  });

  it('applying rewrites every card that referenced the old link type', async () => {
    const handler = new LinkTypeRenameHandler();
    const ctx = {
      project,
      input: {
        kind: 'rename' as const,
        target: resourceName(`${project.projectPrefix}/linkTypes/causes`),
        newIdentifier: 'is-caused-by',
      },
    };
    await handler.apply(ctx);
    const cards = project.cards(undefined);
    const oldRef = `${project.projectPrefix}/linkTypes/causes`;
    const newRef = `${project.projectPrefix}/linkTypes/is-caused-by`;
    for (const card of cards) {
      for (const link of card.metadata?.links ?? []) {
        expect(link.linkType).not.toBe(oldRef);
        if (link.linkType.endsWith('/linkTypes/is-caused-by')) {
          expect(link.linkType).toBe(newRef);
        }
      }
    }
  });

  it('isBreaking is true', () => {
    const handler = new LinkTypeRenameHandler();
    expect(handler.isBreaking).toBe(true);
  });
});
```

Adjust `FIXTURE_PATH` to a real fixture by running `ls tools/data-handler/test/test-data/` and picking one whose `linkTypes/` folder includes a `causes` (or similar) link type used by at least one card. The fixture must already contain card metadata referencing the link type.

- [ ] **Step 2: Run test to verify it fails**

```bash
cd tools/data-handler && pnpm test test/mutations/handlers/link-type-rename.test.ts
```

Expected: FAIL — handler module not found.

- [ ] **Step 3: Commit the test (red phase)**

```bash
git add tools/data-handler/test/mutations/handlers/link-type-rename.test.ts
git commit -m "test: failing test for LinkTypeRenameHandler"
```

---

### Task 10: LinkType rename handler — implementation

**Files:**
- Create: `tools/data-handler/src/mutations/handlers/link-type-rename.ts`

Extract the card-rewriting logic from `LinkTypeResource.updateCardLinks` (currently at `tools/data-handler/src/resources/link-type-resource.ts:41-65`) into a handler that also performs the resource-level rename through `ResourceObject.rename()`.

- [ ] **Step 1: Read the existing implementation**

```bash
sed -n '30,90p' tools/data-handler/src/resources/link-type-resource.ts
```

Note: `updateCardLinks(from, to)` collects every card whose `metadata.links` contains an entry where `link.linkType === from` and rewrites each match. The handler must reproduce this.

- [ ] **Step 2: Implement the handler**

```typescript
// tools/data-handler/src/mutations/handlers/link-type-rename.ts

import type { Handler, MutationContext } from '../handler.js';
import type { CascadePreview } from '../types.js';
import { resourceNameToString } from '../../utils/resource-utils.js';
import type { Card } from '../../interfaces/project-interfaces.js';

export class LinkTypeRenameHandler implements Handler {
  readonly isBreaking = true;

  matches(ctx: MutationContext): boolean {
    return ctx.input.kind === 'rename' && ctx.input.target.type === 'linkTypes';
  }

  async preview(ctx: MutationContext): Promise<CascadePreview> {
    if (ctx.input.kind !== 'rename') {
      throw new Error('LinkTypeRenameHandler called with non-rename input');
    }
    const oldName = resourceNameToString(ctx.input.target);
    const affected = this.affectedCards(ctx, oldName);
    const affectedLinkCount = affected.reduce(
      (n, c) =>
        n +
        (c.metadata?.links?.filter((l) => l.linkType === oldName).length ?? 0),
      0,
    );
    return {
      affectedCardCount: affected.length,
      affectedLinkCount,
      affectedCalculationCount: 0,
      affectedHandlebarFileCount: 0,
      dataLossExpected: false,
      summary: `Renames ${affectedLinkCount} link references in ${affected.length} cards.`,
    };
  }

  async apply(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'rename') {
      throw new Error('LinkTypeRenameHandler called with non-rename input');
    }
    const oldName = resourceNameToString(ctx.input.target);
    const newName = `${ctx.input.target.prefix}/linkTypes/${ctx.input.newIdentifier}`;

    // 1. Rewrite card metadata references.
    const cards = this.affectedCards(ctx, oldName);
    for (const card of cards) {
      const metadata = card.metadata!;
      metadata.links = metadata.links!.map((l) =>
        l.linkType === oldName ? { ...l, linkType: newName } : l,
      );
      await ctx.project.updateCardMetadata(card, metadata);
    }

    // 2. Rename the resource itself via the existing ResourceObject API.
    const resource = ctx.project.resources.byType(oldName, 'linkTypes');
    if (!resource) {
      throw new Error(`Link type '${oldName}' not found`);
    }
    await resource.update({ key: 'name' }, {
      name: 'change',
      target: oldName,
      to: newName,
    });
  }

  private affectedCards(ctx: MutationContext, oldName: string): Card[] {
    const all = [
      ...ctx.project.cards(undefined),
      ...ctx.project.allTemplateCards(),
    ];
    return all.filter((c) =>
      c.metadata?.links?.some((l) => l.linkType === oldName),
    );
  }
}
```

- [ ] **Step 3: Register the handler in the dispatcher**

In `tools/data-handler/src/mutations/dispatcher.ts`, edit the `HANDLERS` array:

```typescript
import { LinkTypeRenameHandler } from './handlers/link-type-rename.js';

const HANDLERS: Handler[] = [
  new LinkTypeRenameHandler(),
  new DefaultNoCascadeHandler(),
];
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd tools/data-handler && pnpm test test/mutations/handlers/link-type-rename.test.ts
```

Expected: PASS for all four `it` blocks.

- [ ] **Step 5: Commit**

```bash
git add tools/data-handler/src/mutations/handlers/link-type-rename.ts \
        tools/data-handler/src/mutations/dispatcher.ts
git commit -m "feat: LinkTypeRenameHandler — first end-to-end cascade

Extracts updateCardLinks from LinkTypeResource into the new engine."
```

---

### Task 11: Plumb affected paths through `plan()` so fingerprints are real

**Files:**
- Modify: `tools/data-handler/src/mutations/handler.ts`
- Modify: `tools/data-handler/src/mutations/plan.ts`
- Modify: `tools/data-handler/src/mutations/handlers/default-no-cascade.ts`
- Modify: `tools/data-handler/src/mutations/handlers/link-type-rename.ts`
- Test: `tools/data-handler/test/mutations/handlers/link-type-rename.test.ts`

`plan()` currently passes an empty `affectedFilePathsFor` to `computeFingerprint`. To make fingerprints actually detect drift, handlers must expose the file list. Add `affectedFilePaths()` to the `Handler` interface.

- [ ] **Step 1: Write the failing test**

Append to `tools/data-handler/test/mutations/handlers/link-type-rename.test.ts`:

```typescript
it('reports the affected card file paths for fingerprinting', async () => {
  const handler = new LinkTypeRenameHandler();
  const ctx = {
    project,
    input: {
      kind: 'rename' as const,
      target: resourceName(`${project.projectPrefix}/linkTypes/causes`),
      newIdentifier: 'is-caused-by',
    },
  };
  const paths = await handler.affectedFilePaths(ctx);
  expect(paths.length).toBeGreaterThan(0);
  for (const p of paths) {
    expect(p).toMatch(/index\.json$/);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd tools/data-handler && pnpm test test/mutations/handlers/link-type-rename.test.ts -t "affected card file paths"
```

Expected: FAIL — `affectedFilePaths is not a function`.

- [ ] **Step 3: Extend the `Handler` interface**

```typescript
// tools/data-handler/src/mutations/handler.ts (additions)

export interface Handler {
  matches(ctx: MutationContext): boolean;
  readonly isBreaking: boolean;
  preview(ctx: MutationContext): Promise<CascadePreview>;
  apply(ctx: MutationContext): Promise<void>;
  /** Paths the cascade would read or write; fed into the fingerprint. */
  affectedFilePaths(ctx: MutationContext): Promise<string[]>;
}
```

- [ ] **Step 4: Implement `affectedFilePaths` on both handlers**

In `default-no-cascade.ts`:

```typescript
async affectedFilePaths(_ctx: MutationContext): Promise<string[]> {
  return [];
}
```

In `link-type-rename.ts`:

```typescript
async affectedFilePaths(ctx: MutationContext): Promise<string[]> {
  if (ctx.input.kind !== 'rename') return [];
  const oldName = resourceNameToString(ctx.input.target);
  return this.affectedCards(ctx, oldName).map((c) =>
    join(c.path, 'index.json'),
  );
}
```

Add `import { join } from 'node:path';` if missing.

- [ ] **Step 5: Wire `affectedFilePaths` through `ResourceMutations.plan/apply`**

In `tools/data-handler/src/mutations/plan.ts`, change `affectedFilePathsFor`:

```typescript
private async affectedFilePathsFor(
  ctx: MutationContext,
  handler: Handler,
): Promise<string[]> {
  return handler.affectedFilePaths(ctx);
}
```

- [ ] **Step 6: Run all mutation tests**

```bash
cd tools/data-handler && pnpm test test/mutations/
```

Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add tools/data-handler/src/mutations/handler.ts \
        tools/data-handler/src/mutations/plan.ts \
        tools/data-handler/src/mutations/handlers/default-no-cascade.ts \
        tools/data-handler/src/mutations/handlers/link-type-rename.ts \
        tools/data-handler/test/mutations/handlers/link-type-rename.test.ts
git commit -m "feat: handlers expose affectedFilePaths for fingerprinting"
```

---

### Task 12: Route link-type renames through `ResourceMutations` from `commands/update.ts`

**Files:**
- Modify: `tools/data-handler/src/commands/update.ts`
- Test: `tools/data-handler/test/command-update.test.ts`

When `commands/update.ts:applyResourceOperation` is called for a link-type with a name change (rename), delegate to `ResourceMutations` instead of calling `resource.update()` directly. Other resource types and other operations continue to use the existing path.

- [ ] **Step 1: Read the existing command implementation**

```bash
sed -n '46,60p' tools/data-handler/src/commands/update.ts
```

Note the existing dispatch lookup: `extractType(name)` → `byType(name, type)` → `resource?.update(updateKey, op)`. The new branch fires only when `type === 'linkTypes'` and `updateKey.key === 'name'` and `op.name === 'change'`.

- [ ] **Step 2: Write the failing test**

In `tools/data-handler/test/command-update.test.ts`, add (creating a new describe block if needed):

```typescript
it('routes link-type renames through the new mutation engine', async () => {
  // Set up a project with a link type and a card referencing it.
  // Use the same fixture pattern as the LinkTypeRenameHandler tests.
  // (Adapt from test/mutations/handlers/link-type-rename.test.ts.)
  const project = /* ... */;
  const update = new Update(project);

  const linkTypeName = `${project.projectPrefix}/linkTypes/causes`;
  await update.applyResourceOperation(
    linkTypeName,
    { key: 'name' },
    { name: 'change', target: linkTypeName, to: `${project.projectPrefix}/linkTypes/is-caused-by` },
  );

  // Confirm the rename happened and a log entry was written via the new engine.
  const logEntries = await ConfigurationLogger.entries(project.basePath);
  expect(logEntries.some((e) =>
    e.kind === 'resource_rename' && e.target === linkTypeName,
  )).toBe(true);
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd tools/data-handler && pnpm test test/command-update.test.ts -t "link-type renames through"
```

Expected: FAIL — the existing code path runs but doesn't write a `resource_rename` log entry through the new engine (it writes via the old `logResourceRename` call inside `ResourceObject.rename`, which we updated earlier — actually verify what fires).

- [ ] **Step 4: Modify `Update.applyResourceOperation`**

In `tools/data-handler/src/commands/update.ts`, change the body of `applyResourceOperation`:

```typescript
public async applyResourceOperation<
  Type,
  T extends UpdateOperations,
  K extends string,
>(name: string, updateKey: UpdateKey<K>, operation: OperationFor<Type, T>) {
  const isLinkTypeRename =
    updateKey.key === 'name' &&
    operation.name === 'change' &&
    this.project.resources.extractType(name) === 'linkTypes';

  if (isLinkTypeRename) {
    const { resourceName: parseResourceName } = await import(
      '../utils/resource-utils.js'
    );
    const { ResourceMutations } = await import('../mutations/plan.js');
    const target = parseResourceName(name);
    const newIdentifier = parseResourceName(
      (operation as { to: string }).to,
    ).identifier;
    const mutations = new ResourceMutations(this.project);
    const plan = await mutations.plan({
      kind: 'rename',
      target,
      newIdentifier,
    });
    await mutations.apply(
      { kind: 'rename', target, newIdentifier },
      { fingerprint: plan.fingerprint },
    );
    return;
  }

  const run = () =>
    this.project.lock.write(async () => {
      const type = this.project.resources.extractType(name);
      const resource = this.project.resources.byType(name, type);
      await resource?.update(updateKey, operation);
    });
  return runWithDefaultCommitMessage('Apply resource operation', run);
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd tools/data-handler && pnpm test test/command-update.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run the whole data-handler test suite**

```bash
cd tools/data-handler && pnpm test
```

Expected: all PASS. If a pre-existing test now fails because it expected the old code path, examine it and either update (if the new behaviour is correct) or refine the routing condition.

- [ ] **Step 7: Commit**

```bash
git add tools/data-handler/src/commands/update.ts \
        tools/data-handler/test/command-update.test.ts
git commit -m "feat: route link-type renames through ResourceMutations

First wiring of the new engine into an existing command. Other resource
types and other operations remain on the previous path; follow-on plans
add handlers and re-route them."
```

---

### Task 13: Remove `updateCardLinks` from `LinkTypeResource`

**Files:**
- Modify: `tools/data-handler/src/resources/link-type-resource.ts`

The cascade now lives in `LinkTypeRenameHandler`. The old method on the resource class is dead code.

- [ ] **Step 1: Identify dead methods**

```bash
grep -n "updateCardLinks\b" tools/data-handler/src/
```

Expected matches: definition in `link-type-resource.ts` and the call inside the same file's `rename()` path.

- [ ] **Step 2: Remove the method and its call site**

In `tools/data-handler/src/resources/link-type-resource.ts`, delete the `updateCardLinks` method and remove its call from inside `update()` (or `rename()` — match the exact location grep showed).

If the file's `update()` no longer needs to call `this.updateCardLinks`, the cascade is fully relocated. Keep the rest of the file unchanged (`update()` is still the entry point for non-rename operations).

- [ ] **Step 3: Run tests**

```bash
cd tools/data-handler && pnpm test
```

Expected: PASS. The link-type rename path now exclusively flows through `LinkTypeRenameHandler`; the existing resource-class path no longer attempts a redundant cascade.

- [ ] **Step 4: Commit**

```bash
git add tools/data-handler/src/resources/link-type-resource.ts
git commit -m "refactor: remove updateCardLinks from LinkTypeResource

Cascade now lives in mutations/handlers/link-type-rename.ts."
```

---

### Task 14: Final integration test — full plan/apply roundtrip

**Files:**
- Create: `tools/data-handler/test/mutations/integration.test.ts`

A single end-to-end test that exercises the whole path the consumer sees: `new ResourceMutations(project).plan(input)` returns a preview with a fingerprint, `apply(input, { fingerprint })` succeeds, and the migration log gains one entry.

- [ ] **Step 1: Write the test**

```typescript
// tools/data-handler/test/mutations/integration.test.ts

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../src/containers/project.js';
import { ResourceMutations } from '../../src/mutations/plan.js';
import { ConfigurationLogger } from '../../src/utils/configuration-logger.js';
import { resourceName } from '../../src/utils/resource-utils.js';
import { copyDir } from '../../src/utils/file-utils.js';

const FIXTURE_PATH = join(import.meta.dirname, '..', 'test-data', 'decision-records');
const tmpDir = join(import.meta.dirname, 'tmp-integration');

describe('mutation engine end-to-end', () => {
  let project: Project;
  let projectPath: string;

  beforeAll(async () => {
    projectPath = join(tmpDir, `proj-${Date.now()}`);
    await mkdir(projectPath, { recursive: true });
    await copyDir(FIXTURE_PATH, projectPath);
    project = new Project(projectPath);
    await project.initialize();
  });
  afterAll(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('plan → apply → log entry', async () => {
    const mutations = new ResourceMutations(project);
    const input = {
      kind: 'rename' as const,
      target: resourceName(`${project.projectPrefix}/linkTypes/causes`),
      newIdentifier: 'is-caused-by',
    };

    const plan = await mutations.plan(input);
    expect(plan.isBreaking).toBe(true);
    expect(plan.preview.affectedLinkCount).toBeGreaterThan(0);

    await mutations.apply(input, { fingerprint: plan.fingerprint });

    const entries = await ConfigurationLogger.entries(project.basePath);
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe('resource_rename');
    expect(entries[0].target).toBe(`${project.projectPrefix}/linkTypes/causes`);
  });

  it('refuses stale fingerprint after the project state changes', async () => {
    // Adjust fixture path / project setup for a second clean copy.
    const mutations = new ResourceMutations(project);
    const input = {
      kind: 'rename' as const,
      target: resourceName(`${project.projectPrefix}/linkTypes/causes`),
      newIdentifier: 'is-caused-by',
    };
    const plan = await mutations.plan(input);

    // Mutate one of the affected cards out-of-band.
    const cards = project.cards(undefined);
    if (cards.length > 0 && cards[0].metadata) {
      cards[0].metadata.title = `${cards[0].metadata.title} (changed)`;
      await project.updateCardMetadata(cards[0], cards[0].metadata);
    }

    await expect(
      mutations.apply(input, { fingerprint: plan.fingerprint }),
    ).rejects.toThrow(/stale/i);
  });
});
```

- [ ] **Step 2: Run the test**

```bash
cd tools/data-handler && pnpm test test/mutations/integration.test.ts
```

Expected: both PASS.

- [ ] **Step 3: Run the whole suite as a final check**

```bash
cd tools/data-handler && pnpm test
```

Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add tools/data-handler/test/mutations/integration.test.ts
git commit -m "test: end-to-end plan/apply integration for LinkType rename"
```

---

## Verification checklist after the plan executes

Run from the repo root:

```bash
pnpm --filter @cyberismo/data-handler test
pnpm --filter @cyberismo/data-handler build
pnpm --filter @cyberismo/data-handler lint
```

All three should succeed. The repo's overall test should also still pass:

```bash
pnpm test
```

If anything in `tools/cli`, `tools/backend`, `tools/app`, `tools/mcp` references the removed `ConfigurationOperation` enum or `logResourceModuleRemove`, fix those references the same way Task 1 fixed the data-handler call sites.

---

## What this plan delivers

After all tasks succeed:

- A working `ResourceMutations.plan() / apply()` API in `tools/data-handler/src/mutations/`.
- A dispatcher with two registered handlers (`DefaultNoCascadeHandler` + `LinkTypeRenameHandler`) and an extension point for the rest.
- Deterministic fingerprints over input + affected file content.
- A new `MigrationEntry` on-disk shape with a `kind` discriminator (resource_edit, resource_delete, resource_rename — project_rename added later).
- Empty-log seals work — `createVersion()` returns `null` instead of throwing.
- Link-type renames in the CLI/HTTP flow through the new engine and produce log entries through the new path.
- An integration test that proves the design end-to-end including stale-fingerprint detection.

## What's next

Follow-on plans (each is its own implementation plan):

- **Plan 2 (FieldType edit/delete handlers).** Largest cascade family. Extracts `dataTypeChanged`, `handleEnumValueReplacements`, enum-value-add/remove/rename handlers. ~150 lines move out of `field-type-resource.ts`.
- **Plan 3 (CardType edit/delete/workflow-change).** Handles `handleCustomFieldsChange`, `handleWorkflowChange`, `removeValueFromOtherArrays`, `verifyStateMapping`. ~250 lines.
- **Plan 4 (Workflow handlers).** `handleStateChange`, `handleStateRemoval`, `updateCardStates`, `updateCardTypes`. ~170 lines.
- **Plan 5 (Remaining delete handlers).** Per-type delete cascades for FieldType, CardType, Workflow, Template, Calculation, Report, GraphModel, GraphView.
- **Plan 6 (ProjectRename handler).** The project-wide prefix rewrite. Reuses the existing `commands/rename.ts` body.
- **Plan 7 (Module update flow).** `PreviewModuleUpdate`, `UpdateModule`, `ModuleStepReplay`, `appliedModules.json`, conflict detection (incl. `migration_path_unreachable`).
- **Plan 8 (HTTP routes).** `POST /mutations/preview`, `POST /mutations/apply`, `POST /modules/update/preview`, SSE for `POST /modules/update`.
- **Plan 9 (CLI integration).** `cyberismo delete`, `rename`, `project-rename` verbs; `cyberismo module update` with progress reporting.
- **Plan 10 (Patch-bump UX).** `cyberismo module bump` refuses patch bumps with non-empty log; suggests next version.

Each follow-on plan reuses the engine and dispatcher; they add handlers and routes through them.
