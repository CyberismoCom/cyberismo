# Migration System — Module Update Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the consumer-facing module-update flow per `migration-system.allium`: `cyberismo module bump <version>` enforces the patch-no-migrations rule; `cyberismo module update <module> <version>` atomically pulls files and replays the relevant migration logs against the consumer project. Conflict detection refuses divergent-branch updates. Applied-version state is recorded in `appliedModules.json`. After this plan, the system can deliver upgrades end-to-end with one atomic operation.

**Architecture:** New `mutations/module-update/` folder holds the replay engine (`replay.ts`), conflict detection (`conflicts.ts`), and applied-version tracking (`applied-modules.ts`). The existing `Import.updateModule()` becomes a thin wrapper: it still resolves and pulls files, but the replay step runs between `applyModules` and `cleanOrphans`. The patch-bump enforcement lives in `commands/version.ts`. The replay engine reuses the per-resource handlers built in Plans 1–5 by calling `ResourceMutations.apply()` for each log entry.

**Tech Stack:** TypeScript, Node 22, ESM with `.js` extensions, Vitest, `semver` (already imported by `tools/data-handler/src/modules/resolver.ts`), Hono (HTTP — out of scope; covered in Plan 7).

---

## Scope

**Prerequisites:**
- Plan 1 (foundation): `ResourceMutations.plan()/apply()`, dispatcher, `MigrationEntry` variants.
- Plans 2-5: all per-resource handlers registered in the dispatcher. Replay invokes them by `MigrationEntry.kind`.

**In scope (this plan):**
- `mutations/module-update/applied-modules.ts` — read/write `appliedModules.json` atomically.
- `mutations/module-update/conflicts.ts` — detect `migration_path_unreachable` and `local_reference_unrewritable`.
- `mutations/module-update/replay.ts` — walk a sealed log's entries; call `ResourceMutations.apply()` per entry; emit step success/failure.
- `mutations/module-update/types.ts` — `ResolvedUpdateStep`, `ReplayConflict`, `ReplayConflictKind`, `ModuleStepReplayResult`, `ModuleUpdateResult`.
- `mutations/module-update/plan.ts` — `ModuleUpdater` class with `previewUpdate()` and `applyUpdate()` analogous to `ResourceMutations`.
- `utils/configuration-logger.ts` additions: `previousSealedVersion()` helper, `isPatchBump()` helper.
- `commands/version.ts` — refuse patch bumps with non-empty log.
- `commands/import.ts` — integrate replay into `updateModule()` and `updateAllModules()`. Keep `applyModules` reused.
- `commands/module-update.ts` — new entry-point class delegating to `ModuleUpdater` for the CLI/HTTP layer (CLI binding included in this plan).
- `cli/src/index.ts` (or `tools/cli`) — add the `module update` and `module bump` subcommands' new behaviour.

**Out of scope:**
- HTTP routes (Plan 7).
- The patch-bump *version-suggestion* affordance ("did you mean 1.7.0?") — implement only the refusal; suggestions can come later.
- Full diverged-branch detection. This plan ships a *simple* version: a step is `migration_path_unreachable` when there is no monotonic version chain in the module's `available_versions` between `from_version` and `to_version` on the same major. Cross-major hotfix detection is deferred — flag in `@guarantee` and Open Questions but not implemented.

---

## File structure

**New files:**
- `tools/data-handler/src/mutations/module-update/types.ts`
- `tools/data-handler/src/mutations/module-update/applied-modules.ts`
- `tools/data-handler/src/mutations/module-update/conflicts.ts`
- `tools/data-handler/src/mutations/module-update/replay.ts`
- `tools/data-handler/src/mutations/module-update/plan.ts`
- `tools/data-handler/src/commands/module-update.ts`
- `tools/data-handler/test/mutations/module-update/applied-modules.test.ts`
- `tools/data-handler/test/mutations/module-update/conflicts.test.ts`
- `tools/data-handler/test/mutations/module-update/replay.test.ts`
- `tools/data-handler/test/mutations/module-update/integration.test.ts`
- `tools/data-handler/test/command-version.test.ts` (may exist; extend if so)

**Modified files:**
- `tools/data-handler/src/utils/configuration-logger.ts` — add `previousSealedVersion()`, `isPatchBump()`.
- `tools/data-handler/src/commands/version.ts` — patch-bump refusal.
- `tools/data-handler/src/commands/import.ts` — wire replay into update paths.
- `tools/cli/src/index.ts` — wire new CLI flow.

---

## Tasks

### Task 1: `previousSealedVersion` and `isPatchBump` helpers

**Files:**
- Modify: `tools/data-handler/src/utils/configuration-logger.ts`
- Test: `tools/data-handler/test/utils/configuration-logger.test.ts`

The patch-bump enforcement needs to compare the *new* version to the *previous sealed* version. Listing existing sealed logs is a filename scan over `paths.migrationLogFolder`.

- [ ] **Step 1: Write the failing test**

```typescript
it('previousSealedVersion returns the highest semver from existing sealed logs', async () => {
  const projectPath = await freshProject('prev-version');
  const folder = new ProjectPaths(projectPath).migrationLogFolder;
  // Seed three sealed logs of different versions.
  await writeFile(join(folder, 'migrationLog_1.0.0.jsonl'), '');
  await writeFile(join(folder, 'migrationLog_1.5.0.jsonl'), '');
  await writeFile(join(folder, 'migrationLog_1.2.0.jsonl'), '');
  expect(await ConfigurationLogger.previousSealedVersion(projectPath)).toBe('1.5.0');
});

it('previousSealedVersion returns null when no sealed logs exist', async () => {
  const projectPath = await freshProject('no-version');
  expect(await ConfigurationLogger.previousSealedVersion(projectPath)).toBeNull();
});

it('isPatchBump correctly identifies semver patch increments', () => {
  expect(ConfigurationLogger.isPatchBump(null, '1.0.0')).toBe(false);
  expect(ConfigurationLogger.isPatchBump('1.0.0', '1.0.1')).toBe(true);
  expect(ConfigurationLogger.isPatchBump('1.0.0', '1.1.0')).toBe(false);
  expect(ConfigurationLogger.isPatchBump('1.0.0', '2.0.0')).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd tools/data-handler && pnpm test test/utils/configuration-logger.test.ts -t "previousSealedVersion\|isPatchBump"
```

