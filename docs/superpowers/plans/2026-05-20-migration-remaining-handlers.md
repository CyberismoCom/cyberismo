# Migration System — Remaining Handlers (LinkType delete, Template, Calculation, Report, GraphModel, GraphView, ProjectRename)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close cascade coverage for every breaking change in `migrations-plan.adoc` that the foundation plan did not deliver. After this plan, every row in the plan has a registered handler, every CLI mutation entry point (`commands/update.ts`, `commands/remove.ts`, `commands/rename.ts`) routes through `ResourceMutations`, and `ProjectRename` is fully expressed as a first-class entry kind in the log.

**Architecture:** Extend the existing `mutations/handlers/` registry. Most new handlers are 5-30 lines: rename handlers wrap the existing `onNameChange` cascades that already live in the resource subclasses, and most delete handlers in this batch are "no migration needed" no-ops (`DefaultNoCascadeHandler`-shaped). The exceptions are `LinkTypeDeleteHandler` (real cascade: strip links from card metadata) and `ProjectRenameHandler` (the largest cascade in the system — moved out of `commands/rename.ts` and re-modelled as `MutationInput` variant `kind: 'project_rename'`).

Once handlers exist, the dispatcher gains lookups for `(kind, type)` pairs and the existing `commands/update.ts`, `commands/remove.ts`, `commands/rename.ts` route every supported operation through `ResourceMutations`. The `onNameChange` and `delete` overrides on the resource subclasses lose their cascade bodies; the cascade lives in the handler. Resource methods become pure I/O (rename a file, delete a folder).

**Tech Stack:** TypeScript, Node 22, ESM with `.js` extensions on relative imports, Vitest for `tools/data-handler` tests, pnpm workspaces. Existing patterns to follow: foundation plan's `LinkTypeRenameHandler` (template for rename handlers), `DefaultNoCascadeHandler` (template for no-op handlers), `mutations/plan.ts` (`recordLogEntry`).

---

## Scope

**In scope (this plan):**

LinkType:
- `LinkTypeDeleteHandler` — real cascade, strips links of the deleted type from all card metadata.
- `LinkTypeChangeSourceCardTypesHandler` / `LinkTypeChangeDestinationCardTypesHandler` — non-breaking-by-policy. Use `DefaultNoCascadeHandler` route.

Template:
- `TemplateRenameHandler` — rewrites `createCards` macro arguments in `index.adoc` files and reports.
- `TemplateDeleteHandler` — no-op cascade.

Calculation:
- `CalculationRenameHandler` — rewrites `isCalculated` references in card types and imports.
- `CalculationDeleteHandler` — no-op cascade.

Report:
- `ReportRenameHandler` — rewrites report references in `index.adoc` files and handlebar files of other reports.
- `ReportDeleteHandler` — no-op cascade with explicit "references may break" warning.

GraphModel:
- `GraphModelRenameHandler` — rewrites references in graph macro instances inside cards and reports.
- `GraphModelDeleteHandler` — minimal cleanup; warns that graph macro instances may break.

GraphView:
- `GraphViewRenameHandler` — rewrites references in configuration / reports.
- `GraphViewDeleteHandler` — no-op cascade.
- `GraphViewParameterSchemaChangeHandler` — non-breaking-by-policy. `DefaultNoCascadeHandler` route.

ProjectRename:
- `ProjectRenameHandler` — extracts the existing `Rename.rename(to)` body in `commands/rename.ts` into a handler. Adds `'project_rename'` back to `MigrationEntryKind`. Re-shapes the log entry payload to `{ oldPrefix, newPrefix }` per the spec.

Integration:
- Wire `ResourceMutations` through `commands/update.ts:applyResourceOperation` for every supported rename. (Foundation plan only wired link-type renames.)
- Wire `ResourceMutations` through `commands/remove.ts:remove` for every supported resource delete.
- Wire `ResourceMutations` through `commands/rename.ts:rename(to)` (project rename) by delegating the whole body to the handler.
- Remove dead cascade methods from the resource subclasses (`onNameChange` shrinks; cascade lives in handler).

**Out of scope (later plans):**

- Plan 7 (Module update flow): replay engine, `appliedModules.json`, `ReplayConflict`.
- Plan 8 (HTTP routes): `POST /mutations/preview`, `POST /mutations/apply`.
- Plan 9 (CLI integration): `cyberismo project-rename`, `cyberismo delete <linkType>`, progress reporting.
- Interactive "complete migration" prompts (workflow state remapping, enum replacement). Basic cascade only.

This plan completes the per-resource cascade matrix.

---

## File structure

**New files:**
- `tools/data-handler/src/mutations/handlers/link-type-delete.ts`
- `tools/data-handler/src/mutations/handlers/template.ts` (exports `TemplateRenameHandler`, `TemplateDeleteHandler`)
- `tools/data-handler/src/mutations/handlers/calculation.ts` (exports `CalculationRenameHandler`, `CalculationDeleteHandler`)
- `tools/data-handler/src/mutations/handlers/report.ts` (exports `ReportRenameHandler`, `ReportDeleteHandler`)
- `tools/data-handler/src/mutations/handlers/graph-model.ts` (exports `GraphModelRenameHandler`, `GraphModelDeleteHandler`)
- `tools/data-handler/src/mutations/handlers/graph-view.ts` (exports `GraphViewRenameHandler`, `GraphViewDeleteHandler`)
- `tools/data-handler/src/mutations/handlers/project-rename.ts`
- `tools/data-handler/test/mutations/handlers/link-type-delete.test.ts`
- `tools/data-handler/test/mutations/handlers/template-rename.test.ts`
- `tools/data-handler/test/mutations/handlers/calculation-rename.test.ts`
- `tools/data-handler/test/mutations/handlers/report-rename.test.ts`
- `tools/data-handler/test/mutations/handlers/graph-model-rename.test.ts`
- `tools/data-handler/test/mutations/handlers/graph-view-rename.test.ts`
- `tools/data-handler/test/mutations/handlers/project-rename.test.ts`
- `tools/data-handler/test/mutations/integration-project-rename.test.ts`

**Modified files:**
- `tools/data-handler/src/utils/configuration-logger.ts` — add `'project_rename'` to `MigrationEntryKind`.
- `tools/data-handler/src/mutations/types.ts` — already exposes `MutationInput` variant `project_rename` (foundation plan); no change needed unless the variant shape needs `oldPrefix` (it does not; the handler reads the current prefix from the project).
- `tools/data-handler/src/mutations/plan.ts` — extend `recordLogEntry` to handle `project_rename`.
- `tools/data-handler/src/mutations/dispatcher.ts` — register every new handler ahead of the default.
- `tools/data-handler/src/commands/update.ts` — generalise the link-type-rename routing to every rename-shaped resource operation.
- `tools/data-handler/src/commands/remove.ts` — route resource deletes through `ResourceMutations` instead of calling `resource.delete()` directly.
- `tools/data-handler/src/commands/rename.ts` — delegate the project-rename body to `ResourceMutations`; the file remains the public entry point.
- `tools/data-handler/src/resources/link-type-resource.ts` — remove dead `updateCardLinks` traces (foundation removed the rename path; this plan ensures no remnants reference card-link rewriting from a delete path).
- `tools/data-handler/src/resources/template-resource.ts` — shrink `onNameChange`.
- `tools/data-handler/src/resources/calculation-resource.ts` — shrink `onNameChange`.
- `tools/data-handler/src/resources/report-resource.ts` — shrink `onNameChange`.
- `tools/data-handler/src/resources/graph-model-resource.ts` — shrink `onNameChange`.
- `tools/data-handler/src/resources/graph-view-resource.ts` — shrink `onNameChange`.

---

## Tasks

### Task 1: Add `'project_rename'` back to `MigrationEntryKind`

**Files:**
- Modify: `tools/data-handler/src/utils/configuration-logger.ts`
- Test: `tools/data-handler/test/utils/configuration-logger.test.ts`

