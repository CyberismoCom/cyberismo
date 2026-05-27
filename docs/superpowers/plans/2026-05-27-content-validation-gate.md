# Content-Validation Gate for Module Updates — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A module update that would leave the consumer project with new referential validation errors fails loudly with a typed error, instead of reporting success over an invalid project.

**Architecture:** The four-step update sequence — snapshot installed versions → `applyModules` → `cleanOrphans` → `replayResolvedUpdates` — plus the new validation gate are consolidated into a single private method `Import.applyResolvedUpdate(resolved, { module? })`. `importModule`, `updateModule`, and `updateAllModules` each do their own resolution and then delegate to it, removing the dance currently duplicated across all three. The gate is the method's **last step**: it runs `Validate.validate` over the result and, if any error remains, throws `ModuleValidationFailedError`. The project is assumed valid going in — there is no before/after diff; `project_content_valid` is a predicate on the result, not a delta. Because the three public methods are `@write`-decorated, throwing inside `applyResolvedUpdate` triggers the existing write-transaction machinery: with `--autocommit` the project's `onWriteError` hook (`containers/project.ts:161`) rolls the working tree back to the last commit; without it the error propagates and the user runs `git restore`. No new rollback code. The dispatcher maps the error to HTTP 422. This implements the `migration-system.allium` `project_content_valid` gate and the `SuccessImpliesValidProject` guarantee, and closes the phantom-success bug (an update that left a dangling reference previously printed "Updated …").

**Tech Stack:** TypeScript, Node 22, ESM with `.js` import extensions, Vitest (the migration tests in `tools/data-handler/test/` are Vitest, not Mocha — verified by running them). `Validate.getInstance().validate(projectPath, () => project): Promise<string>` returns all validation errors concatenated (empty string = valid) and re-populates the passed project's caches from disk. Autocommit rollback/commit hooks live in `containers/project.ts:150-168`.

---

## Scope

**In scope (this plan, Phase 1 of 3):**
- `ModuleValidationFailedError` in `modules/replay-updates.ts`.
- A single private `Import.applyResolvedUpdate` (apply + migrate + validate gate) that `importModule`, `updateModule`, `updateAllModules` delegate to, in `commands/import.ts`.
- Dispatcher mapping in `command-handler.ts`.