Expected: FAIL — methods do not exist.

- [ ] **Step 3: Implement the helpers**

Add to `tools/data-handler/src/utils/configuration-logger.ts`:

```typescript
import { readdir } from 'node:fs/promises';
import semver from 'semver';

// inside the ConfigurationLogger class:

public static async previousSealedVersion(
  projectPath: string,
): Promise<string | null> {
  const folder = new ProjectPaths(projectPath).migrationLogFolder;
  let files: string[];
  try {
    files = await readdir(folder);
  } catch {
    return null;
  }
  const versions = files
    .map((f) => /^migrationLog_(.+)\.jsonl$/.exec(f)?.[1])
    .filter((v): v is string => !!v && semver.valid(v) !== null);
  if (versions.length === 0) return null;
  return versions.sort(semver.compare).at(-1) ?? null;
}

public static isPatchBump(
  previousVersion: string | null,
  newVersion: string,
): boolean {
  if (!previousVersion) return false;
  if (!semver.valid(previousVersion) || !semver.valid(newVersion)) return false;
  return semver.diff(previousVersion, newVersion) === 'patch';
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd tools/data-handler && pnpm test test/utils/configuration-logger.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/data-handler/src/utils/configuration-logger.ts \
        tools/data-handler/test/utils/configuration-logger.test.ts
git commit -m "feat: previousSealedVersion and isPatchBump helpers"
```

---

### Task 2: Refuse patch bumps with breaking entries

**Files:**
- Modify: `tools/data-handler/src/commands/version.ts`
- Test: `tools/data-handler/test/command-version.test.ts` (extend existing or create new)

The spec promotes the no-breaking-in-patches rule from guidance to enforcement at the `SealCurrentLog` (i.e., `BumpVersion`) trigger. In code, that's `commands/version.ts` calling `createVersion` after checking the log.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../src/containers/project.js';
import { Version } from '../src/commands/version.js';
import { ConfigurationLogger } from '../src/utils/configuration-logger.js';
import { copyDir } from '../src/utils/file-utils.js';

const FIXTURE_PATH = join(import.meta.dirname, 'test-data', 'decision-records');
const tmpDir = join(import.meta.dirname, 'tmp-version-bump');