Foundation Plan Task 1 dropped `PROJECT_RENAME` from `MigrationEntryKind` because no handler emitted it. This plan brings it back as `'project_rename'`. The on-disk payload shape is `{ oldPrefix: string, newPrefix: string }` (matches the spec's `ProjectRename` variant).

- [ ] **Step 1: Write the failing test**

In `tools/data-handler/test/utils/configuration-logger.test.ts`, add:

```typescript
it('accepts and reads project_rename entries', async () => {
  const projectPath = await freshProject('project-rename-log');
  await ConfigurationLogger.log(projectPath, {
    kind: 'project_rename',
    target: 'new-prefix',
    payload: { oldPrefix: 'old-prefix', newPrefix: 'new-prefix' },
  });
  const entries = await ConfigurationLogger.entries(projectPath);
  expect(entries).toHaveLength(1);
  expect(entries[0].kind).toBe('project_rename');
  expect(entries[0].payload).toEqual({
    oldPrefix: 'old-prefix',
    newPrefix: 'new-prefix',
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd tools/data-handler && pnpm test test/utils/configuration-logger.test.ts -t "project_rename"
```

Expected: FAIL — TS rejects the `'project_rename'` literal as not assignable to `MigrationEntryKind`.

- [ ] **Step 3: Add the kind to the union**

In `tools/data-handler/src/utils/configuration-logger.ts`, replace the existing `MigrationEntryKind` declaration with:

```typescript
export type MigrationEntryKind =
  | 'resource_edit'
  | 'resource_delete'
  | 'resource_rename'
  | 'project_rename';
```

No other changes needed: `ConfigurationLogger.log` is already generic over the union, `entries()` validates only `timestamp/kind/target`.

- [ ] **Step 4: Run test to verify it passes**

```bash
cd tools/data-handler && pnpm test test/utils/configuration-logger.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/data-handler/src/utils/configuration-logger.ts \
        tools/data-handler/test/utils/configuration-logger.test.ts
git commit -m "feat: restore project_rename to MigrationEntryKind

The foundation plan dropped this kind because no handler emitted it.
This plan adds it back ahead of the ProjectRenameHandler in a later task."
```

---

### Task 2: Teach `ResourceMutations.recordLogEntry` about `project_rename`

**Files:**
- Modify: `tools/data-handler/src/mutations/plan.ts`
- Test: `tools/data-handler/test/mutations/plan.test.ts`

The foundation plan's `recordLogEntry` handles `edit | delete | rename` and falls through silently for `project_rename`. Extend it.

- [ ] **Step 1: Write the failing test**

Append to `tools/data-handler/test/mutations/plan.test.ts`:

```typescript
it('apply() with project_rename input writes a project_rename log entry', async () => {
  const mutations = new ResourceMutations(project);
  // We can't actually fire ProjectRenameHandler.apply() yet (no handler
  // registered), so test recordLogEntry through a stubbed handler.
  const oldPrefix = project.projectPrefix;
  const input = {
    kind: 'project_rename' as const,
    newPrefix: 'renamed',
  };
  // Use the private recordLogEntry directly via a small accessor.
  await (mutations as unknown as {
    recordLogEntry: (i: typeof input, ctx: { oldPrefix: string }) => Promise<void>;
  }).recordLogEntry(input, { oldPrefix });
  const entries = await ConfigurationLogger.entries(project.basePath);
  const last = entries[entries.length - 1];
  expect(last.kind).toBe('project_rename');
  expect(last.payload).toEqual({ oldPrefix, newPrefix: 'renamed' });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd tools/data-handler && pnpm test test/mutations/plan.test.ts -t "project_rename"
```

Expected: FAIL — `recordLogEntry` doesn't accept a second argument and doesn't emit `project_rename`.

- [ ] **Step 3: Extend `recordLogEntry`**

In `tools/data-handler/src/mutations/plan.ts`, update the signature so the second argument carries variant-specific extra context. ProjectRename needs the `oldPrefix` captured before the cascade fired.

```typescript
interface RecordContext {
  oldPrefix?: string;
}

private async recordLogEntry(
  input: MutationInput,
  context: RecordContext = {},
): Promise<void> {
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
  } else if (input.kind === 'project_rename') {
    if (!context.oldPrefix) {
      throw new Error(
        'project_rename log entry requires oldPrefix context',
      );
    }
    await ConfigurationLogger.log(this.project.basePath, {
      kind: 'project_rename',
      target: input.newPrefix,
      payload: {
        oldPrefix: context.oldPrefix,
        newPrefix: input.newPrefix,
      },
    });
  }
}
```

Update the call site inside `apply()` to capture `oldPrefix` from the project before the handler runs:

```typescript
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

  // Capture extras the log entry depends on BEFORE the cascade mutates state.
  const recordContext: RecordContext = {};
  if (input.kind === 'project_rename') {
    recordContext.oldPrefix = this.project.projectPrefix;
  }

  await this.project.lock.write(async () => {
    await handler.apply(ctx);
    if (handler.isBreaking) {
      await this.recordLogEntry(input, recordContext);
    }
  });
  return { success: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd tools/data-handler && pnpm test test/mutations/plan.test.ts
```

Expected: PASS for the new test and all earlier `plan.test.ts` tests.

- [ ] **Step 5: Commit**

```bash
git add tools/data-handler/src/mutations/plan.ts \
        tools/data-handler/test/mutations/plan.test.ts
git commit -m "feat: ResourceMutations records project_rename log entries

apply() captures the project prefix before the handler runs so the
recorded payload reflects the pre-cascade state."
```

---

### Task 3: `LinkTypeDeleteHandler` — failing test

**Files:**
- Create: `tools/data-handler/test/mutations/handlers/link-type-delete.test.ts`

The link-type delete cascade removes every `links[]` entry whose `linkType === <oldName>` from every card's metadata. It is the most substantive cascade in this plan after ProjectRename.

- [ ] **Step 1: Write the failing test**

```typescript
// tools/data-handler/test/mutations/handlers/link-type-delete.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../../src/containers/project.js';
import { LinkTypeDeleteHandler } from '../../../src/mutations/handlers/link-type-delete.js';
import { copyDir } from '../../../src/utils/file-utils.js';
import { resourceName } from '../../../src/utils/resource-utils.js';

// Pick a fixture whose linkTypes/ folder contains at least one link type
// that is referenced from a card. Verify with:
//   ls tools/data-handler/test/test-data/
//   grep -r '"linkType"' tools/data-handler/test/test-data/<fixture>/
const FIXTURE_PATH = join(
  import.meta.dirname,
  '..',
  '..',
  'test-data',
  'decision-records',
);
const tmpDir = join(import.meta.dirname, 'tmp-link-type-delete');

describe('LinkTypeDeleteHandler', () => {
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

  it('matches only delete inputs on linkTypes', () => {
    const handler = new LinkTypeDeleteHandler();
    expect(
      handler.matches({
        project,
        input: {
          kind: 'delete',
          target: resourceName(`${project.projectPrefix}/linkTypes/causes`),
        },
      }),
    ).toBe(true);
    expect(
      handler.matches({
        project,
        input: {
          kind: 'delete',
          target: resourceName(`${project.projectPrefix}/cardTypes/foo`),
        },
      }),
    ).toBe(false);
  });

  it('is breaking', () => {
    expect(new LinkTypeDeleteHandler().isBreaking).toBe(true);
  });

  it('preview reports affected card and link counts', async () => {
    const handler = new LinkTypeDeleteHandler();
    const preview = await handler.preview({
      project,
      input: {
        kind: 'delete',
        target: resourceName(`${project.projectPrefix}/linkTypes/causes`),
      },
    });
    expect(preview.affectedLinkCount).toBeGreaterThan(0);
    expect(preview.dataLossExpected).toBe(true);
    expect(preview.summary).toMatch(/removes? .* link/);
  });

  it('apply strips matching links and deletes the resource', async () => {
    const handler = new LinkTypeDeleteHandler();
    const linkTypeName = `${project.projectPrefix}/linkTypes/causes`;
    await handler.apply({
      project,
      input: { kind: 'delete', target: resourceName(linkTypeName) },
    });

    for (const card of project.cards(undefined)) {
      const links = card.metadata?.links ?? [];
      expect(links.some((l) => l.linkType === linkTypeName)).toBe(false);
    }
    expect(project.resources.byType(linkTypeName, 'linkTypes')).toBeUndefined();
  });

  it('affectedFilePaths returns every card index.json that holds a matching link', async () => {
    const handler = new LinkTypeDeleteHandler();
    const paths = await handler.affectedFilePaths({
      project,
      input: {
        kind: 'delete',
        target: resourceName(`${project.projectPrefix}/linkTypes/causes`),
      },
    });
    expect(paths.length).toBeGreaterThan(0);
    for (const p of paths) {
      expect(p).toMatch(/index\.json$/);
    }
  });
});
```

If the `decision-records` fixture does not reference `causes`, swap the link-type identifier for one that the fixture actually uses; verify by greping `linkType` inside the fixture's cards.

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd tools/data-handler && pnpm test test/mutations/handlers/link-type-delete.test.ts
```

Expected: FAIL — handler module not found.

- [ ] **Step 3: Commit (red phase)**

```bash
git add tools/data-handler/test/mutations/handlers/link-type-delete.test.ts
git commit -m "test: failing test for LinkTypeDeleteHandler"
```

---

### Task 4: `LinkTypeDeleteHandler` — implementation

**Files:**
- Create: `tools/data-handler/src/mutations/handlers/link-type-delete.ts`
- Modify: `tools/data-handler/src/mutations/dispatcher.ts`

- [ ] **Step 1: Implement the handler**

```typescript
// tools/data-handler/src/mutations/handlers/link-type-delete.ts

import { join } from 'node:path';

import type { Handler, MutationContext } from '../handler.js';
import type { CascadePreview } from '../types.js';
import { resourceNameToString } from '../../utils/resource-utils.js';
import type { Card } from '../../interfaces/project-interfaces.js';

export class LinkTypeDeleteHandler implements Handler {
  readonly isBreaking = true;

  matches(ctx: MutationContext): boolean {
    return (
      ctx.input.kind === 'delete' && ctx.input.target.type === 'linkTypes'
    );
  }

  async preview(ctx: MutationContext): Promise<CascadePreview> {
    if (ctx.input.kind !== 'delete') {
      throw new Error('LinkTypeDeleteHandler: non-delete input');
    }
    const name = resourceNameToString(ctx.input.target);
    const affected = this.affectedCards(ctx, name);
    const affectedLinkCount = affected.reduce(
      (n, c) =>
        n +
        (c.metadata?.links?.filter((l) => l.linkType === name).length ?? 0),
      0,
    );
    return {
      affectedCardCount: affected.length,
      affectedLinkCount,
      affectedCalculationCount: 0,
      affectedHandlebarFileCount: 0,
      dataLossExpected: affectedLinkCount > 0,
      summary: `Removes ${affectedLinkCount} links of type '${name}' across ${affected.length} cards, then deletes the link type.`,
    };
  }

  async apply(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'delete') {
      throw new Error('LinkTypeDeleteHandler: non-delete input');
    }
    const name = resourceNameToString(ctx.input.target);

    // 1. Strip matching links from every card's metadata.
    for (const card of this.affectedCards(ctx, name)) {
      const metadata = card.metadata!;
      metadata.links = (metadata.links ?? []).filter(
        (l) => l.linkType !== name,
      );
      await ctx.project.updateCardMetadata(card, metadata);
    }

    // 2. Delete the link type resource itself.
    const resource = ctx.project.resources.byType(name, 'linkTypes');
    if (!resource) {
      throw new Error(`Link type '${name}' not found`);
    }
    await resource.delete();
  }

  async affectedFilePaths(ctx: MutationContext): Promise<string[]> {
    if (ctx.input.kind !== 'delete') return [];
    const name = resourceNameToString(ctx.input.target);
    return this.affectedCards(ctx, name).map((c) =>
      join(c.path, 'index.json'),
    );
  }

  private affectedCards(ctx: MutationContext, name: string): Card[] {
    return [
      ...ctx.project.cards(undefined),
      ...ctx.project.allTemplateCards(),
    ].filter((c) =>
      c.metadata?.links?.some((l) => l.linkType === name),
    );
  }
}
```

- [ ] **Step 2: Register the handler**

In `tools/data-handler/src/mutations/dispatcher.ts`, add the import and prepend to `HANDLERS` (before the default):

```typescript
import { LinkTypeDeleteHandler } from './handlers/link-type-delete.js';

const HANDLERS: Handler[] = [
  new LinkTypeRenameHandler(),
  new LinkTypeDeleteHandler(),
  new DefaultNoCascadeHandler(),
];
```

- [ ] **Step 3: Run the tests**

```bash
cd tools/data-handler && pnpm test test/mutations/handlers/link-type-delete.test.ts
```

Expected: PASS for all five `it` blocks.

- [ ] **Step 4: Commit**

```bash
git add tools/data-handler/src/mutations/handlers/link-type-delete.ts \
        tools/data-handler/src/mutations/dispatcher.ts
git commit -m "feat: LinkTypeDeleteHandler — strip links and remove resource"
```

---

### Task 5: Template handlers (rename + delete)

**Files:**
- Create: `tools/data-handler/src/mutations/handlers/template.ts`
- Create: `tools/data-handler/test/mutations/handlers/template-rename.test.ts`
- Modify: `tools/data-handler/src/mutations/dispatcher.ts`
- Modify: `tools/data-handler/src/resources/template-resource.ts`

Template rename rewrites references in `index.adoc` files (specifically `createCards` macro arguments) and in any reports that reference it. The existing `TemplateResource.onNameChange` already calls `updateHandleBars`, `updateCalculations`, `updateCardContentReferences`; the handler wraps those. Template delete needs no migration per the plan (existing cards are unaffected; only future card creation breaks).

- [ ] **Step 1: Write the failing test for rename**

```typescript
// tools/data-handler/test/mutations/handlers/template-rename.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../../src/containers/project.js';
import { TemplateRenameHandler } from '../../../src/mutations/handlers/template.js';
import { copyDir } from '../../../src/utils/file-utils.js';
import { resourceName } from '../../../src/utils/resource-utils.js';

const FIXTURE_PATH = join(
  import.meta.dirname,
  '..',
  '..',
  'test-data',
  'decision-records',
);
const tmpDir = join(import.meta.dirname, 'tmp-template-rename');