**Out of scope (later phases, outlined at the end):**
- Phase 2: foreign-prefix skip + local-only cascade for the `card-type` / `workflow` / `link-type` / `field-type-enum` rename handlers.
- Phase 3: removing operation-time referential checks (`validateFieldType`'s referential check and its interim `change` fallback, `enumValueExists`) now that the gate backstops them.

---

## File structure

**Modified files:**
- `tools/data-handler/src/modules/replay-updates.ts` — add `ModuleValidationFailedError` alongside the existing `ModuleReplay*Error` types (so the dispatcher's import site is unchanged in shape). No standalone gate function: the validate-and-throw is three lines inside the new private method.
- `tools/data-handler/src/commands/import.ts` — add the private `applyResolvedUpdate(resolved, { module? })` method (snapshot → apply → cleanOrphans → replay → validate-gate); delegate `importModule` / `updateModule` / `updateAllModules` to it; delete `importModule`'s before-capture and its `console.error` heuristic.
- `tools/data-handler/src/command-handler.ts` — map `ModuleValidationFailedError` to a 422 response.

**Test files (extended, no new file):**
- `tools/data-handler/test/modules/replay-updates.test.ts` — unit test for the `ModuleValidationFailedError` contract.
- `tools/data-handler/test/command-import.test.ts` — integration tests for the gate, reusing the existing `makeFakeModuleFixture` / `CommandManager` harness in the "module update — spec behaviours" describe block.

---

## Tasks

### Task 1: `ModuleValidationFailedError`

**Files:**
- Modify: `tools/data-handler/src/modules/replay-updates.ts`
- Test: `tools/data-handler/test/modules/replay-updates.test.ts`

The typed error the gate throws and the dispatcher catches. No standalone gate function — the validate-and-throw lives inside the private update method (Task 2). This task just pins the error's message and payload contract.

- [ ] **Step 1: Write the failing test**

Add to `tools/data-handler/test/modules/replay-updates.test.ts`. Extend the existing top-of-file import from `../../src/modules/replay-updates.js` to also import `ModuleValidationFailedError`, then add:

```typescript
describe('ModuleValidationFailedError', () => {
  it('carries the error lines and module, and renders them in the message', () => {
    const err = new ModuleValidationFailedError(['problem A', 'problem B'], 'shared/foo');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('ModuleValidationFailedError');
    expect(err.validationErrors).toEqual(['problem A', 'problem B']);
    expect(err.module).toBe('shared/foo');
    expect(err.message).toMatch(/Module update for shared\/foo left the project invalid: problem A; problem B/);
  });

  it('omits the module name when none is given', () => {
    const err = new ModuleValidationFailedError(['x']);
    expect(err.message).toMatch(/^Module update left the project invalid: x$/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd tools/data-handler && pnpm vitest run test/modules/replay-updates.test.ts`
Expected: FAIL — `ModuleValidationFailedError` is not exported.

- [ ] **Step 3: Implement the error class**

Append to `tools/data-handler/src/modules/replay-updates.ts` (after the existing `ModuleReplayFailedError` class):

```typescript
/**
 * Thrown when a module update leaves the project with referential
 * validation errors. This is the implementation of the spec's
 * `project_content_valid` gate (see migration-system.allium,
 * `SuccessImpliesValidProject`): replay applies entries mechanically and the
 * resulting content is judged once, as the update's last step. The project
 * is assumed valid going in, so any error afterward fails the update.
 *
 * Recovery: under `--autocommit` the write transaction's onWriteError hook
 * rolls the project back to the last commit when this throws; otherwise the
 * partial state remains on disk and the user runs `git restore`.
 */
export class ModuleValidationFailedError extends Error {
  constructor(
    public readonly validationErrors: string[],
    /** Module that triggered the user-facing call, for error context. */
    public readonly module?: string,
  ) {
    const prefix = module
      ? `Module update for ${module} left the project invalid: `
      : 'Module update left the project invalid: ';
    super(prefix + validationErrors.join('; '));
    this.name = 'ModuleValidationFailedError';
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd tools/data-handler && pnpm vitest run test/modules/replay-updates.test.ts`
Expected: PASS (existing tests + 2 new).

- [ ] **Step 5: Commit**

```bash
git add tools/data-handler/src/modules/replay-updates.ts tools/data-handler/test/modules/replay-updates.test.ts
git commit -m "$(cat <<'EOF'
feat: ModuleValidationFailedError for the content-validation gate

Typed error carrying the validator's error lines and the module context,
thrown when a module update leaves the project invalid.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Consolidate the update flow into `applyResolvedUpdate` with the gate

**Files:**
- Modify: `tools/data-handler/src/commands/import.ts` (add private method; delegate `importModule`, `updateModule`, `updateAllModules`)
- Test: `tools/data-handler/test/command-import.test.ts` (extend the "module update — spec behaviours" describe block)

Today the snapshot → `applyModules` → `cleanOrphans` → `replayResolvedUpdates` sequence is duplicated in all three methods. Pull it into one private method and append the gate. The three callers keep only their own resolution logic and then delegate.

The integration tests use the existing harness (`makeFakeModuleFixture`, `CommandManager`). The failure case plants a dangling field reference on a real consumer card (`decision_5`) so `Validate` reports an error (`validate.ts:842`, "Card has field that does not exist"); importing any module then runs the gate and rejects. The happy case confirms a valid import still succeeds (no false-positive).

- [ ] **Step 1: Write the failing tests**

Ensure `command-import.test.ts` imports these (add any missing): `import { readFile, writeFile } from 'node:fs/promises'` and `import { ModuleValidationFailedError } from '../src/modules/replay-updates.js'`. Add inside the `describe('module update — spec behaviours', ...)` block:

```typescript
  it('rejects an update that leaves the project invalid', async () => {
    // decision-records consumer is valid except for a planted dangling
    // field reference on one card. Any module update runs the validation
    // gate as its last step and rejects the invalid result (the project
    // is judged on its outcome; it is assumed valid going in).
    const consumerDir = join(moduleTestDir, 'valid', 'decision-records');
    const cardIndex = join(consumerDir, 'cardRoot', 'decision_5', 'index.json');
    const meta = JSON.parse(await readFile(cardIndex, 'utf-8')) as Record<
      string,
      unknown
    >;
    meta['decision/fieldTypes/ghostField'] = null; // not a real field type
    await writeFile(cardIndex, JSON.stringify(meta));

    const modRoot = join(moduleTestDir, 'fake-ok-mod');
    makeFakeModuleFixture(modRoot, { cardKeyPrefix: 'okmod' });

    const commands = new CommandManager(consumerDir, {
      autoSaveConfiguration: false,
    });
    await commands.initialize();

    await expect(commands.importCmd.importModule(modRoot)).rejects.toThrow(
      ModuleValidationFailedError,
    );
  });

  it('allows an update that leaves the project valid', async () => {
    const consumerDir = join(moduleTestDir, 'valid', 'decision-records');
    const modRoot = join(moduleTestDir, 'fake-ok-mod-2');
    makeFakeModuleFixture(modRoot, { cardKeyPrefix: 'okmod2' });

    const commands = new CommandManager(consumerDir, {
      autoSaveConfiguration: false,
    });
    await commands.initialize();

    await expect(
      commands.importCmd.importModule(modRoot),
    ).resolves.not.toThrow();
  });
```

- [ ] **Step 2: Run tests to verify the failure case fails**

Run: `cd tools/data-handler && pnpm vitest run test/command-import.test.ts -t "leaves the project"`
Expected: the "rejects" test FAILS — `importModule` currently only `console.error`s on new validation errors, so it resolves instead of throwing. The "allows" test PASSES.

- [ ] **Step 3: Add the private `applyResolvedUpdate` method**

In `tools/data-handler/src/commands/import.ts`, add `ModuleValidationFailedError` to the existing import from `replay-updates.js` (currently `replayResolvedUpdates, snapshotInstalledVersions`):

```typescript
import {
  replayResolvedUpdates,
  snapshotInstalledVersions,
  ModuleValidationFailedError,
} from '../modules/replay-updates.js';
```

Add this private method to the `Import` class (place it near the other module-update helpers):

```typescript
  /**
   * Apply a resolved set of modules and migrate the consumer to match.
   * Shared by importModule / updateModule / updateAllModules — the only
   * update transaction in this class. Snapshots installed versions before
   * applyModules overwrites them, materialises the new files, cleans
   * orphans, replays migration logs, then validates: the project must be
   * referentially valid afterwards or the whole update fails
   * (ModuleValidationFailedError). The project is assumed valid going in.
   */
  private async applyResolvedUpdate(
    resolved: ResolvedModule[],
    options?: { module?: string },
  ): Promise<ModuleUpdateResult | null> {
    const fromVersionByPrefix = await snapshotInstalledVersions(
      this.project,
      resolved,
    );

    await applyModules(this.project, resolved, {
      tempDir: this.tempModulesDir,
    });

    await cleanOrphans(this.project);

    const result = await replayResolvedUpdates(
      this.project,
      resolved,
      fromVersionByPrefix,
      options,
    );

    const validationErrors = await Validate.getInstance().validate(
      this.project.basePath,
      () => this.project,
    );
    const errors = validationErrors
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (errors.length > 0) {
      throw new ModuleValidationFailedError(errors, options?.module);
    }

    return result;
  }
```

If `ResolvedModule` is not already imported in `import.ts`, add `import type { ResolvedModule } from '../modules/resolver.js';` (the file already imports `resolveModules` from there).

- [ ] **Step 4: Delegate the three public methods**

In `importModule`, delete the before-capture at `import.ts:197-200`:

```typescript
    const beforeImportValidateErrors = await Validate.getInstance().validate(
      this.project.basePath,
      () => this.project,
    );
```

Replace `importModule`'s tail — the `snapshotInstalledVersions` → `applyModules` → `cleanOrphans` → `replayResolvedUpdates` block and the trailing `afterImportValidateErrors` + `console.error` block (`import.ts:295-324`) — with:

```typescript
    await this.applyResolvedUpdate(resolved, { module: resolvedName });
```

Replace `updateModule`'s tail — the same four-step block ending in `return replayResolvedUpdates(...)` (`import.ts:406-419`) — with:

```typescript
    return this.applyResolvedUpdate(resolved, { module: moduleName });
```

Replace `updateAllModules`'s tail (`import.ts:444-455`) with:

```typescript
    return this.applyResolvedUpdate(resolved);
```

- [ ] **Step 5: Run the failing tests to verify they pass**

Run: `cd tools/data-handler && pnpm vitest run test/command-import.test.ts -t "leaves the project"`
Expected: both PASS — the "rejects" test now throws `ModuleValidationFailedError`, the "allows" test still succeeds.

- [ ] **Step 6: Verify build, lint, and the full suite**

Run: `cd tools/data-handler && pnpm build && pnpm lint && pnpm vitest run`
Expected: build clean, lint clean, all tests PASS (1560 baseline + the new gate tests). `Validate` is still used by `applyResolvedUpdate`, so the import stays live after deleting `importModule`'s before-capture.

- [ ] **Step 7: Commit**

```bash
git add tools/data-handler/src/commands/import.ts tools/data-handler/test/command-import.test.ts
git commit -m "$(cat <<'EOF'
feat: single update transaction with a content-validation gate

Consolidate snapshot/applyModules/cleanOrphans/replay into a private
Import.applyResolvedUpdate, shared by importModule/updateModule/
updateAllModules, with validation as its last step. A module update that
leaves the project invalid now raises ModuleValidationFailedError instead
of reporting phantom success. Removes importModule's before-capture and
console.error length-heuristic; the project is assumed valid going in.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Map the error to an HTTP response

**Files:**
- Modify: `tools/data-handler/src/command-handler.ts`

The dispatcher's outer `catch` already maps `ModuleReplayConflictError` → 409 and `ModuleReplayFailedError` → 500 (`command-handler.ts:488-501`). Add a 422 mapping for the new error: the request was well-formed but its result would leave the project invalid.

- [ ] **Step 1: Add the import**

In `tools/data-handler/src/command-handler.ts`, extend the existing import of the replay error types (currently `ModuleReplayConflictError, ModuleReplayFailedError`, around line 59) to include `ModuleValidationFailedError`.

- [ ] **Step 2: Add the catch mapping**

After the `ModuleReplayFailedError` block (`command-handler.ts:495-501`), add:

```typescript
      if (e instanceof ModuleValidationFailedError) {
        return {
          statusCode: 422,
          message: e.message,
          payload: { validationErrors: e.validationErrors, module: e.module },
        };
      }
```

- [ ] **Step 3: Verify build and suite**

Run: `cd tools/data-handler && pnpm build && pnpm vitest run`
Expected: build clean, all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add tools/data-handler/src/command-handler.ts
git commit -m "$(cat <<'EOF'
feat: map ModuleValidationFailedError to HTTP 422

A module update rejected by the content-validation gate returns 422 with
the introduced validation errors, mirroring the 409/500 shapes used for
ModuleReplayConflictError / ModuleReplayFailedError.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-review notes

- **Spec coverage:** `project_content_valid` gate → Tasks 1–2; `SuccessImpliesValidProject` (an update reaches success only over a valid project) → Task 2 wiring; the dispatcher surfacing → Task 3. `validation_summary` is realised as `ModuleValidationFailedError.validationErrors` (the full set of error lines from `Validate.validate`).
- **Not covered here (by design):** `ReplayMutatesOnlyLocalState` for the non-field-type rename handlers (Phase 2) and removing operation-time referential checks (Phase 3). The gate is additive and safe to land first; it backstops both later phases.
- **Type consistency:** `ModuleValidationFailedError(validationErrors: string[], module?)` is constructed in Task 2's `applyResolvedUpdate` and its fields (`validationErrors`, `module`) match the dispatcher payload in Task 3 and the contract test in Task 1. `applyResolvedUpdate(resolved, { module? }): Promise<ModuleUpdateResult | null>` matches the existing return type of `updateModule`/`updateAllModules`.

## Open question

The gate assumes the project is **valid before** the update — it does not capture or compare a baseline. If a project is already invalid for unrelated reasons, an update will fail the gate even though it introduced nothing. Acceptable for now (you should not be updating modules from a broken project). Capturing a before-baseline and failing only on newly-introduced errors is a possible future refinement; deferred deliberately to keep the gate a simple predicate on the result.

---

## Phase 2 outline — uniform local-only scoping (separate plan)

Give `card-type-rename`, `workflow-rename`, `link-type-rename`, and `field-type-enum-rename` handlers the foreign-prefix skip + local-only cascade that `field-type-rename` already has:
- Skip the resource-file rename/edit when `target.prefix !== project.projectPrefix` (the module's own file arrives via `applyModules`).
- Scope cascade scans to `ResourcesFrom.localOnly`.
- Per handler: a failing test that replays a foreign rename of that resource type against a consumer whose local card/resource references it, asserting the local reference is rewritten and no `'X not found'` / `Cannot change module resources` is thrown.

## Phase 3 outline — remove operation-time referential checks (separate plan)

With the gate in place, strip the input-validation-of-references:
- Remove the referential branch of `CardTypeResource.validateFieldType` (including the interim `change`-op fallback added in commit `79f622b0`); keep only structural/`payload_valid`-style checks. Referential integrity is now the gate's job.
- Audit `FieldTypeResource.enumValueExists` and the rename handlers' `'not found'` throws; remove those that duplicate the content gate.
- Confirm `postUpdate`'s `this.validate(content)` carries the needed per-resource referential rules for fast interactive feedback (the spec's "each resource's validate()").
- Each removal is guarded by an existing or new test proving the gate (or content `validate`) catches what the operation-time check used to.