describe('Version.bump refuses patch with breaking entries', () => {
  let project: Project;
  let projectPath: string;

  beforeAll(async () => {
    projectPath = join(tmpDir, `proj-${Date.now()}`);
    await mkdir(projectPath, { recursive: true });
    await copyDir(FIXTURE_PATH, projectPath);
    project = new Project(projectPath);
    await project.initialize();
    // Plant a previous sealed version to compare against.
    await mkdir(
      new ProjectPaths(projectPath).migrationLogFolder,
      { recursive: true },
    );
    await writeFile(
      join(new ProjectPaths(projectPath).migrationLogFolder, 'migrationLog_1.0.0.jsonl'),
      '',
    );
    // Log a breaking entry in the current log.
    await ConfigurationLogger.log(projectPath, {
      kind: 'resource_edit',
      target: 'test/cardTypes/foo',
      payload: { key: 'name', operation: { name: 'change', target: 'foo', to: 'bar' } },
    });
  });

  afterAll(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('refuses 1.0.1 (patch) when current log has breaking entries', async () => {
    const version = new Version(project);
    await expect(version.bump('1.0.1')).rejects.toThrow(/patch.*breaking/i);
  });

  it('accepts 1.1.0 (minor) with breaking entries', async () => {
    const version = new Version(project);
    await expect(version.bump('1.1.0')).resolves.not.toThrow();
  });
});
```

(Adjust imports for `ProjectPaths` and `writeFile` if needed.)

- [ ] **Step 2: Run test to verify it fails**

```bash
cd tools/data-handler && pnpm test test/command-version.test.ts
```

Expected: FAIL — first test passes only because `Version.bump` currently doesn't check semver kind.

- [ ] **Step 3: Implement the refusal in `Version.bump`**

In `tools/data-handler/src/commands/version.ts`, find the `bump` method (look for the call to `ConfigurationLogger.createVersion`). Add a precondition:

```typescript
// Inside bump(version: string):
const previous = await ConfigurationLogger.previousSealedVersion(this.project.basePath);
if (ConfigurationLogger.isPatchBump(previous, version)) {
  const entries = await ConfigurationLogger.entries(this.project.basePath);
  if (entries.length > 0) {
    throw new Error(
      `Cannot bump as a patch (${previous} → ${version}): current log has ${entries.length} breaking entries. Bump as a minor instead.`,
    );
  }
}
// ...then existing createVersion call.
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd tools/data-handler && pnpm test test/command-version.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/data-handler/src/commands/version.ts \
        tools/data-handler/test/command-version.test.ts
git commit -m "feat: refuse patch bumps with breaking entries

Per the migration-system spec, patches must not carry migrations.
This enforces it at the BumpVersion entry point; the rest of the
discipline (suggesting next version) is CLI affordance."
```

---

### Task 3: `appliedModules.json` schema and reader/writer

**Files:**
- Create: `tools/data-handler/src/mutations/module-update/applied-modules.ts`
- Test: `tools/data-handler/test/mutations/module-update/applied-modules.test.ts`

A small JSON file at `.cards/local/appliedModules.json` records the applied version per imported module. Written atomically (write-temp, rename); read on demand.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdir, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  readAppliedModules,
  writeAppliedModules,
  recordModuleApplied,
} from '../../../src/mutations/module-update/applied-modules.js';

const testDir = join(import.meta.dirname, 'tmp-applied-modules');

describe('appliedModules.json', () => {
  let projectPath: string;

  beforeAll(async () => {
    projectPath = join(testDir, `proj-${Date.now()}`);
    await mkdir(join(projectPath, '.cards', 'local'), { recursive: true });
  });
  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('readAppliedModules returns empty array when file absent', async () => {
    expect(await readAppliedModules(projectPath)).toEqual([]);
  });

  it('writes and reads round-trip', async () => {
    await writeAppliedModules(projectPath, [
      { prefix: 'shared/security', installedVersion: '1.5.0', appliedVersion: '1.5.0' },
    ]);
    const result = await readAppliedModules(projectPath);
    expect(result).toHaveLength(1);
    expect(result[0].prefix).toBe('shared/security');
  });

  it('recordModuleApplied updates an existing entry', async () => {
    await writeAppliedModules(projectPath, [
      { prefix: 'shared/security', installedVersion: '1.5.0', appliedVersion: '1.5.0' },
    ]);
    await recordModuleApplied(projectPath, 'shared/security', '1.6.0');
    const result = await readAppliedModules(projectPath);
    expect(result[0].installedVersion).toBe('1.6.0');
    expect(result[0].appliedVersion).toBe('1.6.0');
  });

  it('recordModuleApplied adds a new entry when not present', async () => {
    await writeAppliedModules(projectPath, []);
    await recordModuleApplied(projectPath, 'shared/crypto', '1.0.0');
    const result = await readAppliedModules(projectPath);
    expect(result.find((m) => m.prefix === 'shared/crypto')).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd tools/data-handler && pnpm test test/mutations/module-update/applied-modules.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// tools/data-handler/src/mutations/module-update/applied-modules.ts

import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';

import { pathExists } from '../../utils/file-utils.js';

export interface AppliedModule {
  prefix: string;
  installedVersion: string;
  appliedVersion: string;
}

function filePath(projectPath: string): string {
  return join(projectPath, '.cards', 'local', 'appliedModules.json');
}

export async function readAppliedModules(
  projectPath: string,
): Promise<AppliedModule[]> {
  const path = filePath(projectPath);
  if (!pathExists(path)) return [];
  const content = await readFile(path, 'utf-8');
  try {
    const parsed = JSON.parse(content);
    return Array.isArray(parsed.modules) ? parsed.modules : [];
  } catch {
    return [];
  }
}

export async function writeAppliedModules(
  projectPath: string,
  modules: AppliedModule[],
): Promise<void> {
  const path = filePath(projectPath);
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify({ modules }, null, 2) + '\n');
  await rename(tmp, path);
}

export async function recordModuleApplied(
  projectPath: string,
  prefix: string,
  version: string,
): Promise<void> {
  const modules = await readAppliedModules(projectPath);
  const existing = modules.findIndex((m) => m.prefix === prefix);
  if (existing >= 0) {
    modules[existing] = {
      prefix,
      installedVersion: version,
      appliedVersion: version,
    };
  } else {
    modules.push({ prefix, installedVersion: version, appliedVersion: version });
  }
  await writeAppliedModules(projectPath, modules);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd tools/data-handler && pnpm test test/mutations/module-update/applied-modules.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/data-handler/src/mutations/module-update/applied-modules.ts \
        tools/data-handler/test/mutations/module-update/applied-modules.test.ts
git commit -m "feat: appliedModules.json reader/writer

Tracks per-project (installed_version, applied_version) for every
imported module. Atomic writes via tempfile rename."
```

---

### Task 4: Update-flow types

**Files:**
- Create: `tools/data-handler/src/mutations/module-update/types.ts`

Pure types. Mirror the spec's `ResolvedUpdateStep`, `ReplayConflict`, etc.

- [ ] **Step 1: Create the file**

```typescript
// tools/data-handler/src/mutations/module-update/types.ts

export type ReplayConflictKind =
  | 'local_reference_unrewritable'
  | 'migration_path_unreachable'
  | 'other';

export interface ReplayConflict {
  kind: ReplayConflictKind;
  affected: string;       // resource name or file path
  location: string;       // where the conflict surfaced
  description: string;
  /** When the conflict can be resolved by moving to a different target. */
  suggestedTargetVersion?: string;
  /** When the consumer should traverse an explicit chain to reach the target. */
  suggestedIntermediateVersions: string[];
}

export interface ResolvedUpdateStep {
  order: number;
  modulePrefix: string;
  fromVersion: string | null;     // null = bootstrap (new transitive dep)
  toVersion: string;
  /** Versions strictly between fromVersion and toVersion (inclusive of toVersion) that have sealed log files. */
  logChain: string[];
  crossesMajorBoundary: boolean;
}

export interface ModuleUpdatePreview {
  steps: ResolvedUpdateStep[];
  conflicts: ReplayConflict[];
  /** Summary across all steps. */
  totalEntryCount: number;
  affectedCardCount: number;
  dataLossExpected: boolean;
}

export interface StepReplayResult {
  modulePrefix: string;
  fromVersion: string | null;
  toVersion: string;
  status: 'succeeded' | 'failed';
  failedAtSequence?: number;
  failureSummary?: string;
}

export interface ModuleUpdateResult {
  status: 'succeeded' | 'failed';
  steps: StepReplayResult[];
  failedAtStep?: number;
  failureSummary?: string;
}
```

- [ ] **Step 2: Build**

```bash
cd tools/data-handler && pnpm build
```

Expected: success.

- [ ] **Step 3: Commit**

```bash
git add tools/data-handler/src/mutations/module-update/types.ts
git commit -m "feat: module-update flow shared types"
```

---

### Task 5: Conflict detection — `migration_path_unreachable`

**Files:**
- Create: `tools/data-handler/src/mutations/module-update/conflicts.ts`
- Test: `tools/data-handler/test/mutations/module-update/conflicts.test.ts`

For v1, the conflict detector implements only the simple cross-major refusal: if `from_version` and `to_version` differ in major *and* there is at least one sealed log file between them whose major does not lie on the linear path, refuse. Cross-major hotfix DAG analysis is deferred.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import {
  detectMigrationPathConflicts,
} from '../../../src/mutations/module-update/conflicts.js';

describe('detectMigrationPathConflicts', () => {
  it('no conflict for linear minor chain', () => {
    const conflicts = detectMigrationPathConflicts({
      modulePrefix: 'shared/security',
      fromVersion: '1.5.0',
      toVersion: '1.7.0',
      availableSealedVersions: ['1.0.0', '1.5.0', '1.6.0', '1.7.0'],
    });
    expect(conflicts).toEqual([]);
  });

  it('no conflict for major upgrade with linear chain', () => {
    const conflicts = detectMigrationPathConflicts({
      modulePrefix: 'shared/security',
      fromVersion: '1.5.0',
      toVersion: '2.0.0',
      availableSealedVersions: ['1.5.0', '1.6.0', '2.0.0'],
    });
    expect(conflicts).toEqual([]);
  });

  it('flags migration_path_unreachable for diverged minor on old major', () => {
    // The 1.6.0 was sealed AFTER 2.0.0 — sibling branches.
    // Heuristic: from 1.6.0 to 2.0.0 is impossible because the chain
    // contains 1.6.0 itself, which 2.0.0's release wasn't built against.
    const conflicts = detectMigrationPathConflicts({
      modulePrefix: 'shared/security',
      fromVersion: '1.6.0',
      toVersion: '2.0.0',
      availableSealedVersions: ['1.5.0', '1.6.0', '2.0.0'],
    });
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].kind).toBe('migration_path_unreachable');
    expect(conflicts[0].suggestedTargetVersion).toBe('1.5.0');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd tools/data-handler && pnpm test test/mutations/module-update/conflicts.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// tools/data-handler/src/mutations/module-update/conflicts.ts

import semver from 'semver';
import type { ReplayConflict } from './types.js';

export interface ConflictDetectionInput {
  modulePrefix: string;
  fromVersion: string | null;
  toVersion: string;
  /** All sealed log versions known for this module, in any order. */
  availableSealedVersions: string[];
}

/**
 * v1 heuristic for diverged-branch detection.
 *
 * A diverged branch shows up as: from_version is on major X, to_version is on
 * major Y (Y > X), AND there is a sealed log with version > from_version on
 * major X (a minor or patch released *after* the major bump). That extra
 * sealed log means from_version's branch advanced past the major bump's
 * common ancestor, and there's no linear chain.
 */
export function detectMigrationPathConflicts(
  input: ConflictDetectionInput,
): ReplayConflict[] {
  const { modulePrefix, fromVersion, toVersion, availableSealedVersions } = input;
  if (!fromVersion) return []; // Bootstrap — no chain needed.

  const fromMajor = semver.major(fromVersion);
  const toMajor = semver.major(toVersion);

  // Same-major chain: no conflict (linear).
  if (fromMajor === toMajor) return [];

  // Cross-major: look for sealed logs on the from-major branch with version > fromVersion.
  // Their existence means the from-branch diverged.
  const divergentVersions = availableSealedVersions.filter(
    (v) =>
      semver.valid(v) !== null &&
      semver.major(v) === fromMajor &&
      semver.gt(v, fromVersion),
  );

  if (divergentVersions.length === 0) return [];

  // Suggested target: the closest common ancestor — the largest version on
  // fromMajor that is <= fromVersion. Often == fromVersion's previous patch
  // base; but if fromVersion is already the highest on its major, the
  // suggestion is to roll back further.
  const suggestion = availableSealedVersions
    .filter(
      (v) =>
        semver.valid(v) !== null &&
        semver.major(v) === fromMajor &&
        semver.lte(v, fromVersion),
    )
    .sort(semver.compare)
    .at(-1);

  return [
    {
      kind: 'migration_path_unreachable',
      affected: modulePrefix,
      location: `${fromVersion} → ${toVersion}`,
      description: `Cannot update ${modulePrefix} from ${fromVersion} to ${toVersion}: ` +
        `version ${fromVersion} is on a branch that diverged from the path to ${toVersion}. ` +
        `Move to ${suggestion ?? '(an earlier version)'} first, or pick a newer ${toMajor}.x.`,
      suggestedTargetVersion: suggestion,
      suggestedIntermediateVersions: [],
    },
  ];
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd tools/data-handler && pnpm test test/mutations/module-update/conflicts.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/data-handler/src/mutations/module-update/conflicts.ts \
        tools/data-handler/test/mutations/module-update/conflicts.test.ts
git commit -m "feat: detect migration_path_unreachable for diverged branches

v1 heuristic. Detects the case where from_version's major-branch has
sealed logs released after the cross-major target. Cross-major hotfix
DAG analysis is deferred (see migration-system.allium open questions)."
```

---

### Task 6: Replay engine — apply one log entry through the existing handler dispatcher

**Files:**
- Create: `tools/data-handler/src/mutations/module-update/replay.ts`
- Test: `tools/data-handler/test/mutations/module-update/replay.test.ts`

Walk a sealed log's entries. For each entry, build a `MutationInput` from the entry's `kind` and `payload`, and call `ResourceMutations.apply()` with `fingerprint: undefined` (replay does not fingerprint — the consumer's state may legitimately differ from the author's). Emit success or capture the first failure.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../../src/containers/project.js';
import { replayLog } from '../../../src/mutations/module-update/replay.js';
import { copyDir } from '../../../src/utils/file-utils.js';

const FIXTURE_PATH = join(import.meta.dirname, '..', '..', 'test-data', 'decision-records');
const tmpDir = join(import.meta.dirname, 'tmp-replay');

describe('replayLog', () => {
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

  it('applies a single resource_rename entry', async () => {
    // Build a synthetic sealed-log file with one rename entry.
    const logPath = join(
      projectPath, '.cards', 'local', 'migrationLog', 'migrationLog_1.6.0.jsonl',
    );
    await mkdir(join(projectPath, '.cards', 'local', 'migrationLog'), { recursive: true });
    await writeFile(
      logPath,
      JSON.stringify({
        timestamp: new Date().toISOString(),
        kind: 'resource_rename',
        target: `${project.projectPrefix}/linkTypes/causes`,
        payload: { type: 'linkTypes', newName: `${project.projectPrefix}/linkTypes/is-caused-by` },
      }) + '\n',
    );

    const result = await replayLog(project, logPath);
    expect(result.status).toBe('succeeded');

    // Verify the resource was renamed (file should exist under new name).
    const newPath = join(
      projectPath, '.cards', 'local', 'linkTypes', 'is-caused-by.json',
    );
    const fs = await import('node:fs/promises');
    await expect(fs.stat(newPath)).resolves.not.toThrow();
  });

  it('returns failure on dispatcher error', async () => {
    const logPath = join(
      projectPath, '.cards', 'local', 'migrationLog', 'migrationLog_99.0.0.jsonl',
    );
    await mkdir(join(projectPath, '.cards', 'local', 'migrationLog'), { recursive: true });
    await writeFile(
      logPath,
      JSON.stringify({
        timestamp: new Date().toISOString(),
        kind: 'resource_rename',
        target: `${project.projectPrefix}/linkTypes/does-not-exist`,
        payload: { type: 'linkTypes', newName: 'foo' },
      }) + '\n',
    );

    const result = await replayLog(project, logPath);
    expect(result.status).toBe('failed');
    expect(result.failureSummary).toMatch(/does-not-exist|not found/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd tools/data-handler && pnpm test test/mutations/module-update/replay.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// tools/data-handler/src/mutations/module-update/replay.ts

import { readFile } from 'node:fs/promises';

import type { Project } from '../../containers/project.js';
import { ResourceMutations } from '../plan.js';
import type { MutationInput } from '../types.js';
import { resourceName } from '../../utils/resource-utils.js';
import type {
  ConfigurationLogEntry,
} from '../../utils/configuration-logger.js';
import type { StepReplayResult } from './types.js';

export async function replayLog(
  project: Project,
  logPath: string,
): Promise<StepReplayResult> {
  const content = await readFile(logPath, 'utf-8');
  const lines = content.split('\n').filter((l) => l.trim());

  const mutations = new ResourceMutations(project);
  let sequence = 0;

  for (const line of lines) {
    sequence += 1;
    let entry: ConfigurationLogEntry;
    try {
      entry = JSON.parse(line);
    } catch (err) {
      return {
        modulePrefix: '',
        fromVersion: null,
        toVersion: '',
        status: 'failed',
        failedAtSequence: sequence,
        failureSummary: `Malformed log entry at line ${sequence}: ${(err as Error).message}`,
      };
    }

    const input = entryToMutationInput(entry);
    try {
      // No fingerprint: replay is unconditional; consumer's state may differ
      // from the author's, and the cascade is tolerant by design.
      await mutations.apply(input);
    } catch (err) {
      return {
        modulePrefix: '',
        fromVersion: null,
        toVersion: '',
        status: 'failed',
        failedAtSequence: sequence,
        failureSummary: (err as Error).message,
      };
    }
  }

  return {
    modulePrefix: '',
    fromVersion: null,
    toVersion: '',
    status: 'succeeded',
  };
}

function entryToMutationInput(entry: ConfigurationLogEntry): MutationInput {
  switch (entry.kind) {
    case 'resource_edit': {
      const payload = entry.payload as { key: string; operation: unknown };
      return {
        kind: 'edit',
        target: resourceName(entry.target),
        updateKey: { key: payload.key },
        operation: payload.operation as never,
      };
    }
    case 'resource_delete':
      return { kind: 'delete', target: resourceName(entry.target) };
    case 'resource_rename': {
      const payload = entry.payload as { newName: string };
      const newName = resourceName(payload.newName);
      return {
        kind: 'rename',
        target: resourceName(entry.target),
        newIdentifier: newName.identifier,
      };
    }
    case 'project_rename': {
      // Added by Plan 5 (remaining-handlers).
      const payload = entry.payload as { newPrefix: string };
      return { kind: 'project_rename', newPrefix: payload.newPrefix };
    }
    default:
      throw new Error(`Unknown migration entry kind: ${entry.kind}`);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd tools/data-handler && pnpm test test/mutations/module-update/replay.test.ts
```

Expected: PASS for the happy path. The "dispatcher error" test depends on Plan 5's `ResourceRenameHandler` returning a meaningful error for missing resources — if Plan 5 isn't yet implemented, this test may need adjustment.

- [ ] **Step 5: Commit**

```bash
git add tools/data-handler/src/mutations/module-update/replay.ts \
        tools/data-handler/test/mutations/module-update/replay.test.ts
git commit -m "feat: replayLog walks a sealed log via the handler dispatcher"
```

---

### Task 7: `ModuleUpdater` — preview entry point

**Files:**
- Create: `tools/data-handler/src/mutations/module-update/plan.ts`
- Test: `tools/data-handler/test/mutations/module-update/integration.test.ts`

`ModuleUpdater.previewUpdate(rootModulePrefix, rootToVersion)` resolves the dependency plan (using the existing `resolveModules`), computes the log chain per step, and returns a `ModuleUpdatePreview` including any conflicts.

- [ ] **Step 1: Write the failing test (preview path)**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../../src/containers/project.js';
import { ModuleUpdater } from '../../../src/mutations/module-update/plan.js';
import { copyDir } from '../../../src/utils/file-utils.js';

const FIXTURE_PATH = join(import.meta.dirname, '..', '..', 'test-data', 'module-import-fixture');
const tmpDir = join(import.meta.dirname, 'tmp-updater');

describe('ModuleUpdater.previewUpdate', () => {
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

  it('returns an empty preview when the module is up to date', async () => {
    // Fixture: appliedModules.json records shared/foo at 1.0.0; module's tag is 1.0.0.
    const updater = new ModuleUpdater(project);
    const preview = await updater.previewUpdate('shared/foo', '1.0.0');
    expect(preview.steps).toHaveLength(0);
    expect(preview.conflicts).toHaveLength(0);
  });

  it('returns steps with logChain populated for a real upgrade', async () => {
    const updater = new ModuleUpdater(project);
    const preview = await updater.previewUpdate('shared/foo', '1.2.0');
    expect(preview.steps.length).toBeGreaterThan(0);
    expect(preview.steps[0].modulePrefix).toBe('shared/foo');
    expect(preview.steps[0].toVersion).toBe('1.2.0');
  });
});
```

(Adjust `FIXTURE_PATH` to a real fixture with `module-import` data; check `tools/data-handler/test/test-data/`. If none has the right shape, this task's tests may need a minimal new fixture added — note that as a sub-step.)

- [ ] **Step 2: Run test to verify it fails**

```bash
cd tools/data-handler && pnpm test test/mutations/module-update/integration.test.ts
```

Expected: FAIL — `ModuleUpdater` does not exist.

- [ ] **Step 3: Implement `ModuleUpdater.previewUpdate`**

```typescript
// tools/data-handler/src/mutations/module-update/plan.ts

import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import semver from 'semver';

import type { Project } from '../../containers/project.js';
import { resolveModules } from '../../modules/resolver.js';
import { readAppliedModules } from './applied-modules.js';
import { detectMigrationPathConflicts } from './conflicts.js';
import type {
  ModuleUpdatePreview,
  ResolvedUpdateStep,
} from './types.js';

export class ModuleUpdater {
  constructor(private project: Project) {}

  async previewUpdate(
    rootModulePrefix: string,
    rootToVersion: string,
  ): Promise<ModuleUpdatePreview> {
    const applied = await readAppliedModules(this.project.basePath);
    const appliedMap = new Map(applied.map((m) => [m.prefix, m.appliedVersion]));

    // Resolve the full dependency plan at the target version.
    const resolved = await resolveModules(this.project, {
      overrides: { [rootModulePrefix]: rootToVersion },
    });

    const steps: ResolvedUpdateStep[] = [];
    let order = 1;
    for (const r of resolved) {
      const fromVersion = appliedMap.get(r.prefix) ?? null;
      // No-op step: already at target.
      if (fromVersion === r.version) continue;

      const chain = await this.logChainFor(r.prefix, fromVersion, r.version);
      const crosses =
        fromVersion !== null &&
        semver.major(fromVersion) !== semver.major(r.version);

      steps.push({
        order: order++,
        modulePrefix: r.prefix,
        fromVersion,
        toVersion: r.version,
        logChain: chain,
        crossesMajorBoundary: crosses,
      });
    }

    // Detect conflicts per step.
    const conflicts = [];
    for (const step of steps) {
      const availableSealed = await this.availableSealedVersions(step.modulePrefix);
      conflicts.push(
        ...detectMigrationPathConflicts({
          modulePrefix: step.modulePrefix,
          fromVersion: step.fromVersion,
          toVersion: step.toVersion,
          availableSealedVersions: availableSealed,
        }),
      );
    }

    return {
      steps,
      conflicts,
      totalEntryCount: 0,        // populated in a later refinement
      affectedCardCount: 0,       // ditto
      dataLossExpected: false,    // ditto
    };
  }

  private async logChainFor(
    modulePrefix: string,
    fromVersion: string | null,
    toVersion: string,
  ): Promise<string[]> {
    const all = await this.availableSealedVersions(modulePrefix);
    const lower = fromVersion ?? '0.0.0';
    return all
      .filter((v) => semver.gt(v, lower) && semver.lte(v, toVersion))
      .sort(semver.compare);
  }

  private async availableSealedVersions(
    modulePrefix: string,
  ): Promise<string[]> {
    // Sealed logs live under .cards/modules/<prefix>/migrationLog/ once
    // the module is installed (applier copies them in). Local modules
    // use .cards/local/migrationLog/.
    const modulePath =
      modulePrefix === this.project.projectPrefix
        ? join(this.project.basePath, '.cards', 'local', 'migrationLog')
        : join(this.project.basePath, '.cards', 'modules', modulePrefix, 'migrationLog');

    let files: string[];
    try {
      files = await readdir(modulePath);
    } catch {
      return [];
    }
    return files
      .map((f) => /^migrationLog_(.+)\.jsonl$/.exec(f)?.[1])
      .filter((v): v is string => !!v && semver.valid(v) !== null);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd tools/data-handler && pnpm test test/mutations/module-update/integration.test.ts
```

Expected: PASS for at least the up-to-date case. The "real upgrade" case requires a fixture with sealed log files on disk; if the fixture is missing, write a minimal one (a `module-import-fixture/` with stubbed `.cards/modules/shared/foo/migrationLog/migrationLog_1.0.0.jsonl` etc.).

- [ ] **Step 5: Commit**

```bash
git add tools/data-handler/src/mutations/module-update/plan.ts \
        tools/data-handler/test/mutations/module-update/integration.test.ts
git commit -m "feat: ModuleUpdater.previewUpdate

Resolves the dependency plan, computes per-module log chains, and
surfaces conflicts. The apply path is added in the next task."
```

---

### Task 8: `ModuleUpdater.applyUpdate`

**Files:**
- Modify: `tools/data-handler/src/mutations/module-update/plan.ts`
- Test: `tools/data-handler/test/mutations/module-update/integration.test.ts`

`applyUpdate(preview)` walks the steps and for each one: (a) pulls the new module files (delegates to existing `applyModules`); (b) calls `replayLog` for each version in the chain; (c) records `applied_version` on success. Either all steps succeed (atomic) or the first failure terminates and the user is told to `git restore`.

- [ ] **Step 1: Write the failing test**

```typescript
it('applies a real upgrade end-to-end', async () => {
  const updater = new ModuleUpdater(project);
  const preview = await updater.previewUpdate('shared/foo', '1.2.0');
  expect(preview.conflicts).toHaveLength(0);

  const result = await updater.applyUpdate(preview);
  expect(result.status).toBe('succeeded');

  // Verify appliedModules was updated.
  const applied = await readAppliedModules(project.basePath);
  expect(applied.find((m) => m.prefix === 'shared/foo')?.appliedVersion).toBe('1.2.0');
});

it('refuses to apply when conflicts present', async () => {
  // Set up an applied version on a diverged branch.
  await writeAppliedModules(project.basePath, [
    { prefix: 'shared/foo', installedVersion: '1.6.0', appliedVersion: '1.6.0' },
  ]);
  const updater = new ModuleUpdater(project);
  const preview = await updater.previewUpdate('shared/foo', '2.0.0');
  // Assuming the fixture has both 1.6.0 and 2.0.0 sealed logs:
  expect(preview.conflicts.length).toBeGreaterThan(0);
  await expect(updater.applyUpdate(preview)).rejects.toThrow(/conflict/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd tools/data-handler && pnpm test test/mutations/module-update/integration.test.ts
```

Expected: FAIL — applyUpdate is not defined.

- [ ] **Step 3: Implement `applyUpdate`**

Add to `ModuleUpdater`:

```typescript
import { applyModules } from '../../modules/applier.js';
import { recordModuleApplied } from './applied-modules.js';
import { replayLog } from './replay.js';
import { join } from 'node:path';
import type { ModuleUpdateResult, StepReplayResult } from './types.js';

// inside class ModuleUpdater:

async applyUpdate(preview: ModuleUpdatePreview): Promise<ModuleUpdateResult> {
  if (preview.conflicts.length > 0) {
    throw new Error(
      `Cannot apply update: ${preview.conflicts.length} conflict(s). ` +
      preview.conflicts.map((c) => c.description).join('; '),
    );
  }

  const stepResults: StepReplayResult[] = [];

  for (const step of preview.steps) {
    // Pull files for this module/version into .cards/modules/<prefix>/ via the existing applier.
    await applyModules(this.project, [{ prefix: step.modulePrefix, version: step.toVersion }] as never, {
      // applier options — match the existing call in commands/import.ts:380.
    });

    // Walk the log chain in order.
    for (const v of step.logChain) {
      const logPath = join(
        this.project.basePath,
        '.cards', 'modules', step.modulePrefix, 'migrationLog',
        `migrationLog_${v}.jsonl`,
      );
      const result = await replayLog(this.project, logPath);
      result.modulePrefix = step.modulePrefix;
      result.fromVersion = step.fromVersion;
      result.toVersion = step.toVersion;

      if (result.status === 'failed') {
        stepResults.push(result);
        return {
          status: 'failed',
          steps: stepResults,
          failedAtStep: step.order,
          failureSummary: result.failureSummary,
        };
      }
    }

    // Bootstrap step (no logChain) still records the installation.
    await recordModuleApplied(
      this.project.basePath,
      step.modulePrefix,
      step.toVersion,
    );
    stepResults.push({
      modulePrefix: step.modulePrefix,
      fromVersion: step.fromVersion,
      toVersion: step.toVersion,
      status: 'succeeded',
    });
  }

  return { status: 'succeeded', steps: stepResults };
}
```

(The `applyModules` call shape may need adjustment — look at the existing call in `tools/data-handler/src/commands/import.ts` around line 380 and mirror its options.)

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd tools/data-handler && pnpm test test/mutations/module-update/integration.test.ts
```

Expected: PASS for the happy path. Adjust the fixture as needed.

- [ ] **Step 5: Commit**

```bash
git add tools/data-handler/src/mutations/module-update/plan.ts \
        tools/data-handler/test/mutations/module-update/integration.test.ts
git commit -m "feat: ModuleUpdater.applyUpdate

Atomic file-pull + replay per step. On any failure, the partial state
remains on disk; recovery is git restore."
```

---

### Task 9: `commands/module-update.ts` — wrapper for CLI/HTTP entry points

**Files:**
- Create: `tools/data-handler/src/commands/module-update.ts`

A thin class that exposes `previewUpdate` and `applyUpdate` to upstream consumers (CLI, HTTP). Equivalent to the existing `Update` / `Remove` command classes in shape.

- [ ] **Step 1: Create the file**

```typescript
// tools/data-handler/src/commands/module-update.ts

import { ModuleUpdater } from '../mutations/module-update/plan.js';
import { runWithDefaultCommitMessage } from '../utils/commit-context.js';
import type { Project } from '../containers/project.js';
import type {
  ModuleUpdatePreview,
  ModuleUpdateResult,
} from '../mutations/module-update/types.js';

export class ModuleUpdate {
  private updater: ModuleUpdater;

  constructor(private project: Project) {
    this.updater = new ModuleUpdater(project);
  }

  async preview(
    modulePrefix: string,
    toVersion: string,
  ): Promise<ModuleUpdatePreview> {
    return this.updater.previewUpdate(modulePrefix, toVersion);
  }

  async apply(
    preview: ModuleUpdatePreview,
  ): Promise<ModuleUpdateResult> {
    return runWithDefaultCommitMessage('Module update', () =>
      this.updater.applyUpdate(preview),
    );
  }
}
```

- [ ] **Step 2: Build**

```bash
cd tools/data-handler && pnpm build
```

Expected: success.

- [ ] **Step 3: Commit**

```bash
git add tools/data-handler/src/commands/module-update.ts
git commit -m "feat: ModuleUpdate command class for CLI/HTTP delegation"
```

---

### Task 10: CLI subcommand `cyberismo module update`

**Files:**
- Modify: `tools/cli/src/index.ts`

Add a subcommand that wraps `ModuleUpdate.preview` + (interactive confirmation) + `apply`. Add `--yes` and `--dry-run` flags.

- [ ] **Step 1: Read the existing CLI structure**

```bash
grep -n "command(\|action(" tools/cli/src/index.ts | head -20
```

Note the pattern (commander.js). Add the new subcommand near the existing `module` group.

- [ ] **Step 2: Add the subcommand**

In `tools/cli/src/index.ts`, near the existing module-related subcommands:

```typescript
import { ModuleUpdate } from '@cyberismo/data-handler';
import prompts from 'prompts';

program
  .command('module')
  .description('Manage imported modules')
  // ... existing module subcommands ...
  .command('update <module> <version>')
  .description('Update an imported module to a target version')
  .option('--dry-run', 'Show preview without applying')
  .option('-y, --yes', 'Skip confirmation prompt')
  .action(async (modulePrefix, version, opts) => {
    const cmds = await openProject();
    const moduleUpdate = new ModuleUpdate(cmds.project);
    const preview = await moduleUpdate.preview(modulePrefix, version);

    if (preview.conflicts.length > 0) {
      console.error(`\nCannot update: ${preview.conflicts.length} conflict(s)`);
      for (const c of preview.conflicts) {
        console.error(`  ${c.description}`);
      }
      process.exit(1);
    }

    console.log(`Updating ${modulePrefix} → ${version}`);
    for (const step of preview.steps) {
      const arrow = step.fromVersion ? `${step.fromVersion} → ${step.toVersion}` : `(new) → ${step.toVersion}`;
      console.log(`  ${step.order}. ${step.modulePrefix} ${arrow} (${step.logChain.length} log(s))`);
      if (step.crossesMajorBoundary) {
        console.log(`     WARNING: crosses a major boundary; check the release notes`);
      }
    }

    if (opts.dryRun) return;
    if (!opts.yes) {
      const { go } = await prompts({ type: 'confirm', name: 'go', message: 'Continue?' });
      if (!go) return;
    }

    const result = await moduleUpdate.apply(preview);
    if (result.status === 'failed') {
      console.error(`Update failed at step ${result.failedAtStep}: ${result.failureSummary}`);
      console.error(`Run \`git restore .\` to revert.`);
      process.exit(1);
    }
    console.log('Update complete.');
  });
```

(The exact placement / chaining syntax depends on the existing `program.command('module')` definition — match the surrounding style.)

- [ ] **Step 3: Smoke-test the CLI**

```bash
cd tools/cli && pnpm build && node dist/index.js module update --help
```

Expected: help text shows `module update <module> <version>` with the options.

- [ ] **Step 4: Commit**

```bash
git add tools/cli/src/index.ts
git commit -m "feat: cyberismo module update subcommand"
```

---

### Task 11: Refactor `Import.updateModule` to use the new flow

**Files:**
- Modify: `tools/data-handler/src/commands/import.ts:325-385`

The existing `updateModule` pulls files but doesn't run replay. Keep its signature; internally delegate to `ModuleUpdate.preview` + `ModuleUpdate.apply` so existing callers (older CLI bindings, HTTP) transparently get the new behaviour.

- [ ] **Step 1: Inspect the existing `updateModule`**

```bash
sed -n '320,400p' tools/data-handler/src/commands/import.ts
```

- [ ] **Step 2: Modify `updateModule`**

Replace the body of `Import.updateModule(name, version)` with:

```typescript
public async updateModule(name: string, version: string) {
  const { ModuleUpdate } = await import('./module-update.js');
  const moduleUpdate = new ModuleUpdate(this.project);
  const preview = await moduleUpdate.preview(name, version);

  if (preview.conflicts.length > 0) {
    throw new Error(
      `Cannot update ${name}: ${preview.conflicts.map((c) => c.description).join('; ')}`,
    );
  }

  return moduleUpdate.apply(preview);
}
```

Remove the previous body's resolver+applier call (the new flow handles both inside `applyUpdate`).

- [ ] **Step 3: Run the existing import tests**

```bash
cd tools/data-handler && pnpm test test/command-import.test.ts
```

Expected: PASS. Some tests may need to be updated if they previously expected a no-replay behaviour; update accordingly.

- [ ] **Step 4: Commit**

```bash
git add tools/data-handler/src/commands/import.ts
git commit -m "refactor: Import.updateModule delegates to ModuleUpdate

The HTTP API, CLI, and any direct callers now get replay automatically.
Old behaviour (file-pull only) is no longer reachable from the public API."
```

---

### Task 12: End-to-end integration test

**Files:**
- Modify: `tools/data-handler/test/mutations/module-update/integration.test.ts`

A single test that creates a fake module v1.0.0 → v1.6.0 with one breaking entry, installs v1.0.0, then runs the full update flow. Verifies the on-disk state (resource updated, log applied, appliedModules.json bumped).

- [ ] **Step 1: Construct the fixture**

Create `tools/data-handler/test/test-data/module-update-fixture/` with:
- `.cards/cardsConfig.json` listing `shared/foo` as an imported module.
- `.cards/modules/shared/foo/.../cardTypes/...json` for a card type that exists in v1.0.0.
- `.cards/modules/shared/foo/migrationLog/migrationLog_1.6.0.jsonl` with one entry that renames the card type from `a` to `b`.
- `.cards/local/appliedModules.json` with `[{ prefix: 'shared/foo', installedVersion: '1.0.0', appliedVersion: '1.0.0' }]`.

- [ ] **Step 2: Write the test**

```typescript
it('end-to-end: 1.0.0 → 1.6.0 with one renamed card type', async () => {
  // Initial state
  const initialApplied = await readAppliedModules(projectPath);
  expect(initialApplied[0].appliedVersion).toBe('1.0.0');

  const cmds = ... // open the project
  const moduleUpdate = new ModuleUpdate(cmds.project);
  const preview = await moduleUpdate.preview('shared/foo', '1.6.0');
  expect(preview.steps).toHaveLength(1);
  expect(preview.conflicts).toHaveLength(0);

  const result = await moduleUpdate.apply(preview);
  expect(result.status).toBe('succeeded');

  // After: appliedModules updated
  const finalApplied = await readAppliedModules(projectPath);
  expect(finalApplied[0].appliedVersion).toBe('1.6.0');
});
```

- [ ] **Step 3: Run the test**

```bash
cd tools/data-handler && pnpm test test/mutations/module-update/integration.test.ts
```

Expected: PASS.

- [ ] **Step 4: Run the full suite for sanity**

```bash
cd tools/data-handler && pnpm test
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/data-handler/test/mutations/module-update/integration.test.ts \
        tools/data-handler/test/test-data/module-update-fixture/
git commit -m "test: end-to-end module update with one rename entry"
```

---

## Verification checklist after the plan executes

```bash
pnpm --filter @cyberismo/data-handler test
pnpm --filter @cyberismo/data-handler build
pnpm --filter @cyberismo/data-handler lint
pnpm --filter @cyberismo/cli build
pnpm test
```

All should pass. Smoke-test the CLI:

```bash
cd /tmp/some-test-project
cyberismo module update shared/foo 1.6.0 --dry-run
# >> Should show steps + conflicts (if any), nothing applied.
cyberismo module update shared/foo 1.6.0 --yes
# >> Should apply and update appliedModules.json.
```

---

## What this plan delivers

- `cyberismo module bump` refuses patch bumps with non-empty logs.
- `cyberismo module update <module> <version>` works end-to-end: resolve → preview → confirm → pull + replay → record applied_version.
- Conflict detection (v1) refuses cross-major updates from diverged branches.
- `appliedModules.json` tracks installation/applied state per imported module.
- `Import.updateModule` transparently uses the new flow.

## What's next

- Plan 7: HTTP routes for `POST /mutations/preview`, `POST /mutations/apply`, `POST /modules/update` with SSE for progress.
- Deferred: cross-major hotfix DAG analysis (out of scope per the v1 conflict heuristic).
- Deferred: explicit interactive prompts during replay for "complete migration" workflows (per the spec's `Deferred Specifications` section).
- Deferred: a `--reset` flag on `module update` that lets a consumer force re-replay against the on-disk state.