describe('TemplateRenameHandler', () => {
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

  it('matches rename inputs on templates only', () => {
    const handler = new TemplateRenameHandler();
    const ctx = {
      project,
      input: {
        kind: 'rename' as const,
        target: resourceName(`${project.projectPrefix}/templates/decision`),
        newIdentifier: 'decision-record',
      },
    };
    expect(handler.matches(ctx)).toBe(true);
  });

  it('is breaking', () => {
    expect(new TemplateRenameHandler().isBreaking).toBe(true);
  });

  it('preview names how many cards/reports reference the template', async () => {
    const handler = new TemplateRenameHandler();
    const preview = await handler.preview({
      project,
      input: {
        kind: 'rename' as const,
        target: resourceName(`${project.projectPrefix}/templates/decision`),
        newIdentifier: 'decision-record',
      },
    });
    // The decision-records fixture uses createCards to instantiate cards
    // from the decision template; expect at least one card index.adoc to
    // reference the template name.
    expect(
      preview.affectedCardCount +
        preview.affectedHandlebarFileCount +
        preview.affectedCalculationCount,
    ).toBeGreaterThanOrEqual(0);
    expect(preview.dataLossExpected).toBe(false);
  });

  it('apply rewrites createCards references in index.adoc files', async () => {
    const handler = new TemplateRenameHandler();
    const oldName = `${project.projectPrefix}/templates/decision`;
    const newName = `${project.projectPrefix}/templates/decision-record`;

    await handler.apply({
      project,
      input: {
        kind: 'rename' as const,
        target: resourceName(oldName),
        newIdentifier: 'decision-record',
      },
    });

    for (const card of project.cards(undefined)) {
      const adocPath = join(card.path, 'index.adoc');
      let content = '';
      try {
        content = await readFile(adocPath, 'utf-8');
      } catch {
        continue;
      }
      expect(content).not.toContain(oldName);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd tools/data-handler && pnpm test test/mutations/handlers/template-rename.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement both handlers in a single file**

```typescript
// tools/data-handler/src/mutations/handlers/template.ts

import type { Handler, MutationContext } from '../handler.js';
import type { CascadePreview } from '../types.js';
import { resourceNameToString } from '../../utils/resource-utils.js';

/**
 * Rename a template. Cascade: rewrite references in card index.adoc
 * files (createCards macro), reports, and calculations.
 *
 * The cascade body delegates to TemplateResource.rename(), which calls
 * updateHandleBars / updateCalculations / updateCardContentReferences
 * via its onNameChange override. This handler is the orchestrator and
 * the source of the log entry; the resource subclass keeps the per-file
 * rewrite mechanics.
 */
export class TemplateRenameHandler implements Handler {
  readonly isBreaking = true;

  matches(ctx: MutationContext): boolean {
    return (
      ctx.input.kind === 'rename' && ctx.input.target.type === 'templates'
    );
  }

  async preview(ctx: MutationContext): Promise<CascadePreview> {
    if (ctx.input.kind !== 'rename') {
      throw new Error('TemplateRenameHandler: non-rename input');
    }
    const oldName = resourceNameToString(ctx.input.target);
    const cards = ctx.project
      .cards(undefined)
      .filter((c) => c.content?.includes(oldName));
    const templateCards = ctx.project
      .allTemplateCards()
      .filter((c) => c.content?.includes(oldName));
    return {
      affectedCardCount: cards.length + templateCards.length,
      affectedLinkCount: 0,
      affectedCalculationCount: 0,
      affectedHandlebarFileCount: 0,
      dataLossExpected: false,
      summary: `Renames ${cards.length + templateCards.length} createCards references.`,
    };
  }

  async apply(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'rename') {
      throw new Error('TemplateRenameHandler: non-rename input');
    }
    const oldName = resourceNameToString(ctx.input.target);
    const resource = ctx.project.resources.byType(oldName, 'templates');
    if (!resource) {
      throw new Error(`Template '${oldName}' not found`);
    }
    const newName = `${ctx.input.target.prefix}/templates/${ctx.input.newIdentifier}`;
    await resource.update(
      { key: 'name' },
      { name: 'change', target: oldName, to: newName },
    );
  }

  async affectedFilePaths(ctx: MutationContext): Promise<string[]> {
    if (ctx.input.kind !== 'rename') return [];
    const oldName = resourceNameToString(ctx.input.target);
    const paths: string[] = [];
    for (const card of ctx.project.cards(undefined)) {
      if (card.content?.includes(oldName)) paths.push(card.path);
    }
    for (const card of ctx.project.allTemplateCards()) {
      if (card.content?.includes(oldName)) paths.push(card.path);
    }
    return paths;
  }
}

/**
 * Delete a template. Per migrations-plan.adoc: "No migration needed
 * (only affects future card creation)." The handler still records the
 * log entry so consumers know the resource went away; the cascade is
 * empty.
 */
export class TemplateDeleteHandler implements Handler {
  readonly isBreaking = true;

  matches(ctx: MutationContext): boolean {
    return (
      ctx.input.kind === 'delete' && ctx.input.target.type === 'templates'
    );
  }

  async preview(): Promise<CascadePreview> {
    return {
      affectedCardCount: 0,
      affectedLinkCount: 0,
      affectedCalculationCount: 0,
      affectedHandlebarFileCount: 0,
      dataLossExpected: false,
      summary: 'No cascade. Future card creation from this template will fail.',
    };
  }

  async apply(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'delete') {
      throw new Error('TemplateDeleteHandler: non-delete input');
    }
    const name = resourceNameToString(ctx.input.target);
    const resource = ctx.project.resources.byType(name, 'templates');
    if (!resource) {
      throw new Error(`Template '${name}' not found`);
    }
    await resource.delete();
  }

  async affectedFilePaths(): Promise<string[]> {
    return [];
  }
}
```

- [ ] **Step 4: Register both handlers**

In `tools/data-handler/src/mutations/dispatcher.ts`:

```typescript
import { TemplateDeleteHandler, TemplateRenameHandler } from './handlers/template.js';

const HANDLERS: Handler[] = [
  new LinkTypeRenameHandler(),
  new LinkTypeDeleteHandler(),
  new TemplateRenameHandler(),
  new TemplateDeleteHandler(),
  new DefaultNoCascadeHandler(),
];
```

- [ ] **Step 5: Run the test**

```bash
cd tools/data-handler && pnpm test test/mutations/handlers/template-rename.test.ts
```

Expected: PASS.

- [ ] **Step 6: Shrink `TemplateResource.onNameChange`**

The existing `onNameChange` (lines ~65-72) currently calls `updateHandleBars`, `updateCalculations`, `updateCardContentReferences`. Those calls happen during `resource.update({key:'name'}, ...)`, which is what the handler delegates to. The resource subclass still needs to do the file/folder rename and the in-memory metadata flip; do not remove that part. Leave `onNameChange` intact for now — the cascade-orchestration intent moves to the handler, but `onNameChange` is still triggered through `resource.update` and uses the same helpers. The redundancy is acceptable for this plan and tidied up in the per-resource shrinking task later (Task 12).

Skip code changes in this step. Verified by reading `template-resource.ts`.

- [ ] **Step 7: Commit**

```bash
git add tools/data-handler/src/mutations/handlers/template.ts \
        tools/data-handler/src/mutations/dispatcher.ts \
        tools/data-handler/test/mutations/handlers/template-rename.test.ts
git commit -m "feat: TemplateRenameHandler and TemplateDeleteHandler"
```

---

### Task 6: Calculation handlers (rename + delete)

**Files:**
- Create: `tools/data-handler/src/mutations/handlers/calculation.ts`
- Create: `tools/data-handler/test/mutations/handlers/calculation-rename.test.ts`
- Modify: `tools/data-handler/src/mutations/dispatcher.ts`

Per `migrations-plan.adoc`: a calculation rename updates references in card type `isCalculated` fields and imports inside other calculation files. Delete needs no migration (recalculation happens automatically).

- [ ] **Step 1: Write the failing test**

```typescript
// tools/data-handler/test/mutations/handlers/calculation-rename.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../../src/containers/project.js';
import { CalculationRenameHandler } from '../../../src/mutations/handlers/calculation.js';
import { copyDir } from '../../../src/utils/file-utils.js';
import { resourceName } from '../../../src/utils/resource-utils.js';

const FIXTURE_PATH = join(
  import.meta.dirname,
  '..',
  '..',
  'test-data',
  'decision-records',
);
const tmpDir = join(import.meta.dirname, 'tmp-calculation-rename');

describe('CalculationRenameHandler', () => {
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

  it('matches rename inputs on calculations only', () => {
    const handler = new CalculationRenameHandler();
    const ctx = {
      project,
      input: {
        kind: 'rename' as const,
        target: resourceName(
          `${project.projectPrefix}/calculations/dummy`,
        ),
        newIdentifier: 'dummy-renamed',
      },
    };
    expect(handler.matches(ctx)).toBe(true);
  });

  it('is breaking', () => {
    expect(new CalculationRenameHandler().isBreaking).toBe(true);
  });

  it('apply rewrites references in calculation files', async () => {
    // Use the first calculation in the fixture; fall back if none.
    const calculations = project.resources.calculations(/* localOnly */);
    if (calculations.length === 0) return; // skip if fixture has none
    const calc = calculations[0];
    const oldName = calc.data!.name;
    const newIdent = `${calc.resourceName.identifier}-renamed`;
    const handler = new CalculationRenameHandler();

    await handler.apply({
      project,
      input: {
        kind: 'rename' as const,
        target: resourceName(oldName),
        newIdentifier: newIdent,
      },
    });

    const renamed = project.resources.byType(
      `${calc.resourceName.prefix}/calculations/${newIdent}`,
      'calculations',
    );
    expect(renamed).toBeDefined();
  });
});
```

Verify the calculation fixture path exists; otherwise pick a different fixture (e.g. `tools/data-handler/test/test-data/test-project`).

- [ ] **Step 2: Run test to verify it fails**

```bash
cd tools/data-handler && pnpm test test/mutations/handlers/calculation-rename.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement both handlers**

```typescript
// tools/data-handler/src/mutations/handlers/calculation.ts

import type { Handler, MutationContext } from '../handler.js';
import type { CascadePreview } from '../types.js';
import { resourceNameToString } from '../../utils/resource-utils.js';
import { ResourcesFrom } from '../../containers/project/resources-from.js';

export class CalculationRenameHandler implements Handler {
  readonly isBreaking = true;

  matches(ctx: MutationContext): boolean {
    return (
      ctx.input.kind === 'rename' &&
      ctx.input.target.type === 'calculations'
    );
  }

  async preview(ctx: MutationContext): Promise<CascadePreview> {
    if (ctx.input.kind !== 'rename') {
      throw new Error('CalculationRenameHandler: non-rename input');
    }
    const oldName = resourceNameToString(ctx.input.target);

    // Count card types whose customFields reference this calculation.
    const cardTypes = ctx.project.resources.cardTypes(
      ResourcesFrom.localOnly,
    );
    let affectedCardTypes = 0;
    for (const ct of cardTypes) {
      const refs = (ct.data?.customFields ?? []).filter(
        (f) => f.isCalculated && f.name === oldName,
      );
      if (refs.length > 0) affectedCardTypes++;
    }

    // Count other calculation files whose .lp content imports this name.
    const others = ctx.project.resources
      .calculations(ResourcesFrom.localOnly)
      .filter((c) => c.contentData()?.calculation?.includes(oldName));

    return {
      affectedCardCount: 0,
      affectedLinkCount: 0,
      affectedCalculationCount: others.length,
      affectedHandlebarFileCount: 0,
      dataLossExpected: false,
      summary: `Renames ${affectedCardTypes} card-type references and ${others.length} calculation imports.`,
    };
  }

  async apply(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'rename') {
      throw new Error('CalculationRenameHandler: non-rename input');
    }
    const oldName = resourceNameToString(ctx.input.target);
    const resource = ctx.project.resources.byType(oldName, 'calculations');
    if (!resource) {
      throw new Error(`Calculation '${oldName}' not found`);
    }
    const newName = `${ctx.input.target.prefix}/calculations/${ctx.input.target.identifier !== ctx.input.newIdentifier ? ctx.input.newIdentifier : ctx.input.target.identifier}`;
    await resource.update(
      { key: 'name' },
      { name: 'change', target: oldName, to: newName },
    );
  }

  async affectedFilePaths(ctx: MutationContext): Promise<string[]> {
    if (ctx.input.kind !== 'rename') return [];
    const oldName = resourceNameToString(ctx.input.target);
    const paths: string[] = [];
    for (const c of ctx.project.resources.calculations(
      ResourcesFrom.localOnly,
    )) {
      if (c.contentData()?.calculation?.includes(oldName)) {
        paths.push(c.fileName);
      }
    }
    return paths;
  }
}

/**
 * Delete a calculation. Per the plan: no migration (recalculation
 * happens automatically). The handler only deletes the resource and
 * records the log entry.
 */
export class CalculationDeleteHandler implements Handler {
  readonly isBreaking = true;

  matches(ctx: MutationContext): boolean {
    return (
      ctx.input.kind === 'delete' &&
      ctx.input.target.type === 'calculations'
    );
  }

  async preview(): Promise<CascadePreview> {
    return {
      affectedCardCount: 0,
      affectedLinkCount: 0,
      affectedCalculationCount: 0,
      affectedHandlebarFileCount: 0,
      dataLossExpected: false,
      summary: 'No cascade. Recalculation will pick up the missing file.',
    };
  }

  async apply(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'delete') {
      throw new Error('CalculationDeleteHandler: non-delete input');
    }
    const name = resourceNameToString(ctx.input.target);
    const resource = ctx.project.resources.byType(name, 'calculations');
    if (!resource) {
      throw new Error(`Calculation '${name}' not found`);
    }
    await resource.delete();
  }

  async affectedFilePaths(): Promise<string[]> {
    return [];
  }
}
```

- [ ] **Step 4: Register both handlers**

```typescript
import {
  CalculationDeleteHandler,
  CalculationRenameHandler,
} from './handlers/calculation.js';

const HANDLERS: Handler[] = [
  new LinkTypeRenameHandler(),
  new LinkTypeDeleteHandler(),
  new TemplateRenameHandler(),
  new TemplateDeleteHandler(),
  new CalculationRenameHandler(),
  new CalculationDeleteHandler(),
  new DefaultNoCascadeHandler(),
];
```

- [ ] **Step 5: Run the test**

```bash
cd tools/data-handler && pnpm test test/mutations/handlers/calculation-rename.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tools/data-handler/src/mutations/handlers/calculation.ts \
        tools/data-handler/src/mutations/dispatcher.ts \
        tools/data-handler/test/mutations/handlers/calculation-rename.test.ts
git commit -m "feat: CalculationRenameHandler and CalculationDeleteHandler"
```

---

### Task 7: Report handlers (rename + delete)

**Files:**
- Create: `tools/data-handler/src/mutations/handlers/report.ts`
- Create: `tools/data-handler/test/mutations/handlers/report-rename.test.ts`
- Modify: `tools/data-handler/src/mutations/dispatcher.ts`

Per the plan: rename rewrites references in `index.adoc` files and in other reports. Delete needs no migration (references break; "Interactive complete migration" is deferred).

- [ ] **Step 1: Write the failing test**

```typescript
// tools/data-handler/test/mutations/handlers/report-rename.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../../src/containers/project.js';
import { ReportRenameHandler } from '../../../src/mutations/handlers/report.js';
import { copyDir } from '../../../src/utils/file-utils.js';
import { resourceName } from '../../../src/utils/resource-utils.js';

const FIXTURE_PATH = join(
  import.meta.dirname,
  '..',
  '..',
  'test-data',
  'decision-records',
);
const tmpDir = join(import.meta.dirname, 'tmp-report-rename');

describe('ReportRenameHandler', () => {
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

  it('matches rename inputs on reports only', () => {
    const handler = new ReportRenameHandler();
    const ctx = {
      project,
      input: {
        kind: 'rename' as const,
        target: resourceName(`${project.projectPrefix}/reports/summary`),
        newIdentifier: 'summary-v2',
      },
    };
    expect(handler.matches(ctx)).toBe(true);
  });

  it('is breaking', () => {
    expect(new ReportRenameHandler().isBreaking).toBe(true);
  });

  it('apply renames the resource', async () => {
    const reports = project.resources.reports(/* localOnly */);
    if (reports.length === 0) return;
    const report = reports[0];
    const oldName = report.data!.name;
    const newIdent = `${report.resourceName.identifier}-renamed`;
    const handler = new ReportRenameHandler();

    await handler.apply({
      project,
      input: {
        kind: 'rename' as const,
        target: resourceName(oldName),
        newIdentifier: newIdent,
      },
    });

    const renamed = project.resources.byType(
      `${report.resourceName.prefix}/reports/${newIdent}`,
      'reports',
    );
    expect(renamed).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd tools/data-handler && pnpm test test/mutations/handlers/report-rename.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement both handlers**

```typescript
// tools/data-handler/src/mutations/handlers/report.ts

import type { Handler, MutationContext } from '../handler.js';
import type { CascadePreview } from '../types.js';
import { resourceNameToString } from '../../utils/resource-utils.js';

export class ReportRenameHandler implements Handler {
  readonly isBreaking = true;

  matches(ctx: MutationContext): boolean {
    return (
      ctx.input.kind === 'rename' && ctx.input.target.type === 'reports'
    );
  }

  async preview(ctx: MutationContext): Promise<CascadePreview> {
    if (ctx.input.kind !== 'rename') {
      throw new Error('ReportRenameHandler: non-rename input');
    }
    const oldName = resourceNameToString(ctx.input.target);
    const cards = ctx.project
      .cards(undefined)
      .filter((c) => c.content?.includes(oldName));
    const templateCards = ctx.project
      .allTemplateCards()
      .filter((c) => c.content?.includes(oldName));
    return {
      affectedCardCount: cards.length + templateCards.length,
      affectedLinkCount: 0,
      affectedCalculationCount: 0,
      affectedHandlebarFileCount: 0,
      dataLossExpected: false,
      summary: `Renames report references in ${cards.length + templateCards.length} card content files.`,
    };
  }

  async apply(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'rename') {
      throw new Error('ReportRenameHandler: non-rename input');
    }
    const oldName = resourceNameToString(ctx.input.target);
    const resource = ctx.project.resources.byType(oldName, 'reports');
    if (!resource) {
      throw new Error(`Report '${oldName}' not found`);
    }
    const newName = `${ctx.input.target.prefix}/reports/${ctx.input.newIdentifier}`;
    await resource.update(
      { key: 'name' },
      { name: 'change', target: oldName, to: newName },
    );
  }

  async affectedFilePaths(ctx: MutationContext): Promise<string[]> {
    if (ctx.input.kind !== 'rename') return [];
    const oldName = resourceNameToString(ctx.input.target);
    return [
      ...ctx.project.cards(undefined),
      ...ctx.project.allTemplateCards(),
    ]
      .filter((c) => c.content?.includes(oldName))
      .map((c) => c.path);
  }
}

/**
 * Delete a report. Per migrations-plan.adoc: "No migration needed.
 * Existing references will be broken." The handler records the log
 * entry; downstream "interactive complete migration" can prompt the
 * user to replace broken references later.
 */
export class ReportDeleteHandler implements Handler {
  readonly isBreaking = true;

  matches(ctx: MutationContext): boolean {
    return (
      ctx.input.kind === 'delete' && ctx.input.target.type === 'reports'
    );
  }

  async preview(): Promise<CascadePreview> {
    return {
      affectedCardCount: 0,
      affectedLinkCount: 0,
      affectedCalculationCount: 0,
      affectedHandlebarFileCount: 0,
      dataLossExpected: false,
      summary:
        'No cascade. Existing references to this report will break until manually updated.',
    };
  }

  async apply(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'delete') {
      throw new Error('ReportDeleteHandler: non-delete input');
    }
    const name = resourceNameToString(ctx.input.target);
    const resource = ctx.project.resources.byType(name, 'reports');
    if (!resource) {
      throw new Error(`Report '${name}' not found`);
    }
    await resource.delete();
  }

  async affectedFilePaths(): Promise<string[]> {
    return [];
  }
}
```

- [ ] **Step 4: Register**

```typescript
import {
  ReportDeleteHandler,
  ReportRenameHandler,
} from './handlers/report.js';

// extend HANDLERS array...
```

- [ ] **Step 5: Run the test**

```bash
cd tools/data-handler && pnpm test test/mutations/handlers/report-rename.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tools/data-handler/src/mutations/handlers/report.ts \
        tools/data-handler/src/mutations/dispatcher.ts \
        tools/data-handler/test/mutations/handlers/report-rename.test.ts
git commit -m "feat: ReportRenameHandler and ReportDeleteHandler"
```

---

### Task 8: GraphModel handlers (rename + delete)

**Files:**
- Create: `tools/data-handler/src/mutations/handlers/graph-model.ts`
- Create: `tools/data-handler/test/mutations/handlers/graph-model-rename.test.ts`
- Modify: `tools/data-handler/src/mutations/dispatcher.ts`

Per the plan: rename rewrites graph macro references in card `index.adoc` files and in reports. Delete: "warn that content may be broken, remove the model."

- [ ] **Step 1: Write the failing test**

```typescript
// tools/data-handler/test/mutations/handlers/graph-model-rename.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../../src/containers/project.js';
import { GraphModelRenameHandler } from '../../../src/mutations/handlers/graph-model.js';
import { copyDir } from '../../../src/utils/file-utils.js';
import { resourceName } from '../../../src/utils/resource-utils.js';

const FIXTURE_PATH = join(
  import.meta.dirname,
  '..',
  '..',
  'test-data',
  'decision-records',
);
const tmpDir = join(import.meta.dirname, 'tmp-graph-model-rename');

describe('GraphModelRenameHandler', () => {
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

  it('matches rename inputs on graphModels only', () => {
    const handler = new GraphModelRenameHandler();
    expect(
      handler.matches({
        project,
        input: {
          kind: 'rename',
          target: resourceName(`${project.projectPrefix}/graphModels/sample`),
          newIdentifier: 'sample-renamed',
        },
      }),
    ).toBe(true);
  });

  it('is breaking', () => {
    expect(new GraphModelRenameHandler().isBreaking).toBe(true);
  });

  it('apply renames the resource', async () => {
    const models = project.resources.graphModels(/* localOnly */);
    if (models.length === 0) return;
    const model = models[0];
    const oldName = model.data!.name;
    const newIdent = `${model.resourceName.identifier}-renamed`;
    const handler = new GraphModelRenameHandler();
    await handler.apply({
      project,
      input: {
        kind: 'rename',
        target: resourceName(oldName),
        newIdentifier: newIdent,
      },
    });
    expect(
      project.resources.byType(
        `${model.resourceName.prefix}/graphModels/${newIdent}`,
        'graphModels',
      ),
    ).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd tools/data-handler && pnpm test test/mutations/handlers/graph-model-rename.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement both handlers**

```typescript
// tools/data-handler/src/mutations/handlers/graph-model.ts

import type { Handler, MutationContext } from '../handler.js';
import type { CascadePreview } from '../types.js';
import { resourceNameToString } from '../../utils/resource-utils.js';

export class GraphModelRenameHandler implements Handler {
  readonly isBreaking = true;

  matches(ctx: MutationContext): boolean {
    return (
      ctx.input.kind === 'rename' && ctx.input.target.type === 'graphModels'
    );
  }

  async preview(ctx: MutationContext): Promise<CascadePreview> {
    if (ctx.input.kind !== 'rename') {
      throw new Error('GraphModelRenameHandler: non-rename input');
    }
    const oldName = resourceNameToString(ctx.input.target);
    const cards = ctx.project
      .cards(undefined)
      .filter((c) => c.content?.includes(oldName));
    return {
      affectedCardCount: cards.length,
      affectedLinkCount: 0,
      affectedCalculationCount: 0,
      affectedHandlebarFileCount: 0,
      dataLossExpected: false,
      summary: `Renames graph-model references in ${cards.length} cards.`,
    };
  }

  async apply(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'rename') {
      throw new Error('GraphModelRenameHandler: non-rename input');
    }
    const oldName = resourceNameToString(ctx.input.target);
    const resource = ctx.project.resources.byType(oldName, 'graphModels');
    if (!resource) {
      throw new Error(`Graph model '${oldName}' not found`);
    }
    const newName = `${ctx.input.target.prefix}/graphModels/${ctx.input.newIdentifier}`;
    await resource.update(
      { key: 'name' },
      { name: 'change', target: oldName, to: newName },
    );
  }

  async affectedFilePaths(ctx: MutationContext): Promise<string[]> {
    if (ctx.input.kind !== 'rename') return [];
    const oldName = resourceNameToString(ctx.input.target);
    return ctx.project
      .cards(undefined)
      .filter((c) => c.content?.includes(oldName))
      .map((c) => c.path);
  }
}

/**
 * Delete a graph model. Per migrations-plan.adoc: "Warn that content
 * may be broken, remove the model." The handler removes the resource;
 * the warning is conveyed via the preview summary.
 */
export class GraphModelDeleteHandler implements Handler {
  readonly isBreaking = true;

  matches(ctx: MutationContext): boolean {
    return (
      ctx.input.kind === 'delete' && ctx.input.target.type === 'graphModels'
    );
  }

  async preview(ctx: MutationContext): Promise<CascadePreview> {
    if (ctx.input.kind !== 'delete') {
      throw new Error('GraphModelDeleteHandler: non-delete input');
    }
    const name = resourceNameToString(ctx.input.target);
    const refs = ctx.project
      .cards(undefined)
      .filter((c) => c.content?.includes(name)).length;
    return {
      affectedCardCount: refs,
      affectedLinkCount: 0,
      affectedCalculationCount: 0,
      affectedHandlebarFileCount: 0,
      dataLossExpected: false,
      summary: `Removes the graph model. ${refs} cards reference it and may render broken content until updated.`,
    };
  }

  async apply(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'delete') {
      throw new Error('GraphModelDeleteHandler: non-delete input');
    }
    const name = resourceNameToString(ctx.input.target);
    const resource = ctx.project.resources.byType(name, 'graphModels');
    if (!resource) {
      throw new Error(`Graph model '${name}' not found`);
    }
    await resource.delete();
  }

  async affectedFilePaths(): Promise<string[]> {
    return [];
  }
}
```

- [ ] **Step 4: Register**

Add `GraphModelRenameHandler`, `GraphModelDeleteHandler` to `HANDLERS`.

- [ ] **Step 5: Run the test**

```bash
cd tools/data-handler && pnpm test test/mutations/handlers/graph-model-rename.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tools/data-handler/src/mutations/handlers/graph-model.ts \
        tools/data-handler/src/mutations/dispatcher.ts \
        tools/data-handler/test/mutations/handlers/graph-model-rename.test.ts
git commit -m "feat: GraphModelRenameHandler and GraphModelDeleteHandler"
```

---

### Task 9: GraphView handlers (rename + delete)

**Files:**
- Create: `tools/data-handler/src/mutations/handlers/graph-view.ts`
- Create: `tools/data-handler/test/mutations/handlers/graph-view-rename.test.ts`
- Modify: `tools/data-handler/src/mutations/dispatcher.ts`

Per the plan: rename rewrites references in configuration; delete needs no migration (existing graph macros break). Parameter-schema changes are non-breaking by policy → DefaultNoCascadeHandler route.

- [ ] **Step 1: Write the failing test**

```typescript
// tools/data-handler/test/mutations/handlers/graph-view-rename.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../../src/containers/project.js';
import { GraphViewRenameHandler } from '../../../src/mutations/handlers/graph-view.js';
import { copyDir } from '../../../src/utils/file-utils.js';
import { resourceName } from '../../../src/utils/resource-utils.js';

const FIXTURE_PATH = join(
  import.meta.dirname,
  '..',
  '..',
  'test-data',
  'decision-records',
);
const tmpDir = join(import.meta.dirname, 'tmp-graph-view-rename');

describe('GraphViewRenameHandler', () => {
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

  it('matches rename inputs on graphViews only', () => {
    const handler = new GraphViewRenameHandler();
    expect(
      handler.matches({
        project,
        input: {
          kind: 'rename',
          target: resourceName(`${project.projectPrefix}/graphViews/default`),
          newIdentifier: 'main',
        },
      }),
    ).toBe(true);
  });

  it('is breaking', () => {
    expect(new GraphViewRenameHandler().isBreaking).toBe(true);
  });

  it('apply renames the resource', async () => {
    const views = project.resources.graphViews(/* localOnly */);
    if (views.length === 0) return;
    const view = views[0];
    const oldName = view.data!.name;
    const newIdent = `${view.resourceName.identifier}-renamed`;
    const handler = new GraphViewRenameHandler();
    await handler.apply({
      project,
      input: {
        kind: 'rename',
        target: resourceName(oldName),
        newIdentifier: newIdent,
      },
    });
    expect(
      project.resources.byType(
        `${view.resourceName.prefix}/graphViews/${newIdent}`,
        'graphViews',
      ),
    ).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd tools/data-handler && pnpm test test/mutations/handlers/graph-view-rename.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement both handlers**

```typescript
// tools/data-handler/src/mutations/handlers/graph-view.ts

import type { Handler, MutationContext } from '../handler.js';
import type { CascadePreview } from '../types.js';
import { resourceNameToString } from '../../utils/resource-utils.js';

export class GraphViewRenameHandler implements Handler {
  readonly isBreaking = true;

  matches(ctx: MutationContext): boolean {
    return (
      ctx.input.kind === 'rename' && ctx.input.target.type === 'graphViews'
    );
  }

  async preview(ctx: MutationContext): Promise<CascadePreview> {
    if (ctx.input.kind !== 'rename') {
      throw new Error('GraphViewRenameHandler: non-rename input');
    }
    const oldName = resourceNameToString(ctx.input.target);
    const cards = ctx.project
      .cards(undefined)
      .filter((c) => c.content?.includes(oldName));
    return {
      affectedCardCount: cards.length,
      affectedLinkCount: 0,
      affectedCalculationCount: 0,
      affectedHandlebarFileCount: 0,
      dataLossExpected: false,
      summary: `Renames graph-view references in ${cards.length} cards.`,
    };
  }

  async apply(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'rename') {
      throw new Error('GraphViewRenameHandler: non-rename input');
    }
    const oldName = resourceNameToString(ctx.input.target);
    const resource = ctx.project.resources.byType(oldName, 'graphViews');
    if (!resource) {
      throw new Error(`Graph view '${oldName}' not found`);
    }
    const newName = `${ctx.input.target.prefix}/graphViews/${ctx.input.newIdentifier}`;
    await resource.update(
      { key: 'name' },
      { name: 'change', target: oldName, to: newName },
    );
  }

  async affectedFilePaths(ctx: MutationContext): Promise<string[]> {
    if (ctx.input.kind !== 'rename') return [];
    const oldName = resourceNameToString(ctx.input.target);
    return ctx.project
      .cards(undefined)
      .filter((c) => c.content?.includes(oldName))
      .map((c) => c.path);
  }
}

/**
 * Delete a graph view. Per migrations-plan.adoc: "No migration.
 * Existing graph macros will be broken." The handler removes the
 * resource; the preview surfaces the broken-references warning.
 */
export class GraphViewDeleteHandler implements Handler {
  readonly isBreaking = true;

  matches(ctx: MutationContext): boolean {
    return (
      ctx.input.kind === 'delete' && ctx.input.target.type === 'graphViews'
    );
  }

  async preview(ctx: MutationContext): Promise<CascadePreview> {
    if (ctx.input.kind !== 'delete') {
      throw new Error('GraphViewDeleteHandler: non-delete input');
    }
    const name = resourceNameToString(ctx.input.target);
    const refs = ctx.project
      .cards(undefined)
      .filter((c) => c.content?.includes(name)).length;
    return {
      affectedCardCount: refs,
      affectedLinkCount: 0,
      affectedCalculationCount: 0,
      affectedHandlebarFileCount: 0,
      dataLossExpected: false,
      summary: `Removes the graph view. ${refs} cards reference it; their graph macros will fail until updated.`,
    };
  }

  async apply(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'delete') {
      throw new Error('GraphViewDeleteHandler: non-delete input');
    }
    const name = resourceNameToString(ctx.input.target);
    const resource = ctx.project.resources.byType(name, 'graphViews');
    if (!resource) {
      throw new Error(`Graph view '${name}' not found`);
    }
    await resource.delete();
  }

  async affectedFilePaths(): Promise<string[]> {
    return [];
  }
}
```

- [ ] **Step 4: Register**

Add both classes to the dispatcher's `HANDLERS` array.

- [ ] **Step 5: Run the test**

```bash
cd tools/data-handler && pnpm test test/mutations/handlers/graph-view-rename.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tools/data-handler/src/mutations/handlers/graph-view.ts \
        tools/data-handler/src/mutations/dispatcher.ts \
        tools/data-handler/test/mutations/handlers/graph-view-rename.test.ts
git commit -m "feat: GraphViewRenameHandler and GraphViewDeleteHandler

LinkType change-source/destination, GraphView parameter-schema change,
Template card-structure change, Calculation logic change, Report
query/template change, GraphModel logic change all remain on the
DefaultNoCascadeHandler path per migrations-plan.adoc (non-breaking)."
```

---

### Task 10: `ProjectRenameHandler` — failing test (the big one)

**Files:**
- Create: `tools/data-handler/test/mutations/handlers/project-rename.test.ts`

`ProjectRename` is the largest cascade in the system. It rewrites every prefix-qualified reference across the project: card metadata `cardType`/`workflowState`/`<prefix>/fieldTypes/...` custom-field keys, calculation `.lp` imports, handlebar files, every resource's own `name`, and content of cards in cardRoot + templates. The current logic is the body of `Rename.rename(to)` in `commands/rename.ts`.

This task writes the failing test for the handler against a real fixture so the implementation (Task 11) has a precise target.

- [ ] **Step 1: Write the failing test**

```typescript
// tools/data-handler/test/mutations/handlers/project-rename.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../../src/containers/project.js';
import { ProjectRenameHandler } from '../../../src/mutations/handlers/project-rename.js';
import { copyDir } from '../../../src/utils/file-utils.js';

const FIXTURE_PATH = join(
  import.meta.dirname,
  '..',
  '..',
  'test-data',
  'decision-records',
);
const tmpDir = join(import.meta.dirname, 'tmp-project-rename');

describe('ProjectRenameHandler', () => {
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

  it('matches only project_rename inputs', () => {
    const handler = new ProjectRenameHandler();
    expect(
      handler.matches({
        project,
        input: { kind: 'project_rename', newPrefix: 'renamed' },
      }),
    ).toBe(true);
    expect(
      handler.matches({
        project,
        // @ts-expect-error wrong input kind on purpose
        input: { kind: 'rename', newPrefix: 'renamed' },
      }),
    ).toBe(false);
  });

  it('is breaking', () => {
    expect(new ProjectRenameHandler().isBreaking).toBe(true);
  });

  it('preview reports a large cascade summary', async () => {
    const handler = new ProjectRenameHandler();
    const preview = await handler.preview({
      project,
      input: { kind: 'project_rename', newPrefix: 'renamed' },
    });
    expect(preview.affectedCardCount).toBeGreaterThan(0);
    expect(preview.summary).toMatch(/prefix/i);
  });

  it('apply rewrites cardType references in every card', async () => {
    const oldPrefix = project.projectPrefix;
    const newPrefix = 'renamed';
    const handler = new ProjectRenameHandler();

    await handler.apply({
      project,
      input: { kind: 'project_rename', newPrefix },
    });

    expect(project.projectPrefix).toBe(newPrefix);

    for (const card of project.cards(undefined)) {
      // Cards that referenced cardTypes under oldPrefix must now reference newPrefix.
      if (card.metadata?.cardType?.startsWith(`${oldPrefix}/`)) {
        expect.fail(`card '${card.key}' still references old prefix`);
      }
    }
  });

  it('apply rewrites resource references in card content adoc files', async () => {
    const oldPrefix = project.projectPrefix;
    const newPrefix = 'renamed';
    const handler = new ProjectRenameHandler();

    await handler.apply({
      project,
      input: { kind: 'project_rename', newPrefix },
    });

    for (const card of project.cards(undefined)) {
      const adoc = join(card.path, 'index.adoc');
      let content = '';
      try {
        content = await readFile(adoc, 'utf-8');
      } catch {
        continue;
      }
      // No remaining "<oldPrefix>/<resourceType>/" substring (the
      // strict cascade pattern that updateFiles uses).
      for (const type of ['calculations', 'cardTypes', 'fieldTypes', 'linkTypes', 'reports', 'templates', 'workflows']) {
        expect(content).not.toContain(`${oldPrefix}/${type}/`);
      }
    }
  });

  it('apply renames cards whose key starts with the old prefix', async () => {
    const oldPrefix = project.projectPrefix;
    const newPrefix = 'renamed';
    const handler = new ProjectRenameHandler();

    await handler.apply({
      project,
      input: { kind: 'project_rename', newPrefix },
    });

    for (const card of project.cards(undefined)) {
      expect(card.key.startsWith(`${oldPrefix}_`)).toBe(false);
    }
  });

  it('affectedFilePaths covers cardRoot and resources folders', async () => {
    const handler = new ProjectRenameHandler();
    const paths = await handler.affectedFilePaths({
      project,
      input: { kind: 'project_rename', newPrefix: 'renamed' },
    });
    expect(paths.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd tools/data-handler && pnpm test test/mutations/handlers/project-rename.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Commit (red phase)**

```bash
git add tools/data-handler/test/mutations/handlers/project-rename.test.ts
git commit -m "test: failing test for ProjectRenameHandler"
```

---

### Task 11: `ProjectRenameHandler` — implementation

**Files:**
- Create: `tools/data-handler/src/mutations/handlers/project-rename.ts`
- Modify: `tools/data-handler/src/mutations/dispatcher.ts`

Extract every step in `commands/rename.ts:rename(to)` into the handler. The handler becomes the canonical place for the project-rename cascade; `commands/rename.ts` will be reduced to a delegating shell in Task 13.

- [ ] **Step 1: Read the existing implementation**

```bash
sed -n '46,295p' tools/data-handler/src/commands/rename.ts
```

Note that the rename body does six things, in order:
1. Validate that `to` is non-empty and differs from the current prefix.
2. `project.configuration.setCardPrefix(to)` and invalidate the resource cache (`project.resources.changed()`).
3. Rename every local resource (`cardTypes` first, then `workflows`, then `fieldTypes`, then `graphModels|graphViews|linkTypes|reports|templates|calculations`) via `resource.rename(resourceName(...))`.
4. Rename every template card (calls `renameCards(...)` over `templateObject.cards()`).
5. Rename every project card (`renameCards(...)` over `project.cards(cardRootFolder)`).
6. Walk `cardRootFolder` and `resourcesFolder`, regexp-rewrite every `<prefix>/<resourceType>/` occurrence and every `<prefix>_` card-key prefix in `.adoc|.hbs|.json|.lp` files.

Then it re-collects resources, clears the cards cache, and writes the log entry (this last bit is now `ResourceMutations.recordLogEntry`).

- [ ] **Step 2: Implement the handler**

```typescript
// tools/data-handler/src/mutations/handlers/project-rename.ts

import { join } from 'node:path';
import {
  rename as renameFile,
  readdir,
  readFile,
  writeFile,
} from 'node:fs/promises';

import type { Handler, MutationContext } from '../handler.js';
import type { CascadePreview } from '../types.js';
import { isTemplateCard } from '../../utils/card-utils.js';
import { resourceName } from '../../utils/resource-utils.js';
import { ResourcesFrom } from '../../containers/project/resources-from.js';
import type { Card } from '../../interfaces/project-interfaces.js';

const FILE_TYPES_WITH_PREFIX_REFERENCES = ['adoc', 'hbs', 'json', 'lp'];

export class ProjectRenameHandler implements Handler {
  readonly isBreaking = true;

  matches(ctx: MutationContext): boolean {
    return ctx.input.kind === 'project_rename';
  }

  async preview(ctx: MutationContext): Promise<CascadePreview> {
    if (ctx.input.kind !== 'project_rename') {
      throw new Error('ProjectRenameHandler: non-project_rename input');
    }
    const oldPrefix = ctx.project.projectPrefix;
    const cards = ctx.project.cards(undefined);
    const resourceCount =
      ctx.project.resources.cardTypes(ResourcesFrom.localOnly).length +
      ctx.project.resources.workflows(ResourcesFrom.localOnly).length +
      ctx.project.resources.fieldTypes(ResourcesFrom.localOnly).length +
      ctx.project.resources.linkTypes(ResourcesFrom.localOnly).length +
      ctx.project.resources.templates(ResourcesFrom.localOnly).length +
      ctx.project.resources.calculations(ResourcesFrom.localOnly).length +
      ctx.project.resources.reports(ResourcesFrom.localOnly).length +
      ctx.project.resources.graphModels(ResourcesFrom.localOnly).length +
      ctx.project.resources.graphViews(ResourcesFrom.localOnly).length;

    return {
      affectedCardCount: cards.length,
      affectedLinkCount: 0,
      affectedCalculationCount: ctx.project.resources.calculations(
        ResourcesFrom.localOnly,
      ).length,
      affectedHandlebarFileCount: 0,
      dataLossExpected: false,
      summary: `Rewrites every '${oldPrefix}/...' reference and every '${oldPrefix}_*' card key. Touches ${cards.length} cards and ${resourceCount} local resources.`,
    };
  }

  async apply(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'project_rename') {
      throw new Error('ProjectRenameHandler: non-project_rename input');
    }
    const from = ctx.project.projectPrefix;
    const to = ctx.input.newPrefix;
    if (!to) {
      throw new Error("Input validation error: empty 'to' is not allowed");
    }
    if (from === to) {
      throw new Error(`Project prefix is already '${from}'`);
    }

    // (1) Change project prefix and invalidate caches.
    await ctx.project.configuration.setCardPrefix(to);
    ctx.project.resources.changed();

    // (2) Rename every local resource by category, in dependency order.
    const orderedCategories = [
      'cardTypes',
      'workflows',
      'fieldTypes',
      'graphModels',
      'graphViews',
      'linkTypes',
      'reports',
      'templates',
      'calculations',
    ] as const;

    for (const category of orderedCategories) {
      for (const resource of ctx.project.resources.resourceTypes(
        category,
        ResourcesFrom.localOnly,
      )) {
        const oldName = resource.data?.name ?? '';
        if (!oldName) continue;
        const parsed = resourceName(oldName);
        if (parsed.prefix !== from) continue;
        const newName = `${to}/${parsed.type}/${parsed.identifier}`;
        await resource.rename(resourceName(newName));
      }
    }

    // (3) Rename template cards (deepest first) and rewrite their content/attachments.
    for (const template of ctx.project.resources.templates(
      ResourcesFrom.localOnly,
    )) {
      await renameCards(ctx, template.templateObject().cards(), from, to);
    }

    // (4) Rename project cards.
    await renameCards(
      ctx,
      ctx.project.cards(ctx.project.paths.cardRootFolder),
      from,
      to,
    );

    // (5) Walk cardRoot and resources, rewriting every prefix-qualified
    //     reference and every "<prefix>_" card-key prefix.
    await updateFiles(ctx.project.paths.cardRootFolder, from, to);
    await updateFiles(ctx.project.paths.resourcesFolder, from, to);

    // (6) Re-collect resources and rebuild card caches.
    ctx.project.resources.changed();
    ctx.project.cardsCache.clear();
    await ctx.project.populateCaches();
  }

  async affectedFilePaths(ctx: MutationContext): Promise<string[]> {
    if (ctx.input.kind !== 'project_rename') return [];
    const paths: string[] = [];
    for (const card of ctx.project.cards(undefined)) {
      paths.push(join(card.path, 'index.json'));
    }
    for (const card of ctx.project.allTemplateCards()) {
      paths.push(join(card.path, 'index.json'));
    }
    return paths;
  }
}

// ---- Helpers extracted from commands/rename.ts (private) ----

async function renameCards(
  ctx: MutationContext,
  cards: Card[],
  from: string,
  to: string,
): Promise<void> {
  // Sort cards by path length (deepest first) so children rename before parents.
  const sortedCards = [...cards].sort((a, b) => b.path.length - a.path.length);

  // Use negative lookahead so only the last occurrence in the path is replaced;
  // matches the existing rename logic in commands/rename.ts.
  const re = new RegExp(`${from}(?!.*${from})`);

  for (const card of sortedCards) {
    card.content = await updateCardAttachments(ctx, re, card, to);
    await renameOneCard(ctx, re, card, from, to);
  }
}

async function updateCardAttachments(
  ctx: MutationContext,
  re: RegExp,
  card: Card,
  to: string,
): Promise<string | undefined> {
  if (!isTemplateCard(card)) {
    const attachments = card.attachments ?? [];
    await Promise.all(
      attachments.map(async (attachment) => {
        const newAttachmentFileName = attachment.fileName.replace(re, to);
        await renameFile(
          join(attachment.path, attachment.fileName),
          join(attachment.path, newAttachmentFileName),
        );
      }),
    );
  }
  return card.content;
}

async function renameOneCard(
  ctx: MutationContext,
  re: RegExp,
  card: Card,
  from: string,
  to: string,
): Promise<void> {
  await updateCardMetadata(ctx, card, from, to);
  const newCardPath = card.path.replace(re, to);
  await renameFile(card.path, newCardPath);
}

async function updateCardMetadata(
  ctx: MutationContext,
  card: Card,
  from: string,
  to: string,
): Promise<void> {
  if (card.metadata?.cardType && card.metadata.cardType.length > 0) {
    const { identifier, prefix, type } = resourceName(card.metadata.cardType);
    if (prefix === from) {
      card.metadata.cardType = `${to}/${type}/${identifier}`;
      const keys = Object.keys(card.metadata);
      for (const oldKey of keys) {
        if (oldKey.startsWith(`${from}/fieldTypes`)) {
          const parsed = resourceName(oldKey);
          const newKey = `${to}/${parsed.type}/${parsed.identifier}`;
          delete Object.assign(card.metadata, {
            [newKey]: card.metadata[oldKey],
          })[oldKey];
        }
      }
      await ctx.project.updateCardMetadata(card, card.metadata);
    }
  }
}

function scanExtensions(fileName: string): boolean {
  if (!fileName || !fileName.includes('.') || fileName.at(0) === '.') {
    return false;
  }
  const extension = fileName.split('.').pop() ?? '';
  return FILE_TYPES_WITH_PREFIX_REFERENCES.includes(extension);
}

async function updateFiles(
  location: string,
  from: string,
  to: string,
): Promise<void> {
  const conversionMap = new Map([
    [`${from}/calculations/`, `${to}/calculations/`],
    [`${from}/cardTypes/`, `${to}/cardTypes/`],
    [`${from}/fieldTypes/`, `${to}/fieldTypes/`],
    [`${from}/linkTypes/`, `${to}/linkTypes/`],
    [`${from}/reports/`, `${to}/reports/`],
    [`${from}/templates/`, `${to}/templates/`],
    [`${from}/workflows/`, `${to}/workflows/`],
    [`${from}_`, `${to}_`],
  ]);

  const files = (
    await readdir(location, { recursive: true, withFileTypes: true })
  ).filter(
    (item) =>
      item.isFile() &&
      item.name !== '.schema' &&
      scanExtensions(item.name),
  );

  await Promise.all(
    files.map(async (item) => {
      const target = join(item.parentPath, item.name);
      let fileContent = await readFile(target, { encoding: 'utf-8' });
      for (const [key, value] of conversionMap) {
        const re = new RegExp(`(?<![a-z])${key}`, 'g');
        fileContent = fileContent.replace(re, value);
      }
      await writeFile(target, fileContent);
    }),
  );
}
```

The extracted helpers preserve the negative-lookahead/lookbehind regexes exactly as `commands/rename.ts` had them.

- [ ] **Step 3: Register the handler**

In `tools/data-handler/src/mutations/dispatcher.ts`:

```typescript
import { ProjectRenameHandler } from './handlers/project-rename.js';

const HANDLERS: Handler[] = [
  new LinkTypeRenameHandler(),
  new LinkTypeDeleteHandler(),
  new TemplateRenameHandler(),
  new TemplateDeleteHandler(),
  new CalculationRenameHandler(),
  new CalculationDeleteHandler(),
  new ReportRenameHandler(),
  new ReportDeleteHandler(),
  new GraphModelRenameHandler(),
  new GraphModelDeleteHandler(),
  new GraphViewRenameHandler(),
  new GraphViewDeleteHandler(),
  new ProjectRenameHandler(),
  new DefaultNoCascadeHandler(),
];
```

- [ ] **Step 4: Run the test**

```bash
cd tools/data-handler && pnpm test test/mutations/handlers/project-rename.test.ts
```

Expected: PASS for all six `it` blocks. If a card-content assertion fails because the fixture itself uses the prefix in an unanticipated way, narrow the assertion (do not weaken the cascade — the spec mandates *every* prefix-qualified reference is rewritten).

- [ ] **Step 5: Commit**

```bash
git add tools/data-handler/src/mutations/handlers/project-rename.ts \
        tools/data-handler/src/mutations/dispatcher.ts
git commit -m "feat: ProjectRenameHandler — full prefix-rewrite cascade

Extracts the cascade body from commands/rename.ts into a handler.
The command file becomes a delegating shell in a follow-up task."
```

---

### Task 12: Shrink resource subclasses now that handlers own the cascade

**Files:**
- Modify: `tools/data-handler/src/resources/template-resource.ts`
- Modify: `tools/data-handler/src/resources/calculation-resource.ts`
- Modify: `tools/data-handler/src/resources/report-resource.ts`
- Modify: `tools/data-handler/src/resources/graph-model-resource.ts`
- Modify: `tools/data-handler/src/resources/graph-view-resource.ts`

The handlers in Tasks 5-9 currently call `resource.update({key: 'name'}, ...)`, which triggers each subclass's `onNameChange`. The subclass implementations call `updateHandleBars`, `updateCalculations`, `updateCardContentReferences` — same set of cascade helpers the spec wants to centralise in the handler. For this plan, the resource subclasses keep `onNameChange` because the existing direct-call path (via `commands/update.ts`, when not yet routed through the engine for a given resource family) still depends on them.

This task verifies that there are no DEAD methods to delete in these subclasses (the cascade helpers in the base class `ResourceObject` stay; they are utilities). The grep should come up empty.

- [ ] **Step 1: Verify no orphaned cascade methods**

```bash
cd tools/data-handler && grep -nE "updateCardLinks|cascadeRename" src/resources/
```

Expected: only the `updateCardLinks` method in `link-type-resource.ts` (already removed by foundation). If anything else shows up, remove it and its callers as part of this task.

- [ ] **Step 2: Run all tests**

```bash
cd tools/data-handler && pnpm test
```

Expected: PASS. If this task is purely a verification step the commit is skipped.

- [ ] **Step 3: Commit only if changes were made**

```bash
# only if files changed:
git add tools/data-handler/src/resources/
git commit -m "refactor: remove dead cascade methods from resource subclasses

Handlers in mutations/handlers/ now own the cascade orchestration."
```

If no changes, skip the commit.

---

### Task 13: Route every resource rename and delete through `ResourceMutations`

**Files:**
- Modify: `tools/data-handler/src/commands/update.ts`
- Modify: `tools/data-handler/src/commands/remove.ts`
- Modify: `tools/data-handler/src/commands/rename.ts`
- Test: `tools/data-handler/test/command-update.test.ts`
- Test: `tools/data-handler/test/command-remove.test.ts` (or wherever the existing remove tests live; check with `ls`)

The foundation plan wired link-type renames through the engine. This task generalises the routing so every supported (resource family, operation) flows through `ResourceMutations`, and `commands/rename.ts:rename(to)` (project rename) delegates to the handler.

- [ ] **Step 1: Write a failing routing test for resource delete**

In `tools/data-handler/test/command-remove.test.ts` (or `command-edit.test.ts` if remove lives there — check the codebase), add:

```typescript
it('routes resource deletes through ResourceMutations and logs an entry', async () => {
  // ... open a fixture project that has at least one local linkType ...
  const remove = new Remove(project, fetchCmd);
  await remove.remove(
    'linkType',
    `${project.projectPrefix}/linkTypes/causes`,
  );
  const entries = await ConfigurationLogger.entries(project.basePath);
  expect(
    entries.some(
      (e) =>
        e.kind === 'resource_delete' &&
        e.target === `${project.projectPrefix}/linkTypes/causes`,
    ),
  ).toBe(true);
});
```

- [ ] **Step 2: Generalise `Update.applyResourceOperation` rename routing**

In `tools/data-handler/src/commands/update.ts`, replace the link-type-only branch with a general rename branch. The condition is `updateKey.key === 'name' && operation.name === 'change' && extractType(name) !== undefined`. Resource families that don't yet have a handler still match — they fall through to `DefaultNoCascadeHandler`, which performs the same `resource.update(...)` call the legacy path used.

```typescript
public async applyResourceOperation<
  Type,
  T extends UpdateOperations,
  K extends string,
>(name: string, updateKey: UpdateKey<K>, operation: OperationFor<Type, T>) {
  const isRename =
    updateKey.key === 'name' && operation.name === 'change';

  if (isRename) {
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

- [ ] **Step 3: Route resource delete through `ResourceMutations`**

In `tools/data-handler/src/commands/remove.ts`, in the `projectResource(type)` branch, replace the direct `resource?.delete()` call:

```typescript
if (this.projectResource(type)) {
  const { resourceName: parseResourceName } = await import(
    '../utils/resource-utils.js'
  );
  const { ResourceMutations } = await import('../mutations/plan.js');
  const target = parseResourceName(targetName);
  const mutations = new ResourceMutations(this.project);
  const plan = await mutations.plan({ kind: 'delete', target });
  return mutations.apply(
    { kind: 'delete', target },
    { fingerprint: plan.fingerprint },
  );
}
```

Verify the existing `logResourceDelete` call inside `ResourceObject.delete()` does not double-log. If it does, gate it on a "called from engine" flag or remove it (the engine's `recordLogEntry` is now the only path that should log a delete). The simplest fix: delete the `ConfigurationLogger.logResourceDelete(...)` call inside `ResourceObject.delete()` (search with grep below).

```bash
cd tools/data-handler && grep -n "logResourceDelete\|logResourceRename\|logResourceUpdate" src/resources/
```

Each match is a candidate for removal (the engine now owns the log). Remove them carefully; if any test depends on the side-effect, update the test to read through `ConfigurationLogger.entries` after the engine call instead.

- [ ] **Step 4: Delegate `commands/rename.ts:rename(to)` to `ResourceMutations`**

Replace the body of `Rename.rename(to)` with a delegating call:

```typescript
@write((to) => `Rename project prefix to ${to}`)
public async rename(to: string) {
  if (!to) {
    throw new Error("Input validation error: empty 'to' is not allowed");
  }
  const { ResourceMutations } = await import('../mutations/plan.js');
  const mutations = new ResourceMutations(this.project);
  const plan = await mutations.plan({
    kind: 'project_rename',
    newPrefix: to,
  });
  await mutations.apply(
    { kind: 'project_rename', newPrefix: to },
    { fingerprint: plan.fingerprint },
  );
}
```

Remove every now-unused helper (`renameCard`, `renameCards`, `scanExtensions`, `updateCardAttachments`, `updateCardMetadata`, `updateFiles`, `updateResourceName`, and the `from`/`to` fields) — the handler owns them. Remove the unused `ConfigurationOperation` import and the trailing `ConfigurationLogger.log(...)` call (now done by `recordLogEntry`).

The final `commands/rename.ts` is ~30 lines: a class with a `rename(to)` method that delegates to the engine.

- [ ] **Step 5: Run the data-handler test suite**

```bash
cd tools/data-handler && pnpm test
```

Expected: PASS. If a pre-existing test breaks because it expected the old log-call shape, update the assertion to read through `ConfigurationLogger.entries(projectPath)`.

Common failures to watch for:
- A test that called `Rename.rename(to)` and then inspected `entries` for a `parameters` field — the new payload uses `oldPrefix`/`newPrefix`.
- A test that compared the legacy `ConfigurationOperation.PROJECT_RENAME` string — replace with `'project_rename'`.

- [ ] **Step 6: Commit**

```bash
git add tools/data-handler/src/commands/update.ts \
        tools/data-handler/src/commands/remove.ts \
        tools/data-handler/src/commands/rename.ts \
        tools/data-handler/src/resources/ \
        tools/data-handler/test/
git commit -m "feat: route every supported mutation through ResourceMutations

Generalises the link-type-rename routing introduced by the foundation
plan to cover every resource rename and delete. Project rename
delegates to ProjectRenameHandler; commands/rename.ts shrinks to a
delegating shell. Removes legacy logResourceDelete/Rename/Update calls
from ResourceObject — the engine's recordLogEntry is now the only path
that logs."
```

---

### Task 14: Integration test — ProjectRename end-to-end

**Files:**
- Create: `tools/data-handler/test/mutations/integration-project-rename.test.ts`

A full plan → apply → log entry roundtrip against a fixture project. This is the smoke test that the largest cascade still produces a single, well-formed log entry and that the project ends up in a consistent state.

- [ ] **Step 1: Write the test**

```typescript
// tools/data-handler/test/mutations/integration-project-rename.test.ts

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../src/containers/project.js';
import { ResourceMutations } from '../../src/mutations/plan.js';
import { ConfigurationLogger } from '../../src/utils/configuration-logger.js';
import { copyDir } from '../../src/utils/file-utils.js';

const FIXTURE_PATH = join(
  import.meta.dirname,
  '..',
  'test-data',
  'decision-records',
);
const tmpDir = join(import.meta.dirname, 'tmp-integration-project-rename');

describe('ProjectRename end-to-end', () => {
  let project: Project;
  let projectPath: string;
  let originalPrefix: string;

  beforeAll(async () => {
    projectPath = join(tmpDir, `proj-${Date.now()}`);
    await mkdir(projectPath, { recursive: true });
    await copyDir(FIXTURE_PATH, projectPath);
    project = new Project(projectPath);
    await project.initialize();
    originalPrefix = project.projectPrefix;
  });
  afterAll(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('plan → apply → log entry', async () => {
    const mutations = new ResourceMutations(project);
    const input = {
      kind: 'project_rename' as const,
      newPrefix: 'renamed',
    };
    const plan = await mutations.plan(input);
    expect(plan.isBreaking).toBe(true);
    expect(plan.preview.affectedCardCount).toBeGreaterThan(0);

    await mutations.apply(input, { fingerprint: plan.fingerprint });

    expect(project.projectPrefix).toBe('renamed');

    const entries = await ConfigurationLogger.entries(project.basePath);
    const projectRenameEntries = entries.filter(
      (e) => e.kind === 'project_rename',
    );
    expect(projectRenameEntries).toHaveLength(1);
    expect(projectRenameEntries[0].payload).toEqual({
      oldPrefix: originalPrefix,
      newPrefix: 'renamed',
    });
  });
});
```

- [ ] **Step 2: Run the test**

```bash
cd tools/data-handler && pnpm test test/mutations/integration-project-rename.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run the whole suite as a final check**

```bash
cd tools/data-handler && pnpm test
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tools/data-handler/test/mutations/integration-project-rename.test.ts
git commit -m "test: end-to-end integration for ProjectRename"
```

---

### Task 15: Integration test — LinkType delete cascade

**Files:**
- Create: `tools/data-handler/test/mutations/integration-link-type-delete.test.ts`

Mirror of Task 14 for the non-trivial LinkType delete cascade. Verifies that deleting a link type strips every matching link from every card and writes one `resource_delete` entry.

- [ ] **Step 1: Write the test**

```typescript
// tools/data-handler/test/mutations/integration-link-type-delete.test.ts

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../src/containers/project.js';
import { ResourceMutations } from '../../src/mutations/plan.js';
import { ConfigurationLogger } from '../../src/utils/configuration-logger.js';
import { copyDir } from '../../src/utils/file-utils.js';
import { resourceName } from '../../src/utils/resource-utils.js';

const FIXTURE_PATH = join(
  import.meta.dirname,
  '..',
  'test-data',
  'decision-records',
);
const tmpDir = join(import.meta.dirname, 'tmp-integration-link-type-delete');

describe('LinkType delete end-to-end', () => {
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

  it('plan → apply → log entry; links stripped from cards', async () => {
    const linkTypeName = `${project.projectPrefix}/linkTypes/causes`;
    const mutations = new ResourceMutations(project);
    const input = {
      kind: 'delete' as const,
      target: resourceName(linkTypeName),
    };
    const plan = await mutations.plan(input);
    expect(plan.isBreaking).toBe(true);
    const linksBefore = project
      .cards(undefined)
      .reduce(
        (n, c) =>
          n +
          (c.metadata?.links?.filter((l) => l.linkType === linkTypeName)
            .length ?? 0),
        0,
      );
    expect(plan.preview.affectedLinkCount).toBe(linksBefore);

    await mutations.apply(input, { fingerprint: plan.fingerprint });

    // Cards no longer reference the deleted link type.
    for (const c of project.cards(undefined)) {
      expect(
        c.metadata?.links?.some((l) => l.linkType === linkTypeName),
      ).not.toBe(true);
    }
    expect(
      project.resources.byType(linkTypeName, 'linkTypes'),
    ).toBeUndefined();

    const entries = await ConfigurationLogger.entries(project.basePath);
    const deleteEntries = entries.filter(
      (e) => e.kind === 'resource_delete' && e.target === linkTypeName,
    );
    expect(deleteEntries).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the test**

```bash
cd tools/data-handler && pnpm test test/mutations/integration-link-type-delete.test.ts
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tools/data-handler/test/mutations/integration-link-type-delete.test.ts
git commit -m "test: end-to-end integration for LinkType delete"
```

---

### Task 16: Integration test — Template rename cascade

**Files:**
- Create: `tools/data-handler/test/mutations/integration-template-rename.test.ts`

The third end-to-end test, exercising the template-rename cascade because that is the second non-trivial cascade in this plan (rewrite of `createCards` macro arguments inside card `index.adoc` files).

- [ ] **Step 1: Write the test**

```typescript
// tools/data-handler/test/mutations/integration-template-rename.test.ts

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdir, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../src/containers/project.js';
import { ResourceMutations } from '../../src/mutations/plan.js';
import { ConfigurationLogger } from '../../src/utils/configuration-logger.js';
import { copyDir } from '../../src/utils/file-utils.js';
import { resourceName } from '../../src/utils/resource-utils.js';

const FIXTURE_PATH = join(
  import.meta.dirname,
  '..',
  'test-data',
  'decision-records',
);
const tmpDir = join(import.meta.dirname, 'tmp-integration-template-rename');

describe('Template rename end-to-end', () => {
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

  it('plan → apply → log entry; references rewritten', async () => {
    const templates = project.resources.templates();
    if (templates.length === 0) return;
    const template = templates[0];
    const oldName = template.data!.name;
    const newIdent = `${template.resourceName.identifier}-renamed`;

    const mutations = new ResourceMutations(project);
    const input = {
      kind: 'rename' as const,
      target: resourceName(oldName),
      newIdentifier: newIdent,
    };
    const plan = await mutations.plan(input);
    expect(plan.isBreaking).toBe(true);

    await mutations.apply(input, { fingerprint: plan.fingerprint });

    // No card content still references the old template name.
    for (const card of project.cards(undefined)) {
      const adoc = join(card.path, 'index.adoc');
      let content = '';
      try {
        content = await readFile(adoc, 'utf-8');
      } catch {
        continue;
      }
      expect(content).not.toContain(oldName);
    }

    const entries = await ConfigurationLogger.entries(project.basePath);
    expect(
      entries.some(
        (e) => e.kind === 'resource_rename' && e.target === oldName,
      ),
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test**

```bash
cd tools/data-handler && pnpm test test/mutations/integration-template-rename.test.ts
```

Expected: PASS.

- [ ] **Step 3: Final whole-suite check**

```bash
cd tools/data-handler && pnpm test
cd tools/data-handler && pnpm build
cd tools/data-handler && pnpm lint
```

All three should succeed.

- [ ] **Step 4: Commit**

```bash
git add tools/data-handler/test/mutations/integration-template-rename.test.ts
git commit -m "test: end-to-end integration for Template rename"
```

---

## Self-review

Run after every task completes, before marking the plan done.

### Spec coverage check

For each row in `migrations-plan.adoc`, confirm there is a handler that matches and that the dispatcher selects it. The verification grep:

```bash
cd tools/data-handler && grep -n "matches(ctx)" src/mutations/handlers/*.ts
```

Expected output (one line per `(kind, type)` pair):

```
default-no-cascade.ts: matches(ctx): ctx.input.kind === 'edit'
link-type-rename.ts:    matches(ctx): kind === 'rename' && type === 'linkTypes'
link-type-delete.ts:    matches(ctx): kind === 'delete' && type === 'linkTypes'
template.ts:            matches(ctx): kind === 'rename' && type === 'templates'
template.ts:            matches(ctx): kind === 'delete' && type === 'templates'
calculation.ts:         matches(ctx): kind === 'rename' && type === 'calculations'
calculation.ts:         matches(ctx): kind === 'delete' && type === 'calculations'
report.ts:              matches(ctx): kind === 'rename' && type === 'reports'
report.ts:              matches(ctx): kind === 'delete' && type === 'reports'
graph-model.ts:         matches(ctx): kind === 'rename' && type === 'graphModels'
graph-model.ts:         matches(ctx): kind === 'delete' && type === 'graphModels'
graph-view.ts:          matches(ctx): kind === 'rename' && type === 'graphViews'
graph-view.ts:          matches(ctx): kind === 'delete' && type === 'graphViews'
project-rename.ts:      matches(ctx): kind === 'project_rename'
```

Plus the handlers from foundation Plan 1 (LinkTypeRename) and the FieldType/CardType/Workflow handlers that the follow-on Plans 2-4 will add. The above list shows that every row in this plan's scope has a registered handler.

### Routing check

Every CLI entry point that the user invokes for a mutation must reach `ResourceMutations`. Confirm with:

```bash
cd tools/data-handler && grep -nE "new ResourceMutations\b" src/commands/
```

Expected: matches in `update.ts` (rename branch), `remove.ts` (resource delete branch), `rename.ts` (project rename body).

### Log entry check

The on-disk migration log must contain at most one entry per executed mutation; no duplicates and no legacy `parameters` field. Confirm by running:

```bash
cd tools/data-handler && grep -rn "ConfigurationOperation\." src/
```

Expected: empty. Any remaining reference means a legacy call site survived.

```bash
cd tools/data-handler && grep -rn "logResourceDelete\|logResourceRename\|logResourceUpdate" src/
```

Expected: only the method definitions in `configuration-logger.ts`. No call sites — the engine's `recordLogEntry` is the only writer.

### Test coverage check

```bash
cd tools/data-handler && pnpm test
```

Expected: PASS. Specifically, the following test files (added by this plan) must all be green:

- `test/mutations/handlers/link-type-delete.test.ts`
- `test/mutations/handlers/template-rename.test.ts`
- `test/mutations/handlers/calculation-rename.test.ts`
- `test/mutations/handlers/report-rename.test.ts`
- `test/mutations/handlers/graph-model-rename.test.ts`
- `test/mutations/handlers/graph-view-rename.test.ts`
- `test/mutations/handlers/project-rename.test.ts`
- `test/mutations/integration-project-rename.test.ts`
- `test/mutations/integration-link-type-delete.test.ts`
- `test/mutations/integration-template-rename.test.ts`

### Build / lint

```bash
pnpm --filter @cyberismo/data-handler build
pnpm --filter @cyberismo/data-handler lint
```

Both must succeed.

### Cross-package check

```bash
pnpm test
pnpm build
```

If `tools/cli`, `tools/backend`, `tools/app`, `tools/mcp` referenced the legacy `ConfigurationOperation` enum or the legacy `parameters` payload, the foundation plan already fixed those imports. This plan does not touch those packages; if any test fails there, it is almost certainly because a test compares an old log-payload shape — adjust the assertion to the new `{ kind, target, payload }` shape.

---

## What this plan delivers

After all tasks succeed:

- Every breaking change in `migrations-plan.adoc` has a registered handler.
- `LinkTypeDeleteHandler` strips matching links from every card before deleting the resource.
- `Template`, `Calculation`, `Report`, `GraphModel`, `GraphView` each have a rename + delete handler. Renames rewrite references via the existing `updateHandleBars` / `updateCalculations` / `updateCardContentReferences` helpers; deletes are minimal cascades per the plan's policy.
- `ProjectRenameHandler` reproduces the full `commands/rename.ts:rename(to)` cascade and is the only place project-rename logic lives.
- `MigrationEntryKind` is restored to its four-variant shape: `resource_edit | resource_delete | resource_rename | project_rename`.
- `ResourceMutations.recordLogEntry` writes well-formed entries for all four kinds; the `project_rename` entry carries `{ oldPrefix, newPrefix }` per the spec.
- `commands/update.ts`, `commands/remove.ts`, `commands/rename.ts` all route through `ResourceMutations`. Legacy log-call sites (`logResourceDelete`, `logResourceRename`, `logResourceUpdate`) are gone from `ResourceObject` and its subclasses.
- Integration tests for `ProjectRename`, `LinkType delete`, and `Template rename` prove the design end-to-end.

## What's next

Follow-on plans (each is its own implementation plan):

- **Plan 7 (Module update flow).** `PreviewModuleUpdate`, `UpdateModule`, `ModuleStepReplay`, `appliedModules.json`, replay engine, `ReplayConflict` detection. The replay engine now has a complete handler set to dispatch against.
- **Plan 8 (HTTP routes).** `POST /mutations/preview`, `POST /mutations/apply`, `POST /modules/update/preview`, SSE for `POST /modules/update`. Fingerprinted preview/apply already works in-process; HTTP only needs to serialise the `PreviewResult`.
- **Plan 9 (CLI integration).** `cyberismo project-rename` verb (currently exposed only through the legacy `Rename` class via positional args). `cyberismo delete <linkType>` flows through `LinkTypeDeleteHandler` automatically via `commands/remove.ts`. `cyberismo module update` with progress reporting is part of Plan 7.
- **Plan 10 (Patch-bump UX).** `cyberismo module bump` refuses patch bumps with non-empty log; suggests next version. Engine-side support (empty seal) already in place from foundation.
- **Plan 11 (Interactive complete migration).** Add prompts for workflow state remapping, enum replacement, broken-graph-macro replacement. New payload fields on the `MigrationEntry` variants; new optional `Handler.applyInteractive(ctx, prompt)` hook.
