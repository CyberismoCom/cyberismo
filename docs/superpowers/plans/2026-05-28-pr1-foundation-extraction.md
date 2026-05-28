# PR1 — Mutation Engine Foundation + LinkType Extraction Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract PR1 of the `migration-imp` branch split (per `docs/superpowers/specs/2026-05-28-migration-branch-split-strategy-design.md`) into a clean branch off `main`. PR1 ships the new `tools/data-handler/src/mutations/` engine (handler interface, dispatcher, fingerprint, plan, types, cascade-rewrite utilities) plus one resource (LinkType) wired through it end-to-end. After PR1 lands, LinkType rename and delete flow through the new engine and produce migration log entries; every other resource still uses its existing in-class code path on `main`.

**Architecture:** Curated extraction from `migration-imp`. New files are taken at end-state via `git checkout migration-imp -- <path>`. One file requires **trimming** at extraction (its end-state assumes handlers that don't exist yet in PR1): `tools/data-handler/src/mutations/dispatcher.ts` (HANDLERS list reduced to LinkType + DefaultNoCascade). `tools/data-handler/src/utils/configuration-logger.ts` is taken verbatim from `migration-imp` (kind-discriminator reshape). The on-main callsites for the old `ConfigurationOperation` enum need adjusting: `commands/remove.ts` loses its `MODULE_REMOVE` log call entirely (the new `MigrationEntryKind` union has no equivalent — `migration-imp` simply deletes the call), and `commands/rename.ts` re-emits the project rename entry in the new `{kind: 'project_rename', target, payload}` shape (PR1 keeps the legacy implementation of `rename.ts` otherwise — engine routing lands in PR6). Two **hand-edits** add LinkType-only engine routing to `commands/update.ts` and `commands/remove.ts` without touching the code paths for other resource types — those keep their `main` behavior until their own handler PR lands. The `link-type-resource.ts` cascade hook (`onNameChange`) is removed because its replacement (`LinkTypeRenameHandler`) ships in this PR; the equivalent hooks on every other resource subclass stay intact.

**Tech Stack:** TypeScript NodeNext ESM (relative imports use `.js` extension); pnpm workspaces; `tools/data-handler` runs Mocha + Chai for existing tests and Vitest for new `test/mutations/` tests (they coexist in the same package). Node 22 LTS. `node:crypto` for fingerprints. `git`, `pnpm`, `gh` for the workflow.

---

## Scope

**In scope:**
- New folder `tools/data-handler/src/mutations/` with engine + LinkType handlers + cascade rewrite utilities
- `tools/data-handler/src/utils/configuration-logger.ts` reshape (operation enum → kind union, parameters → payload)
- Logger-callsite adjustments: delete the now-orphaned `MODULE_REMOVE` log call in `commands/remove.ts`; re-emit the project rename log entry in `commands/rename.ts` in the new `{kind, payload}` shape
- `tools/data-handler/src/resources/link-type-resource.ts` cascade hook removal (replaced by `LinkTypeRenameHandler`)
- LinkType-only engine routing branches in `commands/update.ts` and `commands/remove.ts`
- Full test suite for the foundation engine and LinkType handlers
- Updates to existing tests broken by the configuration-logger reshape

**Out of scope (later PRs):**
- Any handler for CardType/FieldType/Workflow/Template/Calc/Report/GraphModel/GraphView/ProjectRename
- Routing those resource types through the engine (their `commands/*` paths stay unchanged)
- Module update / replay engine (`mutations/module-update/`)
- HTTP routes (`tools/backend/src/domain/mutations/`)
- "Handlers own cascade" cleanup (delete `onNameChange` from non-LinkType resources)
- Validation gate, local-only scoping fixes
- All migration-imp-only docs (`docs/superpowers/plans/2026-05-20-*.md`, `docs/superpowers/migration-system-executor-prompt.md`, repo-root `migration-system.allium`, `migration-system.md`, `migrations-plan.adoc`, `AGENT_CONTEXT.md`). None of these exist on `main`; PR1 simply does not pull them, which is the same as dropping them.

---

## File Map

**New files (just `git checkout` from `migration-imp`):**

| Path | Responsibility |
|---|---|
| `tools/data-handler/src/mutations/handler.ts` | `Handler` interface (`matches`, `isBreaking`, `preview`, `apply`, `affectedFilePaths`) + `MutationContext` |
| `tools/data-handler/src/mutations/types.ts` | `MutationKind`, `MutationInput` (discriminated union), `CascadePreview`, `MutationFingerprint`, `PreviewResult`, `ApplyOptions`, `ApplyResult` |
| `tools/data-handler/src/mutations/plan.ts` | `ResourceMutations` class — `.plan()`, `.apply()`, internal `recordLogEntry()` |
| `tools/data-handler/src/mutations/fingerprint.ts` | `computeFingerprint(input, affectedFilePaths)` — SHA256 over canonical JSON + file contents |
| `tools/data-handler/src/mutations/dispatcher.ts` | Routes `(kind, target, updateKey?, operation?)` to a `Handler`. **Hand-trim the HANDLERS list at extraction.** |
| `tools/data-handler/src/mutations/handlers/default-no-cascade.ts` | Catch-all `Handler` for `kind: 'edit'` mutations with no specific handler |
| `tools/data-handler/src/mutations/handlers/link-type-rename.ts` | LinkType rename cascade (rewrite calculation refs, handlebar refs, card content refs, card metadata link references; then `super.rename`) |
| `tools/data-handler/src/mutations/handlers/link-type-delete.ts` | LinkType delete cascade (strip matching links from card metadata, then `resource.delete()`) |
| `tools/data-handler/src/mutations/cascades/rewrite-refs.ts` | `rewriteCalculationRefs`, `rewriteHandlebarRefs`, `rewriteCardContentRefs` — used by rename handlers |
| `tools/data-handler/test/mutations/fingerprint.test.ts` | Foundation: fingerprint determinism + content sensitivity |
| `tools/data-handler/test/mutations/dispatcher.test.ts` | Foundation: dispatch table correctness |
| `tools/data-handler/test/mutations/plan.test.ts` | Foundation: `ResourceMutations.plan/apply` happy path + fingerprint gate |
| `tools/data-handler/test/mutations/bypass-fingerprint.test.ts` | Foundation: `bypassFingerprint` option behavior |
| `tools/data-handler/test/mutations/integration.test.ts` | Foundation: end-to-end engine integration |
| `tools/data-handler/test/mutations/cascades/rewrite-refs.test.ts` | Cascade rewrite utility tests |
| `tools/data-handler/test/mutations/handlers/link-type-rename.test.ts` | LinkType rename handler unit tests |
| `tools/data-handler/test/mutations/handlers/link-type-delete.test.ts` | LinkType delete handler unit tests |
| `tools/data-handler/test/mutations/integration-link-type-delete.test.ts` | LinkType delete end-to-end |

**Modified files (substantive changes from main):**

| Path | Change |
|---|---|
| `tools/data-handler/src/utils/configuration-logger.ts` | `ConfigurationOperation` enum → `MigrationEntryKind` union; `parameters` → `payload`; helper method signatures adjusted. Take end-state from `migration-imp` verbatim. |
| `tools/data-handler/src/resources/link-type-resource.ts` | Remove `onNameChange` hook (the cascade now lives in `LinkTypeRenameHandler`). Take end-state from `migration-imp` verbatim. |
| `tools/data-handler/src/commands/remove.ts` | (a) Add LinkType-only engine routing branch. (b) Delete the now-orphaned `MODULE_REMOVE` log call (the new `MigrationEntryKind` union has no equivalent; `migration-imp` drops the call). Other resource-delete paths unchanged. |
| `tools/data-handler/src/commands/rename.ts` | Re-emit the project rename log entry in the new `{kind: 'project_rename', target, payload: {oldPrefix, newPrefix}}` shape (the only callsite for this kind in PR1; `migration-imp` later moves this into `ProjectRenameHandler`, but that's PR6). No engine routing here in PR1. |
| `tools/data-handler/src/commands/update.ts` | Add LinkType-only engine routing branch for both rename (`isRename && type === 'linkType'`) and edit (`type === 'linkType' && !isRename`). Other types unchanged. |
| `tools/data-handler/test/utils/configuration-logger.test.ts` | Migrate assertions from `.operation` / `ConfigurationOperation.X` to `.kind` / string literals; `.parameters` → `.payload`. Take end-state from `migration-imp`. |
| `tools/data-handler/test/resources/breaking-change-classification.test.ts` | Adjust enum imports and entry-shape assertions to new logger shape. Take end-state from `migration-imp`. |

---

## Tasks

### Task 1: Create the PR1 branch from current main

**Files:** none (workspace operation)

- [ ] **Step 1: Verify clean working tree on `migration-imp`**

  Run: `cd /var/home/samu/cyberismo && git status`
  Expected: working tree clean. If not, stop and resolve.

- [ ] **Step 2: Fetch latest main**

  Run: `git fetch origin main`
  Expected: fetches without error.

- [ ] **Step 3: Create the PR1 branch off origin/main**

  Run:
  ```bash
  git switch -c pr1-foundation-linktype origin/main
  ```
  Expected: switches to a new branch tracking nothing (we'll push later).

- [ ] **Step 4: Verify branch position**

  Run: `git log --oneline -1 && git status`
  Expected: HEAD is at `origin/main`'s tip, working tree clean.

- [ ] **Step 5: Install dependencies for the main snapshot**

  Run: `pnpm install`
  Expected: lockfile is in sync with `main`'s `package.json` files; no changes to commit.

- [ ] **Step 6: No commit yet** — commits happen at the end of cohesive task groups (Task 7 commits the foundation engine + LinkType handlers, Task 13 commits the wiring + logger reshape, etc.).

---

### Task 2: Pull the new mutations engine files (types, handler interface, fingerprint)

**Files:**
- Create: `tools/data-handler/src/mutations/handler.ts`
- Create: `tools/data-handler/src/mutations/types.ts`
- Create: `tools/data-handler/src/mutations/fingerprint.ts`

- [ ] **Step 1: Checkout the three foundational files from migration-imp**

  Run:
  ```bash
  git checkout migration-imp -- \
    tools/data-handler/src/mutations/handler.ts \
    tools/data-handler/src/mutations/types.ts \
    tools/data-handler/src/mutations/fingerprint.ts
  ```

- [ ] **Step 2: Verify imports are satisfiable**

  Run: `git status`
  Expected: three new files staged.

  Read each file:
  - `tools/data-handler/src/mutations/handler.ts` — should export `Handler` interface + `MutationContext` type.
  - `tools/data-handler/src/mutations/types.ts` — should export `MutationKind`, `MutationInput`, `CascadePreview`, `MutationFingerprint`, `PreviewResult`, `ApplyOptions`, `ApplyResult`.
  - `tools/data-handler/src/mutations/fingerprint.ts` — should export `computeFingerprint`.

  Verify every `import` in these three files either (a) references another file we'll add later in the plan, or (b) references something already on `main`. Run for each file:
  ```bash
  grep -E "^import " tools/data-handler/src/mutations/handler.ts
  grep -E "^import " tools/data-handler/src/mutations/types.ts
  grep -E "^import " tools/data-handler/src/mutations/fingerprint.ts
  ```
  For each `from '../xxx.js'` import, confirm `xxx.ts` exists on main (use `ls` or check explicitly). If an import references e.g. `'./plan.js'` — that's fine, plan.ts lands in Task 4. If it references something only on `migration-imp` outside this PR's scope (e.g. a util in `utils/` that was renamed), flag it for resolution.

- [ ] **Step 3: Build check (expected to fail — that's OK at this stage)**

  Run: `pnpm --filter=@cyberismo/data-handler build`
  Expected: TypeScript will complain about missing imports (e.g. `./dispatcher.js`, `./plan.js`). That's expected — we add them in the next tasks. Don't commit yet.

---

### Task 3: Pull the cascade-rewrite utilities

**Files:**
- Create: `tools/data-handler/src/mutations/cascades/rewrite-refs.ts`

- [ ] **Step 1: Checkout from migration-imp**

  Run:
  ```bash
  git checkout migration-imp -- \
    tools/data-handler/src/mutations/cascades/rewrite-refs.ts
  ```

- [ ] **Step 2: Confirm it lands**

  Run: `git status`
  Expected: one new file staged.

  Inspect imports:
  ```bash
  grep -E "^import " tools/data-handler/src/mutations/cascades/rewrite-refs.ts
  ```
  Confirm all referenced files exist on main or are landing in this PR. If `rewrite-refs.ts` imports something like `'../../utils/X.js'` that exists on main, OK. If it imports something only on migration-imp, note it.

---

### Task 4: Pull the ResourceMutations class (plan.ts)

**Files:**
- Create: `tools/data-handler/src/mutations/plan.ts`

- [ ] **Step 1: Checkout from migration-imp**

  Run:
  ```bash
  git checkout migration-imp -- tools/data-handler/src/mutations/plan.ts
  ```

- [ ] **Step 2: Inspect for cross-file dependencies**

  Read `tools/data-handler/src/mutations/plan.ts`. It will reference:
  - `./dispatcher.js` — lands in Task 6
  - `./fingerprint.js` — landed in Task 3
  - `./types.js` — landed in Task 3
  - `./handler.js` — landed in Task 3
  - `../utils/configuration-logger.js` — reshape lands in Task 8

  Verify every other import resolves against `main`. Cross-reference each `from '../xxx.js'` with `ls tools/data-handler/src/...`.

---

### Task 5: Pull the DefaultNoCascadeHandler

**Files:**
- Create: `tools/data-handler/src/mutations/handlers/default-no-cascade.ts`

- [ ] **Step 1: Checkout from migration-imp**

  Run:
  ```bash
  git checkout migration-imp -- \
    tools/data-handler/src/mutations/handlers/default-no-cascade.ts
  ```

- [ ] **Step 2: Verify imports resolve**

  Read and grep imports. Every dependency should be in this PR or already on main.

---

### Task 6: Pull the dispatcher and trim the HANDLERS list

**Files:**
- Create: `tools/data-handler/src/mutations/dispatcher.ts`

This is the only file in PR1 that requires hand-editing during extraction. Its end-state imports and registers all ~27 handlers; PR1 has only two real handlers (LinkType rename, LinkType delete) plus the default.

- [ ] **Step 1: Checkout the end-state dispatcher**

  Run:
  ```bash
  git checkout migration-imp -- tools/data-handler/src/mutations/dispatcher.ts
  ```

- [ ] **Step 2: Read the file and identify the HANDLERS list**

  Open `tools/data-handler/src/mutations/dispatcher.ts`. The HANDLERS list registers every handler the engine knows about (around 27 entries on migration-imp). Locate:
  - The imports block (top of file)
  - The HANDLERS constant (a `const HANDLERS: Handler[] = [...]` or similar)

- [ ] **Step 3: Trim imports**

  Keep only:
  - `DefaultNoCascadeHandler` (from `./handlers/default-no-cascade.js`)
  - `LinkTypeRenameHandler` (from `./handlers/link-type-rename.js`)
  - `LinkTypeDeleteHandler` (from `./handlers/link-type-delete.js`)
  - Any non-handler imports (the `Handler` interface, types, etc. — leave alone)

  Delete every other handler import line.

- [ ] **Step 4: Trim the HANDLERS list to the three kept handlers**

  The list should become:
  ```typescript
  const HANDLERS: Handler[] = [
    new LinkTypeRenameHandler(),
    new LinkTypeDeleteHandler(),
    new DefaultNoCascadeHandler(),
  ];
  ```
  (Adjust syntax to match what migration-imp uses — likely identical.) Order matters only if the dispatcher returns the first match; keep `DefaultNoCascadeHandler` last.

- [ ] **Step 5: Verify file still typechecks in isolation**

  Read the trimmed file once. Confirm no dangling references to deleted handlers (e.g., no `if (handler instanceof CardTypeRenameHandler)` anywhere).

  Run: `pnpm --filter=@cyberismo/data-handler tsc --noEmit 2>&1 | head -50`
  Expected: errors are now only about *missing* files that later tasks will add (e.g. `./handlers/link-type-rename.js`, `./handlers/link-type-delete.js`). No errors about *deleted* handlers.

---

### Task 7: Pull the LinkType handler files

**Files:**
- Create: `tools/data-handler/src/mutations/handlers/link-type-rename.ts`
- Create: `tools/data-handler/src/mutations/handlers/link-type-delete.ts`

- [ ] **Step 1: Checkout both LinkType handlers**

  Run:
  ```bash
  git checkout migration-imp -- \
    tools/data-handler/src/mutations/handlers/link-type-rename.ts \
    tools/data-handler/src/mutations/handlers/link-type-delete.ts
  ```

- [ ] **Step 2: Verify imports**

  Both files should only depend on:
  - `../../mutations/handler.js`, `./default-no-cascade.js`, `../types.js` — in this PR
  - `../cascades/rewrite-refs.js` — in this PR (rename only)
  - `../../resources/link-type-resource.js`, `../../containers/project.js`, util files — already on main
  - `../../utils/resource-utils.js` — already on main

  If you find an import to something only on `migration-imp` outside this PR's scope (e.g., a new util file added by a later PR), flag for resolution — most likely needs to be pulled into PR1 too.

- [ ] **Step 3: Build check**

  Run: `pnpm --filter=@cyberismo/data-handler tsc --noEmit 2>&1 | head -50`
  Expected: remaining errors are limited to the configuration-logger shape mismatch (the engine writes the new shape but the file on main has the old shape). That's resolved in Task 8.

- [ ] **Step 4: Commit the foundation engine + LinkType handlers**

  Run:
  ```bash
  git add tools/data-handler/src/mutations/
  git commit -m "feat(mutations): foundation engine + LinkType handlers

New tools/data-handler/src/mutations/ folder. Handler interface,
dispatcher (trimmed to LinkType + default), fingerprint,
ResourceMutations.plan/apply, cascade rewrite utilities, and
LinkType rename + delete handlers.

Build is not yet green — configuration-logger reshape lands in the
next commit."
  ```

---

### Task 8: Reshape configuration-logger to the kind discriminator

**Files:**
- Modify: `tools/data-handler/src/utils/configuration-logger.ts`

- [ ] **Step 1: Take the migration-imp end-state of the logger**

  Run:
  ```bash
  git checkout migration-imp -- tools/data-handler/src/utils/configuration-logger.ts
  ```

- [ ] **Step 2: Verify the new shape**

  Read the file. Confirm it exports:
  - `type MigrationEntryKind = 'resource_edit' | 'resource_delete' | 'resource_rename' | 'project_rename'`
  - `interface ConfigurationLogEntry { timestamp: string; kind: MigrationEntryKind; target: string; payload: Record<string, unknown>; }`
  - Helper methods `logResourceDelete`, `logResourceRename`, `logResourceUpdate` with updated signatures.

  The `ConfigurationOperation` enum should be **gone**.

- [ ] **Step 3: Identify callers on main that now break**

  Run:
  ```bash
  git grep -n "ConfigurationOperation\." -- tools/data-handler/src
  git grep -n "\.operation\b" -- tools/data-handler/src/commands tools/data-handler/src/resources
  git grep -n "\.parameters\b" -- tools/data-handler/src/commands tools/data-handler/src/resources
  ```

  Expected hits (these are the callers PR1 must update):
  - `tools/data-handler/src/commands/remove.ts` — writes a `MODULE_REMOVE` entry (PR1 **deletes** the call — see Task 9)
  - `tools/data-handler/src/commands/rename.ts` — writes a `PROJECT_RENAME` entry (PR1 **re-emits** in the new shape — see Task 10)

  Other resource-class callers (`logResourceDelete`, `logResourceRename`, `logResourceUpdate` from `resources/resource-object.ts`) call the **helper methods**, whose internal payload shape changes but whose call signatures stay source-compatible — confirmed by diffing `tools/data-handler/src/utils/configuration-logger.ts` between `main` and `migration-imp`. No edits needed at those callsites.

- [ ] **Step 4: Don't commit yet** — fix the two callsites in the next two tasks first so the build goes green.

---

### Task 9: Delete MODULE_REMOVE callsite + add LinkType engine routing in commands/remove.ts

**Files:**
- Modify: `tools/data-handler/src/commands/remove.ts`

This task does two things to one file: (a) delete the now-orphaned `MODULE_REMOVE` log call (the new `MigrationEntryKind` union has no module kind; `migration-imp` simply drops the call), (b) add a LinkType-only branch that routes through `ResourceMutations`.

> **Why not route every `projectResource(type)` through the engine like `migration-imp` does?** Because PR1's dispatcher only has `LinkTypeRenameHandler`, `LinkTypeDeleteHandler`, and `DefaultNoCascadeHandler`. Routing e.g. a CardType delete would land on `DefaultNoCascadeHandler` and produce no cascade — that's silently wrong. We must hard-gate on `type === 'linkType'` (the singular CLI argument) until other resource handlers land in their own PRs.

- [ ] **Step 1: Read main's `commands/remove.ts`**

  It's currently on disk (we haven't checked out the migration-imp version). Identify:
  - The `ConfigurationOperation.MODULE_REMOVE` callsite inside `removeModule()` (around line 350). Whole `await ConfigurationLogger.log(...)` block.
  - The top-of-file `import { ConfigurationLogger, ConfigurationOperation } from '../utils/configuration-logger.js';` block.
  - The `if (this.projectResource(type)) { ... return resource?.delete(); }` block (around line 297) — where the LinkType branch goes.

- [ ] **Step 2: Delete the MODULE_REMOVE log call**

  Remove the whole block:
  ```typescript
  await ConfigurationLogger.log(this.project.basePath, {
    operation: ConfigurationOperation.MODULE_REMOVE,
    target: targetName,
  });
  ```
  (Confirm against `git show migration-imp:tools/data-handler/src/commands/remove.ts` — the call is gone there too.)

  Adjust the import:
  - Remove `ConfigurationOperation` from the import list.
  - If `ConfigurationLogger` is no longer referenced anywhere else in this file (likely true after the deletion), remove the whole import line.

- [ ] **Step 3: Add the LinkType-only engine routing**

  Find the block:
  ```typescript
  if (this.projectResource(type)) {
    const resource = this.project.resources.byType(
      targetName,
      this.project.resources.resourceTypeFromSingularType(type),
    );
    return resource?.delete();
  }
  ```

  Insert a LinkType branch **before** the existing logic. Note the CLI passes the **singular** type name (`'linkType'`), not the folder name:
  ```typescript
  if (this.projectResource(type)) {
    if (type === 'linkType') {
      const { ResourceMutations } = await import('../mutations/plan.js');
      const { resourceName: parseResourceName } = await import(
        '../utils/resource-utils.js'
      );
      const target = parseResourceName(targetName);
      const mutations = new ResourceMutations(this.project);
      const plan = await mutations.plan({ kind: 'delete', target });
      await mutations.apply(
        { kind: 'delete', target },
        { fingerprint: plan.fingerprint },
      );
      return;
    }
    const resource = this.project.resources.byType(
      targetName,
      this.project.resources.resourceTypeFromSingularType(type),
    );
    return resource?.delete();
  }
  ```

  Use dynamic imports (as shown) — `migration-imp` uses dynamic imports here, presumably to avoid an import cycle with the engine.

- [ ] **Step 4: Verify build for this file**

  Run: `pnpm --filter=@cyberismo/data-handler tsc --noEmit 2>&1 | grep -E "remove\.ts" | head -20`
  Expected: no errors specific to `remove.ts`.

---

### Task 10: Re-emit PROJECT_RENAME log entry in commands/rename.ts in the new shape

**Files:**
- Modify: `tools/data-handler/src/commands/rename.ts`

PR1 does **not** add ProjectRename engine routing — that's PR6 (and `migration-imp` ends up gutting most of `commands/rename.ts` once `ProjectRenameHandler` lands). For PR1, leave the file's project-prefix cascade logic intact and only re-emit the log entry in the new shape so the file compiles against the reshaped logger.

The target shape matches what `ResourceMutations.recordLogEntry` writes for `project_rename` on `migration-imp`, so PR1 stays log-shape-compatible with what PR6 will emit later.

- [ ] **Step 1: Locate the PROJECT_RENAME callsite**

  Open `tools/data-handler/src/commands/rename.ts`. Find the block around line 290:
  ```typescript
  await ConfigurationLogger.log(this.project.basePath, {
    operation: ConfigurationOperation.PROJECT_RENAME,
    target: ...,
    ...
  });
  ```
  Note which local variables hold the old and new prefix (`this.from`, `this.to`, or similar — capture before the cascade mutates state).

- [ ] **Step 2: Rewrite the call in the new shape**

  Replace with:
  ```typescript
  await ConfigurationLogger.log(this.project.basePath, {
    kind: 'project_rename',
    target: newPrefix,
    payload: { oldPrefix, newPrefix },
  });
  ```
  Use whatever local variable names the file already uses for the old/new prefix; the literal property names (`oldPrefix`, `newPrefix`) and `kind: 'project_rename'` are fixed because they must match `ResourceMutations.recordLogEntry`'s shape for `project_rename` (see `tools/data-handler/src/mutations/plan.ts` on `migration-imp`).

  Update the import: remove `ConfigurationOperation` from the import list at the top of the file. `ConfigurationLogger` itself is still used and must remain imported.

- [ ] **Step 3: Verify**

  Run: `pnpm --filter=@cyberismo/data-handler tsc --noEmit 2>&1 | grep -E "rename\.ts" | head -20`
  Expected: no errors specific to `rename.ts`.

---

### Task 11: Add LinkType-only engine routing to commands/update.ts

**Files:**
- Modify: `tools/data-handler/src/commands/update.ts`

The end-state of `update.ts` on `migration-imp` routes four resource families through the engine (`linkTypes`, `fieldTypes`, `workflows`, plus selective `cardTypes` edits) and routes **all** renames through the engine, letting `DefaultNoCascadeHandler` catch types without a dedicated handler. **PR1 cannot copy that pattern**: PR1's dispatcher only has LinkType handlers + DefaultNoCascade, so a CardType / FieldType / Workflow rename would land on DefaultNoCascade and skip the cascade entirely — silently wrong. PR1 must hard-gate on `type === 'linkTypes'` (plural — this is what `extractType()` returns for `commands/update.ts`).

- [ ] **Step 1: Read migration-imp's update.ts for the MutationInput shapes**

  Run:
  ```bash
  git show migration-imp:tools/data-handler/src/commands/update.ts | sed -n '40,120p'
  ```
  Capture the exact MutationInput construction for `rename` (uses `newIdentifier: string`, **not** a `ResourceName`) and for `edit` (passes `updateKey`, `operation` straight through).

- [ ] **Step 2: Read main's update.ts**

  Open `tools/data-handler/src/commands/update.ts`. Identify the entry of the update method, the `isRename` detection, and where the legacy `resource?.update(updateKey, operation)` call lives.

- [ ] **Step 3: Add LinkType-only engine branches**

  Wedge the LinkType-only routing into the update method, after argument validation and before the existing legacy dispatch. Note the type literal is **`'linkTypes'` (plural)** — `extractType()` returns the folder name, not the singular CLI form.

  ```typescript
  const type = this.project.resources.extractType(name);

  // A rename is encoded as a 'change' on the 'name' updateKey.
  const isRename =
    updateKey.key === 'name' &&
    (operation as { name: string }).name === 'change';

  // PR1 routes ONLY linkTypes through the engine. Other resource families
  // keep their legacy in-class cascade path until their own handler PR lands.
  // (Do not generalise this to a Set of types — PR1's dispatcher would route
  // unhandled types to DefaultNoCascadeHandler and silently drop their cascade.)
  if (type === 'linkTypes') {
    const { ResourceMutations } = await import('../mutations/plan.js');
    const { resourceName: parseResourceName } = await import(
      '../utils/resource-utils.js'
    );
    const target = parseResourceName(name);
    const mutations = new ResourceMutations(this.project);

    if (isRename) {
      const newIdentifier = parseResourceName(
        (operation as { to: string }).to,
      ).identifier;
      const input = { kind: 'rename' as const, target, newIdentifier };
      const plan = await mutations.plan(input);
      await mutations.apply(input, { fingerprint: plan.fingerprint });
      return;
    }

    const input = {
      kind: 'edit' as const,
      target,
      updateKey,
      operation,
    };
    const plan = await mutations.plan(input);
    await mutations.apply(input, { fingerprint: plan.fingerprint });
    return;
  }
  ```

  Cross-check the MutationInput field names against `tools/data-handler/src/mutations/types.ts` on `migration-imp` (already extracted in Task 2) — for `rename` it's `newIdentifier: string`, not a `ResourceName`.

- [ ] **Step 4: Verify**

  Run: `pnpm --filter=@cyberismo/data-handler tsc --noEmit 2>&1 | grep -E "update\.ts" | head -20`
  Expected: no errors specific to `update.ts`.

---

### Task 12: Remove the onNameChange hook from LinkTypeResource

**Files:**
- Modify: `tools/data-handler/src/resources/link-type-resource.ts`

The cascade that `onNameChange` used to do (rewrite calculations, handlebars, card content, card metadata link references) now lives in `LinkTypeRenameHandler`. The resource class should keep only file I/O and the prefix-rewrite logic that runs on rename.

- [ ] **Step 1: Take the migration-imp end-state**

  Run:
  ```bash
  git checkout migration-imp -- tools/data-handler/src/resources/link-type-resource.ts
  ```

- [ ] **Step 2: Verify the cascade is removed**

  Open the file. Confirm:
  - `onNameChange` method is **absent**
  - `rename()` method only does `super.rename(newName)` + prefix rewrites + `await this.write()` (no calls to `updateCardLinks`, `updateHandleBars`, `updateCalculations`, `updateCardContentReferences`)
  - No imports of cascade-related utilities that would now be dead

  If you see the old `onNameChange` method still present, you've checked out the wrong revision — try again.

- [ ] **Step 3: Check for callers of LinkTypeResource that expected the old behavior**

  Run:
  ```bash
  git grep -n "onNameChange\b" -- tools/data-handler/src
  ```
  Expected: zero hits in `tools/data-handler/src` (the hook was only on the LinkType subclass; we just removed it). If hits remain in tests, they're addressed in Task 15.

---

### Task 13: Build the data-handler package

**Files:** none

- [ ] **Step 1: Full TypeScript build**

  Run: `pnpm --filter=@cyberismo/data-handler build`
  Expected: success. If errors remain:
  - Missing import → trace to which task should have brought the file in. Most likely candidates: an additional helper file used by `plan.ts` or one of the handlers that wasn't covered above.
  - Type mismatch on a `ConfigurationLogger.log*` call → find the file (`git grep`) and migrate the callsite to the new shape (same pattern as Tasks 10–11).
  - Reference to a deleted symbol (`ConfigurationOperation`) → remove the now-dead import line.

  Resolve all errors before moving on. **Do not skip TypeScript errors with `// @ts-ignore`.**

- [ ] **Step 2: Commit the wiring**

  Run:
  ```bash
  git add tools/data-handler/src/
  git commit -m "feat(mutations): wire LinkType through the engine; logger reshape

- configuration-logger: operation enum -> kind discriminator,
  parameters -> payload. MODULE_REMOVE log call deleted in
  commands/remove.ts (the new union has no module kind);
  PROJECT_RENAME callsite in commands/rename.ts re-emitted in
  the new shape.
- commands/remove.ts: LinkType deletes route to ResourceMutations;
  other resource types unchanged.
- commands/update.ts: LinkType edits + renames route to
  ResourceMutations; other types unchanged (their dedicated PRs
  will widen the routing).
- resources/link-type-resource.ts: onNameChange hook removed; the
  cascade now lives in LinkTypeRenameHandler."
  ```

---

### Task 14: Pull foundation + LinkType tests

**Files:**
- Create: `tools/data-handler/test/mutations/fingerprint.test.ts`
- Create: `tools/data-handler/test/mutations/dispatcher.test.ts`
- Create: `tools/data-handler/test/mutations/plan.test.ts`
- Create: `tools/data-handler/test/mutations/bypass-fingerprint.test.ts`
- Create: `tools/data-handler/test/mutations/integration.test.ts`
- Create: `tools/data-handler/test/mutations/cascades/rewrite-refs.test.ts`
- Create: `tools/data-handler/test/mutations/handlers/link-type-rename.test.ts`
- Create: `tools/data-handler/test/mutations/handlers/link-type-delete.test.ts`
- Create: `tools/data-handler/test/mutations/integration-link-type-delete.test.ts`

- [ ] **Step 1: Pull all foundation + LinkType test files**

  Run:
  ```bash
  git checkout migration-imp -- \
    tools/data-handler/test/mutations/fingerprint.test.ts \
    tools/data-handler/test/mutations/dispatcher.test.ts \
    tools/data-handler/test/mutations/plan.test.ts \
    tools/data-handler/test/mutations/bypass-fingerprint.test.ts \
    tools/data-handler/test/mutations/integration.test.ts \
    tools/data-handler/test/mutations/cascades/rewrite-refs.test.ts \
    tools/data-handler/test/mutations/handlers/link-type-rename.test.ts \
    tools/data-handler/test/mutations/handlers/link-type-delete.test.ts \
    tools/data-handler/test/mutations/integration-link-type-delete.test.ts
  ```

- [ ] **Step 2: Verify imports**

  Spot-check each test's imports. Each should reference only:
  - Files added in this PR
  - Files already on `main` (helpers like `test/helpers/test-utils.ts`, fixtures under `test/test-data/`)
  - Vitest (`from 'vitest'`)

  If a test imports something only on migration-imp outside PR1's scope (e.g., a new fixture or helper added by a later PR), pull that file too.

- [ ] **Step 3: package.json cherry-pick (mutations export only)**

  Vitest is already on `main` (`tools/data-handler/package.json` has `"test": "vitest"`) — no Vitest config or dev-dependency migration needed.

  The only PR1-relevant change in `migration-imp`'s `package.json` is the new `mutations` export. Add it by hand-edit (do **not** `git checkout migration-imp -- tools/data-handler/package.json` — that branch also has a stale version downgrade and a regression that removes the `engines.node >=22` block; neither belongs in PR1):

  ```json
  "exports": {
    ".": "./dist/index.js",
    "./interfaces/*": "./dist/interfaces/*.js",
    "./types/*": "./dist/types/*.js",
    "./mutations/*": "./dist/mutations/*.js",
    "./macros/*": "./dist/macros/*.js",
    "./utils/*": "./dist/utils/*.js"
  }
  ```

  No lockfile change is needed for this edit.

- [ ] **Step 4: Run the new tests**

  Run: `pnpm --filter=@cyberismo/data-handler test`
  (Or whichever script runs Vitest — check `package.json` scripts.)

  Expected: all new `test/mutations/**` tests pass. If a test fails:
  - Read the failure carefully; it likely indicates a missing file or shape mismatch.
  - If it asserts against a helper that doesn't exist on main, pull the helper.

---

### Task 15: Update existing tests broken by the configuration-logger reshape

**Files:**
- Modify: `tools/data-handler/test/utils/configuration-logger.test.ts`
- Modify: `tools/data-handler/test/resources/breaking-change-classification.test.ts`

- [ ] **Step 1: Take migration-imp's end-state for both**

  Run:
  ```bash
  git checkout migration-imp -- \
    tools/data-handler/test/utils/configuration-logger.test.ts \
    tools/data-handler/test/resources/breaking-change-classification.test.ts
  ```

- [ ] **Step 2: Verify these tests use the new shape**

  Open each. Confirm:
  - No imports of `ConfigurationOperation` (the enum is gone)
  - Assertions use `.kind` instead of `.operation`
  - Assertions use `.payload` instead of `.parameters`

- [ ] **Step 3: Run the data-handler test suite**

  Run: `pnpm --filter=@cyberismo/data-handler test`
  Expected: all tests pass. If something else broke (e.g. `test/version.test.ts`, `test/resources.test.ts`, `test/resource-cache.test.ts`, `test/command-update.test.ts`), it's probably because the test imports the old `ConfigurationOperation` enum or asserts on the old shape.

  Resolution pattern: `git diff main..migration-imp -- tools/data-handler/test/<file>` shows what migration-imp did to fix it. Pull the test file if the changes are pure logger-shape adjustments. If migration-imp's version of the test relies on a handler we don't have in PR1, hand-edit instead.

- [ ] **Step 4: Commit tests**

  Run:
  ```bash
  git add tools/data-handler/test/
  git commit -m "test: foundation + LinkType handler tests; update existing tests for new logger shape"
  ```

---

### Task 16: Full repo build + lint

**Files:** none

- [ ] **Step 1: Build everything**

  Run: `pnpm build`
  Expected: success across all packages. The CLI, backend, MCP server, and app should all still build (PR1 only touches `data-handler` source).

  If a downstream package fails to build:
  - It likely uses `ConfigurationOperation` or the old log entry shape via `@cyberismo/data-handler`'s public exports.
  - Resolution: either expose a compat shim in `data-handler` exports, or migrate the consumer. Prefer migration — PR1 owns the breaking change cleanly.
  - Common candidates: `tools/backend/`, `tools/cli/`, `tools/mcp/`. Run `git grep -n "ConfigurationOperation" tools/{backend,cli,mcp}` to find callers.

- [ ] **Step 2: Lint**

  Run: `pnpm lint`
  Expected: success. Fix any introduced violations (unused imports from the deleted enum are the most likely).

- [ ] **Step 3: Prettier check**

  Run: `pnpm prettier-check`
  Expected: success. If not, run `pnpm prettier-fix` and commit the formatting fixes.

- [ ] **Step 4: Full test suite**

  Run: `pnpm test`
  Expected: success. If a downstream package's tests use `ConfigurationOperation` or the old shape, fix the same way as Step 1.

- [ ] **Step 5: Commit any fixups**

  ```bash
  git status
  # If anything is dirty, review it carefully — only commit changes that are
  # logger-shape fixups or downstream-import updates. Anything else needs
  # a second look before committing.
  git add -A
  git commit -m "chore: downstream fixups for logger reshape"
  ```

---

### Task 17: Manual smoke test of the LinkType engine path

**Files:** none

- [ ] **Step 1: Build the CLI**

  Run: `pnpm --filter=@cyberismo/cli build`
  Expected: success.

- [ ] **Step 2: Set up a scratch project**

  Run:
  ```bash
  rm -rf /tmp/cyberismo-pr1-smoke
  pnpm --filter=@cyberismo/cli exec cyberismo create project /tmp/cyberismo-pr1-smoke smoke "Smoke test"
  cd /tmp/cyberismo-pr1-smoke
  ```

- [ ] **Step 3: Create a link type, then rename it, then delete it**

  ```bash
  pnpm --filter=@cyberismo/cli exec cyberismo create linkType smoke/myLink
  pnpm --filter=@cyberismo/cli exec cyberismo rename smoke/myLink smoke/renamedLink
  pnpm --filter=@cyberismo/cli exec cyberismo remove linkType smoke/renamedLink
  ```

  Expected: each command succeeds. The migration log is JSONL at `.cards/local/resources/migrations/current/migrationLog.jsonl` (see `ProjectPaths.configurationChangesLog` if the structure ever changes). After the rename, the log has an entry with `kind: 'resource_rename'`; after the delete, an entry with `kind: 'resource_delete'`. Both have `target` matching the LinkType resource name and a non-empty `payload`.

  Inspect:
  ```bash
  cat /tmp/cyberismo-pr1-smoke/.cards/local/resources/migrations/current/migrationLog.jsonl
  ```

- [ ] **Step 4: Cleanup**

  ```bash
  cd /var/home/samu/cyberismo
  rm -rf /tmp/cyberismo-pr1-smoke
  ```

- [ ] **Step 5: No commit needed** — this is a sanity check, not a code change.

---

### Task 18: Push the branch and open the PR

**Files:** none

- [ ] **Step 1: Final git status check**

  Run: `git status && git log --oneline origin/main..HEAD`
  Expected: clean working tree; commits visible — roughly 3 commits (foundation engine + LinkType handlers / wiring + logger / tests). A 4th commit may exist if Task 16 needed downstream fixups.

- [ ] **Step 2: Push the branch**

  Run: `git push -u origin pr1-foundation-linktype`
  Expected: push succeeds.

- [ ] **Step 3: Open the PR against main**

  Run:
  ```bash
  gh pr create --base main --title "PR1: Mutation engine foundation + LinkType end-to-end" --body "$(cat <<'EOF'
## Summary

First of ten PRs splitting the `migration-imp` branch.

- Adds `tools/data-handler/src/mutations/` — new mutation engine: handler interface, dispatcher, fingerprint, ResourceMutations (plan/apply), cascade rewrite utilities, default no-cascade handler.
- Wires **LinkType** rename and delete through the engine end-to-end. Other resource types still use their existing in-class code paths and will be migrated in subsequent PRs.
- Reshapes `ConfigurationLogger` entry shape: `operation` enum → `kind` discriminator, `parameters` → `payload`. The orphaned `MODULE_REMOVE` log call in `commands/remove.ts` is removed (the new `MigrationEntryKind` union has no equivalent); the `PROJECT_RENAME` callsite in `commands/rename.ts` is re-emitted in the new shape.
- Removes the `onNameChange` cascade hook from `LinkTypeResource` — its cascade now lives in `LinkTypeRenameHandler`. Hooks on other resource subclasses are untouched (they're load-bearing until their handler PR lands).

## Test plan

- [ ] pnpm build is green across all packages
- [ ] pnpm test is green
- [ ] pnpm lint is green
- [ ] Manual: create a LinkType, rename it, delete it via the CLI; verify entries in the migration log at `.cards/local/resources/migrations/current/migrationLog.jsonl`
- [ ] Manual: confirm no other resource type's CLI behavior changed (CardType update/rename/delete, Workflow, FieldType all still work via the old paths)

## Follow-up PRs

This PR is the foundation. The remaining nine PRs land into a temporary `migration-integration` branch (per the split spec):
- PR2: CardType handlers
- PR3: FieldType handlers
- PR4: Workflow handlers
- PR5: Leaf renames (Calculation, Report, GraphModel, GraphView, Template)
- PR6: ProjectRename
- PR7: "Handlers own cascade" cleanup (deletes the `onNameChange` hooks on the remaining resources)
- PR8: Module-update replay engine
- PR9: HTTP routes + SSE
- PR10: Validation gate + local-only scoping

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
  ```

- [ ] **Step 4: Verify CI starts**

  Run: `gh pr view --json url,statusCheckRollup`
  Expected: PR URL returned, CI checks queued/running.

---

## Recovery / rollback

If at any point a task leaves the working tree in a bad state:
- `git reset --hard HEAD` discards uncommitted changes
- `git restore <path>` restores a single file
- `git checkout origin/main -- <path>` resets a file to main's state
- The PR1 branch can be deleted and recreated from `origin/main` at any time before push — nothing is shared until Task 18 pushes the branch.

## Open questions to resolve during execution

1. **Helper files used by foundation tests.** If a test imports e.g. `tools/data-handler/test/helpers/mutation-helpers.ts` that doesn't exist on main, pull it. (Inspection at plan time found no such helpers — the foundation tests only import from `src/` and `vitest`. Re-check during execution in case `migration-imp` drifts.)
2. **Downstream package consumers of `ConfigurationOperation`.** Task 16 will surface them. The CLI / MCP / backend may import `ConfigurationOperation` or the old `ConfigurationLogEntry` from `@cyberismo/data-handler` exports — if so, migrate them in PR1.

## Anti-goals

- Routing CardType, FieldType, Workflow, or any other non-LinkType resource through the engine in this PR. Their `commands/*` code paths stay exactly as they are on `main`.
- Deleting `onNameChange` from any subclass other than `LinkTypeResource`. The deletion sweep is PR7.
- Pulling tests from `test/mutations/handlers/` or `test/mutations/integration-*.test.ts` other than the LinkType ones — those tests reference handlers PR1 doesn't ship and will fail to import.
- Squashing commits during execution. Commit cadence per task; the final PR keeps the granular history.
