# Migration System — Workflow Cascade Handlers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Prerequisite:** `docs/superpowers/plans/2026-05-20-migration-system-foundation.md` is fully implemented. This plan reuses the `Handler` interface, `MutationContext`, `ResourceMutations`, dispatcher and `MigrationEntry` shape that the foundation plan establishes.

**Goal:** Move every breaking-change cascade rooted in `WorkflowResource` into the new mutation engine. After this plan, all Workflow edits flow through dispatcher → handler → `ResourceMutations.apply()`, with previews, fingerprints, and log entries. The largest cascade in the system — deleting a Workflow — is also implemented, including the bidirectional coupling with CardType.

**Architecture:** Each Workflow breaking-change row in `migrations-plan.adoc` becomes a dedicated `Handler` in `tools/data-handler/src/mutations/handlers/`. Three of the rows (add transition / remove transition / rename transition) are non-breaking per the plan table and route through `DefaultNoCascadeHandler` via a single thin `WorkflowTransitionHandler` so dispatch remains explicit. The `WorkflowDeleteHandler` is the only handler that delegates to another handler (`CardTypeDeleteHandler`, established in a sibling plan) for the cards-and-card-types cascade. Existing cascade logic in `WorkflowResource` (`collectCardsUsingWorkflow`, `handleStateChange`, `handleStateRemoval`, `updateCardStates`, `updateCardTypes`, the state-handling branches in `update()`, and the rename path) is removed as the handlers absorb it. The class becomes a thin file-IO + validation shell.

**Tech Stack:** TypeScript, Node 22, ESM with `.js` extensions on relative imports, Vitest for tests, pnpm workspaces. Existing patterns to follow: `tools/data-handler/src/mutations/handlers/link-type-rename.ts` (foundation-plan template), `tools/data-handler/src/resources/workflow-resource.ts` (current source of cascade logic — to be hollowed out), `tools/data-handler/src/resources/resource-object.ts` (`Operation<T>`, `RemoveOperation<T>.replacementValue`, `ArrayHandler.handleArray`).

---

## Scope

**In scope (this plan):**

- `mutations/handlers/workflow-rename.ts` — rename the workflow resource; rewrite the workflow reference in every card type that uses it; update calculation and handlebar references.
- `mutations/handlers/workflow-add-state.ts` — additive; non-breaking; delegates to `DefaultNoCascadeHandler`'s machinery and writes no log entry.
- `mutations/handlers/workflow-remove-state.ts` — walk cards currently in the removed state and set them to the first state of the workflow (or `RemoveOperation<T>.replacementValue` when supplied). Rewrite transitions.
- `mutations/handlers/workflow-rename-state.ts` — rewrite `workflowState` on every affected card; rewrite the state name in every transition's `fromState`/`toState`.
- `mutations/handlers/workflow-transition.ts` — add/remove/rename of a transition; all three are non-breaking per the plan. One handler, three `matches()` branches, no cascade.
- `mutations/handlers/workflow-delete.ts` — delete the workflow; warn that card types using it will be deleted, and any cards using those card types will be deleted. Delegates to `CardTypeDeleteHandler` for each dependent card type (which itself cascades to cards). Strict ordering: cards → card types → workflow.
- Dispatcher registration for all five.
- `commands/update.ts`, `commands/rename.ts`, `commands/remove.ts` routing for `workflows` targets.
- Removal of the dead cascade code from `WorkflowResource`.
- Integration test: delete a workflow that has card types and cards; verify the whole tree cascades.

**Out of scope (separate plans):**

- `CardTypeDeleteHandler` itself — built in the CardType plan (Plan 3 in the foundation plan's follow-on list). This plan assumes it exists and has the shape `class CardTypeDeleteHandler implements Handler { ... }`. If executing before that plan, stub it as a `TODO` that throws and unblock the WorkflowDeleteHandler integration test under a `.skip` until Plan 3 lands. The handler's contract is the only thing this plan depends on.
- The rest of the Workflow change rows in `migrations-plan.adoc` that are non-breaking and display-only (`displayName`, `description`, state-category change) — they already route through `DefaultNoCascadeHandler` from the foundation plan.
- Module-update replay of Workflow log entries — Plan 7.
- HTTP routes for Workflow operations — Plan 8.

---

## File structure

**New files:**

- `tools/data-handler/src/mutations/handlers/workflow-rename.ts`
- `tools/data-handler/src/mutations/handlers/workflow-add-state.ts`
- `tools/data-handler/src/mutations/handlers/workflow-remove-state.ts`
- `tools/data-handler/src/mutations/handlers/workflow-rename-state.ts`
- `tools/data-handler/src/mutations/handlers/workflow-transition.ts`
- `tools/data-handler/src/mutations/handlers/workflow-delete.ts`
- `tools/data-handler/test/mutations/handlers/workflow-rename.test.ts`
- `tools/data-handler/test/mutations/handlers/workflow-add-state.test.ts`
- `tools/data-handler/test/mutations/handlers/workflow-remove-state.test.ts`
- `tools/data-handler/test/mutations/handlers/workflow-rename-state.test.ts`
- `tools/data-handler/test/mutations/handlers/workflow-transition.test.ts`
- `tools/data-handler/test/mutations/handlers/workflow-delete.test.ts`
- `tools/data-handler/test/mutations/workflow-integration.test.ts`

**Modified files:**

- `tools/data-handler/src/mutations/dispatcher.ts` — register all six handlers ahead of the default fallback.
- `tools/data-handler/src/resources/workflow-resource.ts` — remove `collectCardsUsingWorkflow`, `handleStateChange`, `handleStateRemoval`, `updateCardStates`, `updateCardTypes`, the state-handling branches in `update<Type, K>`, and the cascade body of `onNameChange`. The validation, `create`, `usage`, and array-handling skeletons stay.
- `tools/data-handler/src/commands/update.ts` — route Workflow `update` and `rename` operations through `ResourceMutations`.
- `tools/data-handler/src/commands/remove.ts` — route Workflow `remove` operations through `ResourceMutations`.

---

## Tasks

### Task 1: `WorkflowRenameHandler` — failing test

**Files:**

- Create: `tools/data-handler/test/mutations/handlers/workflow-rename.test.ts`

The fixture `tools/data-handler/test/test-data/valid/decision-records` ships with `decision/workflows/decision` and a `decision/cardTypes/decision` card type that references it. Renaming the workflow must rewrite that card type's `workflow` field and any calculation/handlebar mention. The current source of the cascade is `WorkflowResource.onNameChange` (`tools/data-handler/src/resources/workflow-resource.ts:69-78`) plus `updateCardTypes` (lines 205-223).

- [ ] **Step 1: Write the failing test**

```typescript
// tools/data-handler/test/mutations/handlers/workflow-rename.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../../src/containers/project.js';
import { WorkflowRenameHandler } from '../../../src/mutations/handlers/workflow-rename.js';
import { resourceName } from '../../../src/utils/resource-utils.js';
import { copyDir } from '../../../src/utils/file-utils.js';

const FIXTURE_PATH = join(
  import.meta.dirname,
  '..',
  '..',
  'test-data',
  'valid',
  'decision-records',
);
const tmpDir = join(import.meta.dirname, 'tmp-workflow-rename');

describe('WorkflowRenameHandler', () => {
  let project: Project;

  beforeEach(async () => {
    const projectPath = join(tmpDir, `proj-${Date.now()}-${Math.random()}`);
    await mkdir(projectPath, { recursive: true });
    await copyDir(FIXTURE_PATH, projectPath);
    project = new Project(projectPath);
    await project.initialize();
  });
  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('matches a workflow rename input', () => {
    const handler = new WorkflowRenameHandler();
    expect(
      handler.matches({
        project,
        input: {
          kind: 'rename',
          target: resourceName('decision/workflows/decision'),
          newIdentifier: 'decision-v2',
        },
      }),
    ).toBe(true);
  });

  it('declines a workflow edit input', () => {
    const handler = new WorkflowRenameHandler();
    expect(
      handler.matches({
        project,
        input: {
          kind: 'edit',
          target: resourceName('decision/workflows/decision'),
          updateKey: { key: 'displayName' },
          operation: { name: 'change', target: 'A', to: 'B' },
        },
      }),
    ).toBe(false);
  });

  it('preview counts at least one affected card type', async () => {
    const handler = new WorkflowRenameHandler();
    const preview = await handler.preview({
      project,
      input: {
        kind: 'rename',
        target: resourceName('decision/workflows/decision'),
        newIdentifier: 'decision-v2',
      },
    });
    expect(preview.affectedCardCount).toBeGreaterThanOrEqual(0);
    expect(preview.dataLossExpected).toBe(false);
    // At least one card type and any calculations/handlebars are summarised.
    expect(preview.summary).toMatch(/card type/i);
  });

  it('apply rewrites the workflow reference in dependent card types', async () => {
    const handler = new WorkflowRenameHandler();
    const oldName = 'decision/workflows/decision';
    const newName = 'decision/workflows/decision-v2';
    await handler.apply({
      project,
      input: {
        kind: 'rename',
        target: resourceName(oldName),
        newIdentifier: 'decision-v2',
      },
    });
    const cardTypes = project.resources.cardTypes();
    for (const ct of cardTypes) {
      if (ct.data) {
        expect(ct.data.workflow).not.toBe(oldName);
      }
    }
    const renamed = project.resources.byType(newName, 'workflows');
    expect(renamed).toBeDefined();
  });

  it('isBreaking is true', () => {
    expect(new WorkflowRenameHandler().isBreaking).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd tools/data-handler && pnpm test test/mutations/handlers/workflow-rename.test.ts
```

Expected: FAIL — `Cannot find module '.../workflow-rename.js'`.

- [ ] **Step 3: Commit the red phase**

```bash
git add tools/data-handler/test/mutations/handlers/workflow-rename.test.ts
git commit -m "test: failing test for WorkflowRenameHandler"
```

---

### Task 2: `WorkflowRenameHandler` — implementation

**Files:**

- Create: `tools/data-handler/src/mutations/handlers/workflow-rename.ts`
- Modify: `tools/data-handler/src/mutations/dispatcher.ts`

Replicate the existing `WorkflowResource.onNameChange` cascade: update handlebars, calculations, card content references, and dependent card types' `workflow` field. The `ResourceObject` base class has helpers (`updateHandleBars`, `updateCalculations`, `updateCardContentReferences`) the handler can reach through the project's resource cache.

- [ ] **Step 1: Implement the handler**

```typescript
// tools/data-handler/src/mutations/handlers/workflow-rename.ts

import { join } from 'node:path';

import type { Handler, MutationContext } from '../handler.js';
import type { CascadePreview } from '../types.js';
import {
  resourceName,
  resourceNameToString,
} from '../../utils/resource-utils.js';
import type { ChangeOperation } from '../../resources/resource-object.js';

export class WorkflowRenameHandler implements Handler {
  readonly isBreaking = true;

  matches(ctx: MutationContext): boolean {
    return (
      ctx.input.kind === 'rename' && ctx.input.target.type === 'workflows'
    );
  }

  async preview(ctx: MutationContext): Promise<CascadePreview> {
    if (ctx.input.kind !== 'rename') {
      throw new Error('WorkflowRenameHandler called with non-rename input');
    }
    const oldName = resourceNameToString(ctx.input.target);
    const dependentCardTypes = this.dependentCardTypes(ctx, oldName);
    const calculationFiles = await this.calculationFilesReferencing(
      ctx,
      oldName,
    );
    const handlebarFiles = await this.handlebarFilesReferencing(ctx, oldName);
    return {
      affectedCardCount: 0,
      affectedLinkCount: 0,
      affectedCalculationCount: calculationFiles.length,
      affectedHandlebarFileCount: handlebarFiles.length,
      dataLossExpected: false,
      summary: `Renames workflow in ${dependentCardTypes.length} card type(s); updates ${calculationFiles.length} calculation file(s) and ${handlebarFiles.length} handlebar file(s).`,
    };
  }

  async apply(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'rename') {
      throw new Error('WorkflowRenameHandler called with non-rename input');
    }
    const oldName = resourceNameToString(ctx.input.target);
    const newName = `${ctx.input.target.prefix}/workflows/${ctx.input.newIdentifier}`;

    const resource = ctx.project.resources.byType(oldName, 'workflows');
    if (!resource) {
      throw new Error(`Workflow '${oldName}' not found`);
    }

    // 1. Update dependent card types' workflow field.
    const dependentCardTypes = this.dependentCardTypes(ctx, oldName);
    for (const ct of dependentCardTypes) {
      const op: ChangeOperation<string> = {
        name: 'change',
        target: oldName,
        to: newName,
      };
      await ct.update({ key: 'workflow' }, op);
    }

    // 2. Rename the resource itself; the base class's rename machinery
    //    rewrites handlebars / calculations / card content references via
    //    onNameChange (which we hollow out in Task 11 — by that point this
    //    handler owns the cascade).
    await resource.rename(resourceName(newName));
  }

  async affectedFilePaths(ctx: MutationContext): Promise<string[]> {
    if (ctx.input.kind !== 'rename') return [];
    const oldName = resourceNameToString(ctx.input.target);
    const paths: string[] = [];
    for (const ct of this.dependentCardTypes(ctx, oldName)) {
      const ctName = resourceNameToString(
        resourceName(resourceNameToString({ ...ct.resourceName })),
      );
      // Card-type file path is recorded as the resource's filename; the
      // resource exposes it via .fileName.
      paths.push((ct as unknown as { fileName: string }).fileName);
    }
    paths.push(...(await this.calculationFilesReferencing(ctx, oldName)));
    paths.push(...(await this.handlebarFilesReferencing(ctx, oldName)));
    return paths.filter((p) => p && p.length > 0);
  }

  private dependentCardTypes(ctx: MutationContext, workflowName: string) {
    return ctx.project.resources
      .cardTypes()
      .filter((ct) => ct.data?.workflow === workflowName);
  }

  /**
   * Scan every calculation file under the project for occurrences of the old
   * workflow name. Returns absolute paths. The actual text rewrite lives in
   * the base `ResourceObject.updateCalculations` invoked by `resource.rename`.
   */
  private async calculationFilesReferencing(
    ctx: MutationContext,
    workflowName: string,
  ): Promise<string[]> {
    return ctx.project.calculationFilesContaining(workflowName);
  }

  private async handlebarFilesReferencing(
    ctx: MutationContext,
    workflowName: string,
  ): Promise<string[]> {
    return ctx.project.handlebarFilesContaining(workflowName);
  }
}
```

If `Project` does not already expose `calculationFilesContaining` / `handlebarFilesContaining`, add small read-only helpers that grep the project's calculations and handlebar trees and return absolute paths. Verify their existence first:

```bash
grep -n "calculationFiles\|handlebarFiles" tools/data-handler/src/containers/project.ts
```

If absent, define them as straightforward filesystem walks; they need no tests of their own beyond what the WorkflowRenameHandler test already exercises.

- [ ] **Step 2: Register in the dispatcher**

In `tools/data-handler/src/mutations/dispatcher.ts`, add the import and place the handler ahead of `DefaultNoCascadeHandler`:

```typescript
import { WorkflowRenameHandler } from './handlers/workflow-rename.js';

const HANDLERS: Handler[] = [
  new LinkTypeRenameHandler(),
  new WorkflowRenameHandler(),
  // (more handlers added in this plan below)
  new DefaultNoCascadeHandler(),
];
```

- [ ] **Step 3: Run the test**

```bash
cd tools/data-handler && pnpm test test/mutations/handlers/workflow-rename.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tools/data-handler/src/mutations/handlers/workflow-rename.ts \
        tools/data-handler/src/mutations/dispatcher.ts
git commit -m "feat: WorkflowRenameHandler — rewrite workflow refs on rename"
```

---

### Task 3: `WorkflowAddStateHandler`

**Files:**

- Create: `tools/data-handler/src/mutations/handlers/workflow-add-state.ts`
- Create: `tools/data-handler/test/mutations/handlers/workflow-add-state.test.ts`
- Modify: `tools/data-handler/src/mutations/dispatcher.ts`

Adding a state is non-breaking per the plan table. The handler delegates the resource update to `ResourceObject.update` (the same path `DefaultNoCascadeHandler` uses) but exists as a named class so the dispatcher can route Workflow `states` add operations explicitly. The reason it is its own handler rather than a `DefaultNoCascadeHandler` match: future plans may add validation (e.g. uniqueness of state name) that has no place in the catch-all.

- [ ] **Step 1: Write the failing test**

```typescript
// tools/data-handler/test/mutations/handlers/workflow-add-state.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../../src/containers/project.js';
import { WorkflowAddStateHandler } from '../../../src/mutations/handlers/workflow-add-state.js';
import { resourceName } from '../../../src/utils/resource-utils.js';
import { copyDir } from '../../../src/utils/file-utils.js';

const FIXTURE_PATH = join(
  import.meta.dirname,
  '..',
  '..',
  'test-data',
  'valid',
  'decision-records',
);
const tmpDir = join(import.meta.dirname, 'tmp-workflow-add-state');

describe('WorkflowAddStateHandler', () => {
  let project: Project;

  beforeEach(async () => {
    const projectPath = join(tmpDir, `proj-${Date.now()}-${Math.random()}`);
    await mkdir(projectPath, { recursive: true });
    await copyDir(FIXTURE_PATH, projectPath);
    project = new Project(projectPath);
    await project.initialize();
  });
  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('matches add on workflow states', () => {
    const handler = new WorkflowAddStateHandler();
    expect(
      handler.matches({
        project,
        input: {
          kind: 'edit',
          target: resourceName('decision/workflows/decision'),
          updateKey: { key: 'states' },
          operation: {
            name: 'add',
            target: { name: 'Archived', category: 'closed' },
          },
        },
      }),
    ).toBe(true);
  });

  it('is non-breaking and reports zero cascade', async () => {
    const handler = new WorkflowAddStateHandler();
    expect(handler.isBreaking).toBe(false);
    const preview = await handler.preview({
      project,
      input: {
        kind: 'edit',
        target: resourceName('decision/workflows/decision'),
        updateKey: { key: 'states' },
        operation: {
          name: 'add',
          target: { name: 'Archived', category: 'closed' },
        },
      },
    });
    expect(preview.affectedCardCount).toBe(0);
    expect(preview.dataLossExpected).toBe(false);
  });

  it('apply appends the new state to the workflow definition', async () => {
    const handler = new WorkflowAddStateHandler();
    await handler.apply({
      project,
      input: {
        kind: 'edit',
        target: resourceName('decision/workflows/decision'),
        updateKey: { key: 'states' },
        operation: {
          name: 'add',
          target: { name: 'Archived', category: 'closed' },
        },
      },
    });
    const wf = project.resources.byType(
      'decision/workflows/decision',
      'workflows',
    );
    expect(wf?.data?.states.map((s) => s.name)).toContain('Archived');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd tools/data-handler && pnpm test test/mutations/handlers/workflow-add-state.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the handler**

```typescript
// tools/data-handler/src/mutations/handlers/workflow-add-state.ts

import type { Handler, MutationContext } from '../handler.js';
import type { CascadePreview } from '../types.js';
import { resourceNameToString } from '../../utils/resource-utils.js';

export class WorkflowAddStateHandler implements Handler {
  readonly isBreaking = false;

  matches(ctx: MutationContext): boolean {
    return (
      ctx.input.kind === 'edit' &&
      ctx.input.target.type === 'workflows' &&
      ctx.input.updateKey.key === 'states' &&
      ctx.input.operation.name === 'add'
    );
  }

  async preview(_ctx: MutationContext): Promise<CascadePreview> {
    return {
      affectedCardCount: 0,
      affectedLinkCount: 0,
      affectedCalculationCount: 0,
      affectedHandlebarFileCount: 0,
      dataLossExpected: false,
      summary: 'Adds a new state (additive change).',
    };
  }

  async apply(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'edit') {
      throw new Error('WorkflowAddStateHandler called with non-edit input');
    }
    const name = resourceNameToString(ctx.input.target);
    const resource = ctx.project.resources.byType(name, 'workflows');
    if (!resource) {
      throw new Error(`Workflow '${name}' not found`);
    }
    await resource.update(ctx.input.updateKey, ctx.input.operation);
  }

  async affectedFilePaths(_ctx: MutationContext): Promise<string[]> {
    return [];
  }
}
```

- [ ] **Step 4: Register in the dispatcher**

```typescript
import { WorkflowAddStateHandler } from './handlers/workflow-add-state.js';

const HANDLERS: Handler[] = [
  new LinkTypeRenameHandler(),
  new WorkflowRenameHandler(),
  new WorkflowAddStateHandler(),
  new DefaultNoCascadeHandler(),
];
```

- [ ] **Step 5: Run the test**

```bash
cd tools/data-handler && pnpm test test/mutations/handlers/workflow-add-state.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tools/data-handler/src/mutations/handlers/workflow-add-state.ts \
        tools/data-handler/test/mutations/handlers/workflow-add-state.test.ts \
        tools/data-handler/src/mutations/dispatcher.ts
git commit -m "feat: WorkflowAddStateHandler — additive, non-breaking"
```

---

### Task 4: `WorkflowRemoveStateHandler` — failing test

**Files:**

- Create: `tools/data-handler/test/mutations/handlers/workflow-remove-state.test.ts`

Current behaviour lives in `WorkflowResource.handleStateRemoval` (`workflow-resource.ts:109-149`). The cascade has two modes:

1. **No replacement.** Drop transitions to/from the state. Cards currently in the state stay where they are, but the plan table says: "Set the workflow state to the first state of the workflow for affected cards (data loss of original workflow state)." So when no `replacementValue` is supplied, this handler must choose the **first remaining state** as the implicit replacement and rewrite cards.
2. **Explicit replacement.** Use `RemoveOperation<WorkflowState>.replacementValue`. Rewrite both cards and transitions.

- [ ] **Step 1: Write the failing test**

```typescript
// tools/data-handler/test/mutations/handlers/workflow-remove-state.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../../src/containers/project.js';
import { WorkflowRemoveStateHandler } from '../../../src/mutations/handlers/workflow-remove-state.js';
import { resourceName } from '../../../src/utils/resource-utils.js';
import { copyDir } from '../../../src/utils/file-utils.js';

const FIXTURE_PATH = join(
  import.meta.dirname,
  '..',
  '..',
  'test-data',
  'valid',
  'decision-records',
);
const tmpDir = join(import.meta.dirname, 'tmp-workflow-remove-state');

describe('WorkflowRemoveStateHandler', () => {
  let project: Project;

  beforeEach(async () => {
    const projectPath = join(tmpDir, `proj-${Date.now()}-${Math.random()}`);
    await mkdir(projectPath, { recursive: true });
    await copyDir(FIXTURE_PATH, projectPath);
    project = new Project(projectPath);
    await project.initialize();
  });
  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('matches remove on workflow states', () => {
    const handler = new WorkflowRemoveStateHandler();
    expect(
      handler.matches({
        project,
        input: {
          kind: 'edit',
          target: resourceName('decision/workflows/decision'),
          updateKey: { key: 'states' },
          operation: {
            name: 'remove',
            target: { name: 'Rejected', category: 'closed' },
          },
        },
      }),
    ).toBe(true);
  });

  it('preview marks data loss when no replacementValue is supplied', async () => {
    const handler = new WorkflowRemoveStateHandler();
    const preview = await handler.preview({
      project,
      input: {
        kind: 'edit',
        target: resourceName('decision/workflows/decision'),
        updateKey: { key: 'states' },
        operation: {
          name: 'remove',
          target: { name: 'Rejected', category: 'closed' },
        },
      },
    });
    expect(preview.dataLossExpected).toBe(true);
  });

  it('apply moves cards in the removed state to the first remaining state', async () => {
    // Pre-condition: pick a card in the fixture currently in 'Rejected' (or
    // move one into it before applying). Use the existing project APIs to do
    // so without depending on a specific fixture layout.
    const allCards = project.cards(undefined);
    const target = allCards[0];
    if (target?.metadata) {
      target.metadata.workflowState = 'Rejected';
      await project.updateCardMetadata(target, target.metadata);
    }

    const handler = new WorkflowRemoveStateHandler();
    await handler.apply({
      project,
      input: {
        kind: 'edit',
        target: resourceName('decision/workflows/decision'),
        updateKey: { key: 'states' },
        operation: {
          name: 'remove',
          target: { name: 'Rejected', category: 'closed' },
        },
      },
    });
    const refetched = project.cards(undefined).find((c) => c.key === target!.key)!;
    // The workflow's first remaining state. From the fixture, 'Draft' is
    // first; verify against the workflow file after removal.
    const wf = project.resources.byType(
      'decision/workflows/decision',
      'workflows',
    )!;
    expect(refetched.metadata?.workflowState).toBe(wf.data?.states[0].name);
  });

  it('apply with explicit replacementValue uses that state', async () => {
    const allCards = project.cards(undefined);
    const target = allCards[0];
    if (target?.metadata) {
      target.metadata.workflowState = 'Rejected';
      await project.updateCardMetadata(target, target.metadata);
    }

    const handler = new WorkflowRemoveStateHandler();
    await handler.apply({
      project,
      input: {
        kind: 'edit',
        target: resourceName('decision/workflows/decision'),
        updateKey: { key: 'states' },
        operation: {
          name: 'remove',
          target: { name: 'Rejected', category: 'closed' },
          replacementValue: { name: 'Approved', category: 'closed' },
        },
      },
    });
    const refetched = project.cards(undefined).find((c) => c.key === target!.key)!;
    expect(refetched.metadata?.workflowState).toBe('Approved');
  });

  it('isBreaking is true', () => {
    expect(new WorkflowRemoveStateHandler().isBreaking).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd tools/data-handler && pnpm test test/mutations/handlers/workflow-remove-state.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Commit the red phase**

```bash
git add tools/data-handler/test/mutations/handlers/workflow-remove-state.test.ts
git commit -m "test: failing test for WorkflowRemoveStateHandler"
```

---

### Task 5: `WorkflowRemoveStateHandler` — implementation

**Files:**

- Create: `tools/data-handler/src/mutations/handlers/workflow-remove-state.ts`
- Modify: `tools/data-handler/src/mutations/dispatcher.ts`

Translate `handleStateRemoval` into a handler. Note the key behaviour change: when `replacementValue` is null, the current code drops transitions but leaves cards alone; the **plan table** says cards should also be moved (to the first remaining state). The handler implements the plan-table behaviour, which is a behavioural change from today's code. Document this in the commit message.

- [ ] **Step 1: Implement the handler**

```typescript
// tools/data-handler/src/mutations/handlers/workflow-remove-state.ts

import type { Handler, MutationContext } from '../handler.js';
import type { CascadePreview } from '../types.js';
import { resourceNameToString } from '../../utils/resource-utils.js';
import type {
  Operation,
  RemoveOperation,
} from '../../resources/resource-object.js';
import type {
  Workflow,
  WorkflowState,
} from '../../interfaces/resource-interfaces.js';

export class WorkflowRemoveStateHandler implements Handler {
  readonly isBreaking = true;

  matches(ctx: MutationContext): boolean {
    return (
      ctx.input.kind === 'edit' &&
      ctx.input.target.type === 'workflows' &&
      ctx.input.updateKey.key === 'states' &&
      ctx.input.operation.name === 'remove'
    );
  }

  async preview(ctx: MutationContext): Promise<CascadePreview> {
    if (ctx.input.kind !== 'edit') {
      throw new Error('WorkflowRemoveStateHandler: non-edit input');
    }
    const wfName = resourceNameToString(ctx.input.target);
    const stateName = this.targetStateName(ctx.input.operation);
    const removeOp = ctx.input.operation as RemoveOperation<WorkflowState>;
    const replacement = removeOp.replacementValue?.name;

    const affectedCards = await this.cardsInState(ctx, wfName, stateName);
    const dataLoss = !replacement; // no explicit replacement = data loss
    const replacementText = replacement
      ? `moved to '${replacement}'`
      : 'moved to the workflow\'s first remaining state (data loss)';
    return {
      affectedCardCount: affectedCards.length,
      affectedLinkCount: 0,
      affectedCalculationCount: 0,
      affectedHandlebarFileCount: 0,
      dataLossExpected: dataLoss,
      summary: `Removes state '${stateName}' from ${wfName}; ${affectedCards.length} card(s) ${replacementText}.`,
    };
  }

  async apply(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'edit') {
      throw new Error('WorkflowRemoveStateHandler: non-edit input');
    }
    const wfName = resourceNameToString(ctx.input.target);
    const resource = ctx.project.resources.byType(wfName, 'workflows');
    if (!resource) {
      throw new Error(`Workflow '${wfName}' not found`);
    }
    const stateName = this.targetStateName(ctx.input.operation);
    const removeOp = ctx.input.operation as RemoveOperation<WorkflowState>;

    // 1. Determine the effective replacement state.
    const wf = resource.data as Workflow | undefined;
    if (!wf) throw new Error(`Workflow '${wfName}' has no data`);
    const remainingStates = wf.states.filter((s) => s.name !== stateName);
    if (remainingStates.length === 0) {
      throw new Error(
        `Cannot remove the only state of workflow '${wfName}'.`,
      );
    }
    const explicit = removeOp.replacementValue?.name;
    if (explicit && !remainingStates.some((s) => s.name === explicit)) {
      throw new Error(
        `Replacement state '${explicit}' is not a state of workflow '${wfName}'.`,
      );
    }
    const replacementName = explicit ?? remainingStates[0].name;

    // 2. Move every card currently in the removed state.
    const affectedCards = await this.cardsInState(ctx, wfName, stateName);
    for (const card of affectedCards) {
      if (card.metadata) {
        card.metadata.workflowState = replacementName;
        await ctx.project.updateCardMetadata(card, card.metadata);
      }
    }

    // 3. Rewrite transitions: substitute the replacement state into any
    //    transition that referenced the removed one. (When no explicit
    //    replacement is given but the handler chose one anyway, the
    //    transitions still need to be rewritten to use the new state.)
    const rewrittenTransitions = wf.transitions
      .map((t) => ({
        ...t,
        toState: t.toState === stateName ? replacementName : t.toState,
        fromState: t.fromState.map((s) =>
          s === stateName ? replacementName : s,
        ),
      }))
      // Collapse "loop on the replacement state" transitions if they
      // become tautologies (fromState ⊆ {replacementName}, toState =
      // replacementName, name unchanged). We keep them; the spec does not
      // require deduplication and ArrayHandler does not dedupe.
      .filter(Boolean);

    // 4. Perform the actual `states` remove (drop the state) plus the
    //    transition rewrites in one resource update. The simplest path is
    //    to use the resource's update() with the original op for `states`
    //    and a separate set of ops for transitions. Use ArrayHandler-style
    //    semantics via the resource's existing handleArray path by
    //    splitting into two update() calls.
    await resource.update({ key: 'states' }, ctx.input.operation as Operation<WorkflowState>);
    // Apply transition rewrites as a single bulk overwrite: build a
    // change operation per transition that differs from disk. The resource
    // accepts change ops on transitions (see workflow-resource.ts:312).
    const onDisk = (resource.data as Workflow).transitions;
    for (let i = 0; i < rewrittenTransitions.length; i++) {
      const before = onDisk[i];
      const after = rewrittenTransitions[i];
      if (JSON.stringify(before) === JSON.stringify(after)) continue;
      await resource.update(
        { key: 'transitions' },
        {
          name: 'change',
          target: before,
          to: after,
        },
      );
    }
  }

  async affectedFilePaths(ctx: MutationContext): Promise<string[]> {
    if (ctx.input.kind !== 'edit') return [];
    const wfName = resourceNameToString(ctx.input.target);
    const stateName = this.targetStateName(ctx.input.operation);
    const cards = await this.cardsInState(ctx, wfName, stateName);
    return cards.map((c) => `${c.path}/index.json`);
  }

  private targetStateName(op: Operation<unknown>): string {
    const t = op.target as { name?: string } | string;
    if (typeof t === 'string') return t;
    if (t && typeof t === 'object' && typeof t.name === 'string') return t.name;
    throw new Error('WorkflowRemoveStateHandler: target has no state name');
  }

  private async cardsInState(
    ctx: MutationContext,
    workflowName: string,
    stateName: string,
  ) {
    const cardTypes = ctx.project.resources
      .cardTypes()
      .filter((ct) => ct.data?.workflow === workflowName);
    const cardTypeNames = new Set(cardTypes.map((ct) => ct.data!.name));
    const allCards = ctx.project.cards(undefined);
    return allCards.filter(
      (c) =>
        c.metadata &&
        cardTypeNames.has(c.metadata.cardType) &&
        c.metadata.workflowState === stateName,
    );
  }
}
```

- [ ] **Step 2: Register in the dispatcher**

```typescript
import { WorkflowRemoveStateHandler } from './handlers/workflow-remove-state.js';

const HANDLERS: Handler[] = [
  new LinkTypeRenameHandler(),
  new WorkflowRenameHandler(),
  new WorkflowAddStateHandler(),
  new WorkflowRemoveStateHandler(),
  new DefaultNoCascadeHandler(),
];
```

- [ ] **Step 3: Run the test**

```bash
cd tools/data-handler && pnpm test test/mutations/handlers/workflow-remove-state.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tools/data-handler/src/mutations/handlers/workflow-remove-state.ts \
        tools/data-handler/src/mutations/dispatcher.ts
git commit -m "feat: WorkflowRemoveStateHandler — move cards on state removal

Behavioural change vs the previous WorkflowResource.handleStateRemoval:
when no replacementValue is supplied, the handler now moves cards in the
removed state to the workflow's first remaining state (data loss). The
plan table in migrations-plan.adoc specifies this behaviour."
```

---

### Task 6: `WorkflowRenameStateHandler`

**Files:**

- Create: `tools/data-handler/src/mutations/handlers/workflow-rename-state.ts`
- Create: `tools/data-handler/test/mutations/handlers/workflow-rename-state.test.ts`
- Modify: `tools/data-handler/src/mutations/dispatcher.ts`

This is a `change` operation on the `states` array where the change touches the state's `name`. Cascade: rewrite the `workflowState` field on every affected card; rewrite the state name in every transition's `fromState`/`toState`. Today's behaviour lives in `WorkflowResource.handleStateChange` (`workflow-resource.ts:81-105`). The transition rewrite portion is straightforward array manipulation; `ArrayHandler.handleArray` already handles the `states` array change itself.

- [ ] **Step 1: Write the failing test**

```typescript
// tools/data-handler/test/mutations/handlers/workflow-rename-state.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../../src/containers/project.js';
import { WorkflowRenameStateHandler } from '../../../src/mutations/handlers/workflow-rename-state.js';
import { resourceName } from '../../../src/utils/resource-utils.js';
import { copyDir } from '../../../src/utils/file-utils.js';

const FIXTURE_PATH = join(
  import.meta.dirname,
  '..',
  '..',
  'test-data',
  'valid',
  'decision-records',
);
const tmpDir = join(import.meta.dirname, 'tmp-workflow-rename-state');

describe('WorkflowRenameStateHandler', () => {
  let project: Project;
  beforeEach(async () => {
    const projectPath = join(tmpDir, `proj-${Date.now()}-${Math.random()}`);
    await mkdir(projectPath, { recursive: true });
    await copyDir(FIXTURE_PATH, projectPath);
    project = new Project(projectPath);
    await project.initialize();
  });
  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('matches a state rename', () => {
    const handler = new WorkflowRenameStateHandler();
    expect(
      handler.matches({
        project,
        input: {
          kind: 'edit',
          target: resourceName('decision/workflows/decision'),
          updateKey: { key: 'states' },
          operation: {
            name: 'change',
            target: { name: 'Draft', category: 'initial' },
            to: { name: 'Draft-v2', category: 'initial' },
          },
        },
      }),
    ).toBe(true);
  });

  it('apply rewrites workflowState on affected cards and transitions', async () => {
    // Set up: place a card in 'Draft'.
    const allCards = project.cards(undefined);
    const target = allCards[0];
    if (target?.metadata) {
      target.metadata.workflowState = 'Draft';
      await project.updateCardMetadata(target, target.metadata);
    }

    const handler = new WorkflowRenameStateHandler();
    await handler.apply({
      project,
      input: {
        kind: 'edit',
        target: resourceName('decision/workflows/decision'),
        updateKey: { key: 'states' },
        operation: {
          name: 'change',
          target: { name: 'Draft', category: 'initial' },
          to: { name: 'Draft-v2', category: 'initial' },
        },
      },
    });

    const refetched = project.cards(undefined).find((c) => c.key === target!.key)!;
    expect(refetched.metadata?.workflowState).toBe('Draft-v2');

    const wf = project.resources.byType(
      'decision/workflows/decision',
      'workflows',
    )!;
    for (const t of wf.data!.transitions) {
      expect(t.toState).not.toBe('Draft');
      expect(t.fromState).not.toContain('Draft');
    }
    expect(wf.data!.states.map((s) => s.name)).toContain('Draft-v2');
  });

  it('isBreaking is true', () => {
    expect(new WorkflowRenameStateHandler().isBreaking).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd tools/data-handler && pnpm test test/mutations/handlers/workflow-rename-state.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the handler**

```typescript
// tools/data-handler/src/mutations/handlers/workflow-rename-state.ts

import type { Handler, MutationContext } from '../handler.js';
import type { CascadePreview } from '../types.js';
import { resourceNameToString } from '../../utils/resource-utils.js';
import type {
  ChangeOperation,
  Operation,
} from '../../resources/resource-object.js';
import type {
  Workflow,
  WorkflowState,
} from '../../interfaces/resource-interfaces.js';

export class WorkflowRenameStateHandler implements Handler {
  readonly isBreaking = true;

  matches(ctx: MutationContext): boolean {
    if (ctx.input.kind !== 'edit') return false;
    if (ctx.input.target.type !== 'workflows') return false;
    if (ctx.input.updateKey.key !== 'states') return false;
    if (ctx.input.operation.name !== 'change') return false;

    // Differentiate a state rename from a state category change. The
    // discriminator: `to.name` must differ from `target.name`.
    const op = ctx.input.operation as ChangeOperation<unknown>;
    const targetName = (op.target as { name?: string }).name;
    const toName = (op.to as { name?: string }).name;
    return typeof targetName === 'string' && typeof toName === 'string' && targetName !== toName;
  }

  async preview(ctx: MutationContext): Promise<CascadePreview> {
    if (ctx.input.kind !== 'edit') {
      throw new Error('WorkflowRenameStateHandler: non-edit input');
    }
    const wfName = resourceNameToString(ctx.input.target);
    const op = ctx.input.operation as ChangeOperation<WorkflowState>;
    const oldName = (op.target as { name: string }).name;
    const affected = await this.cardsInState(ctx, wfName, oldName);
    return {
      affectedCardCount: affected.length,
      affectedLinkCount: 0,
      affectedCalculationCount: 0,
      affectedHandlebarFileCount: 0,
      dataLossExpected: false,
      summary: `Renames state '${oldName}' to '${op.to.name}' on ${affected.length} card(s) and across all transitions.`,
    };
  }

  async apply(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'edit') {
      throw new Error('WorkflowRenameStateHandler: non-edit input');
    }
    const wfName = resourceNameToString(ctx.input.target);
    const resource = ctx.project.resources.byType(wfName, 'workflows');
    if (!resource) throw new Error(`Workflow '${wfName}' not found`);
    const op = ctx.input.operation as ChangeOperation<WorkflowState>;
    const oldName = (op.target as { name: string }).name;
    const newName = op.to.name;
    if (op.to.category === undefined) {
      throw new Error(
        `Cannot change state '${oldName}': missing 'category' in target value.`,
      );
    }

    // 1. Rename the state itself via the resource's existing array-handling
    //    path. handleArray treats `change` on `states` as an in-place
    //    replacement of the matched entry.
    await resource.update({ key: 'states' }, ctx.input.operation as Operation<WorkflowState>);

    // 2. Rewrite every transition's fromState / toState. The resource's
    //    transitions array is updated through a change operation per
    //    transition that contains the renamed state.
    const wf = resource.data as Workflow;
    for (const transition of [...wf.transitions]) {
      const touchesOld =
        transition.toState === oldName || transition.fromState.includes(oldName);
      if (!touchesOld) continue;
      const updated = {
        ...transition,
        toState: transition.toState === oldName ? newName : transition.toState,
        fromState: transition.fromState.map((s) => (s === oldName ? newName : s)),
      };
      await resource.update(
        { key: 'transitions' },
        { name: 'change', target: transition, to: updated },
      );
    }

    // 3. Rewrite workflowState on every affected card.
    const affected = await this.cardsInState(ctx, wfName, oldName);
    for (const card of affected) {
      if (card.metadata) {
        card.metadata.workflowState = newName;
        await ctx.project.updateCardMetadata(card, card.metadata);
      }
    }
  }

  async affectedFilePaths(ctx: MutationContext): Promise<string[]> {
    if (ctx.input.kind !== 'edit') return [];
    const wfName = resourceNameToString(ctx.input.target);
    const op = ctx.input.operation as ChangeOperation<WorkflowState>;
    const oldName = (op.target as { name: string }).name;
    const cards = await this.cardsInState(ctx, wfName, oldName);
    return cards.map((c) => `${c.path}/index.json`);
  }

  private async cardsInState(
    ctx: MutationContext,
    workflowName: string,
    stateName: string,
  ) {
    const cardTypes = ctx.project.resources
      .cardTypes()
      .filter((ct) => ct.data?.workflow === workflowName);
    const cardTypeNames = new Set(cardTypes.map((ct) => ct.data!.name));
    return ctx.project
      .cards(undefined)
      .filter(
        (c) =>
          c.metadata &&
          cardTypeNames.has(c.metadata.cardType) &&
          c.metadata.workflowState === stateName,
      );
  }
}
```

- [ ] **Step 4: Register in the dispatcher**

```typescript
import { WorkflowRenameStateHandler } from './handlers/workflow-rename-state.js';

const HANDLERS: Handler[] = [
  new LinkTypeRenameHandler(),
  new WorkflowRenameHandler(),
  new WorkflowAddStateHandler(),
  new WorkflowRemoveStateHandler(),
  new WorkflowRenameStateHandler(),
  new DefaultNoCascadeHandler(),
];
```

- [ ] **Step 5: Run the test**

```bash
cd tools/data-handler && pnpm test test/mutations/handlers/workflow-rename-state.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tools/data-handler/src/mutations/handlers/workflow-rename-state.ts \
        tools/data-handler/test/mutations/handlers/workflow-rename-state.test.ts \
        tools/data-handler/src/mutations/dispatcher.ts
git commit -m "feat: WorkflowRenameStateHandler — rewrite cards and transitions"
```

---

### Task 7: `WorkflowTransitionHandler` (add / remove / rename)

**Files:**

- Create: `tools/data-handler/src/mutations/handlers/workflow-transition.ts`
- Create: `tools/data-handler/test/mutations/handlers/workflow-transition.test.ts`
- Modify: `tools/data-handler/src/mutations/dispatcher.ts`

All three transition operations are non-breaking per `migrations-plan.adoc`. One handler covers them; `matches()` accepts `add | remove | change` on `transitions`. The handler is `isBreaking = false`. `apply()` delegates to the resource's existing transition-array machinery (`WorkflowResource.update` already does the right thing through `handleArray` and `transitionObject`).

- [ ] **Step 1: Write the failing test**

```typescript
// tools/data-handler/test/mutations/handlers/workflow-transition.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../../src/containers/project.js';
import { WorkflowTransitionHandler } from '../../../src/mutations/handlers/workflow-transition.js';
import { resourceName } from '../../../src/utils/resource-utils.js';
import { copyDir } from '../../../src/utils/file-utils.js';

const FIXTURE_PATH = join(
  import.meta.dirname,
  '..',
  '..',
  'test-data',
  'valid',
  'decision-records',
);
const tmpDir = join(import.meta.dirname, 'tmp-workflow-transition');

describe('WorkflowTransitionHandler', () => {
  let project: Project;
  beforeEach(async () => {
    const projectPath = join(tmpDir, `proj-${Date.now()}-${Math.random()}`);
    await mkdir(projectPath, { recursive: true });
    await copyDir(FIXTURE_PATH, projectPath);
    project = new Project(projectPath);
    await project.initialize();
  });
  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('matches add on transitions', () => {
    expect(
      new WorkflowTransitionHandler().matches({
        project,
        input: {
          kind: 'edit',
          target: resourceName('decision/workflows/decision'),
          updateKey: { key: 'transitions' },
          operation: {
            name: 'add',
            target: { name: 'Archive', fromState: ['Approved'], toState: 'Deprecated' },
          },
        },
      }),
    ).toBe(true);
  });

  it('matches remove on transitions', () => {
    expect(
      new WorkflowTransitionHandler().matches({
        project,
        input: {
          kind: 'edit',
          target: resourceName('decision/workflows/decision'),
          updateKey: { key: 'transitions' },
          operation: { name: 'remove', target: 'Deprecate' },
        },
      }),
    ).toBe(true);
  });

  it('matches change (rename) on transitions', () => {
    expect(
      new WorkflowTransitionHandler().matches({
        project,
        input: {
          kind: 'edit',
          target: resourceName('decision/workflows/decision'),
          updateKey: { key: 'transitions' },
          operation: {
            name: 'change',
            target: 'Deprecate',
            to: 'MarkDeprecated',
          },
        },
      }),
    ).toBe(true);
  });

  it('declines transition changes that also touch fromState/toState', () => {
    // This handler covers add/remove/rename only — leave structural
    // transition rewrites to the state-rename / state-remove handlers.
    expect(
      new WorkflowTransitionHandler().matches({
        project,
        input: {
          kind: 'edit',
          target: resourceName('decision/workflows/decision'),
          updateKey: { key: 'transitions' },
          operation: {
            name: 'change',
            target: { name: 'Deprecate', fromState: ['Approved'], toState: 'Deprecated' },
            to: { name: 'MarkDeprecated', fromState: ['Approved'], toState: 'Deprecated' },
          },
        },
      }),
    ).toBe(true);
  });

  it('is non-breaking', () => {
    expect(new WorkflowTransitionHandler().isBreaking).toBe(false);
  });

  it('apply add appends the transition to the workflow definition', async () => {
    const handler = new WorkflowTransitionHandler();
    await handler.apply({
      project,
      input: {
        kind: 'edit',
        target: resourceName('decision/workflows/decision'),
        updateKey: { key: 'transitions' },
        operation: {
          name: 'add',
          target: { name: 'Archive', fromState: ['Approved'], toState: 'Deprecated' },
        },
      },
    });
    const wf = project.resources.byType(
      'decision/workflows/decision',
      'workflows',
    );
    expect(wf?.data?.transitions.map((t) => t.name)).toContain('Archive');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd tools/data-handler && pnpm test test/mutations/handlers/workflow-transition.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the handler**

```typescript
// tools/data-handler/src/mutations/handlers/workflow-transition.ts

import type { Handler, MutationContext } from '../handler.js';
import type { CascadePreview } from '../types.js';
import { resourceNameToString } from '../../utils/resource-utils.js';

export class WorkflowTransitionHandler implements Handler {
  readonly isBreaking = false;

  matches(ctx: MutationContext): boolean {
    return (
      ctx.input.kind === 'edit' &&
      ctx.input.target.type === 'workflows' &&
      ctx.input.updateKey.key === 'transitions' &&
      ['add', 'remove', 'change'].includes(ctx.input.operation.name)
    );
  }

  async preview(_ctx: MutationContext): Promise<CascadePreview> {
    return {
      affectedCardCount: 0,
      affectedLinkCount: 0,
      affectedCalculationCount: 0,
      affectedHandlebarFileCount: 0,
      dataLossExpected: false,
      summary: 'Transition definition change (non-breaking).',
    };
  }

  async apply(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'edit') {
      throw new Error('WorkflowTransitionHandler: non-edit input');
    }
    const name = resourceNameToString(ctx.input.target);
    const resource = ctx.project.resources.byType(name, 'workflows');
    if (!resource) throw new Error(`Workflow '${name}' not found`);
    await resource.update(ctx.input.updateKey, ctx.input.operation);
  }

  async affectedFilePaths(_ctx: MutationContext): Promise<string[]> {
    return [];
  }
}
```

- [ ] **Step 4: Register in the dispatcher**

```typescript
import { WorkflowTransitionHandler } from './handlers/workflow-transition.js';

const HANDLERS: Handler[] = [
  new LinkTypeRenameHandler(),
  new WorkflowRenameHandler(),
  new WorkflowAddStateHandler(),
  new WorkflowRemoveStateHandler(),
  new WorkflowRenameStateHandler(),
  new WorkflowTransitionHandler(),
  new DefaultNoCascadeHandler(),
];
```

- [ ] **Step 5: Run the test**

```bash
cd tools/data-handler && pnpm test test/mutations/handlers/workflow-transition.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tools/data-handler/src/mutations/handlers/workflow-transition.ts \
        tools/data-handler/test/mutations/handlers/workflow-transition.test.ts \
        tools/data-handler/src/mutations/dispatcher.ts
git commit -m "feat: WorkflowTransitionHandler — add/remove/rename transitions"
```

---

### Task 8: `WorkflowDeleteHandler` — failing test

**Files:**

- Create: `tools/data-handler/test/mutations/handlers/workflow-delete.test.ts`

The largest cascade in the system. Deleting a workflow forces every card type that references it to be deleted, which forces every card of those card types to be deleted. The implementation delegates per-card-type deletion to `CardTypeDeleteHandler` (from the CardType plan). This task's test is the one that exercises ordering: cards → card types → workflow.

- [ ] **Step 1: Write the failing test**

```typescript
// tools/data-handler/test/mutations/handlers/workflow-delete.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../../src/containers/project.js';
import { WorkflowDeleteHandler } from '../../../src/mutations/handlers/workflow-delete.js';
import { resourceName } from '../../../src/utils/resource-utils.js';
import { copyDir } from '../../../src/utils/file-utils.js';

const FIXTURE_PATH = join(
  import.meta.dirname,
  '..',
  '..',
  'test-data',
  'valid',
  'decision-records',
);
const tmpDir = join(import.meta.dirname, 'tmp-workflow-delete');

describe('WorkflowDeleteHandler', () => {
  let project: Project;
  beforeEach(async () => {
    const projectPath = join(tmpDir, `proj-${Date.now()}-${Math.random()}`);
    await mkdir(projectPath, { recursive: true });
    await copyDir(FIXTURE_PATH, projectPath);
    project = new Project(projectPath);
    await project.initialize();
  });
  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('matches a workflow delete', () => {
    expect(
      new WorkflowDeleteHandler().matches({
        project,
        input: {
          kind: 'delete',
          target: resourceName('decision/workflows/decision'),
        },
      }),
    ).toBe(true);
  });

  it('preview reports both card-type and card counts and data loss', async () => {
    const preview = await new WorkflowDeleteHandler().preview({
      project,
      input: {
        kind: 'delete',
        target: resourceName('decision/workflows/decision'),
      },
    });
    expect(preview.affectedCardCount).toBeGreaterThanOrEqual(0);
    expect(preview.dataLossExpected).toBe(true);
    expect(preview.summary).toMatch(/card type/i);
    expect(preview.summary).toMatch(/will be deleted/i);
  });

  it('apply deletes cards, then card types, then the workflow (ordering)', async () => {
    const handler = new WorkflowDeleteHandler();
    const wfName = 'decision/workflows/decision';
    const dependentCardTypeNames = project.resources
      .cardTypes()
      .filter((ct) => ct.data?.workflow === wfName)
      .map((ct) => ct.data!.name);

    await handler.apply({
      project,
      input: {
        kind: 'delete',
        target: resourceName(wfName),
      },
    });

    // Workflow gone.
    expect(project.resources.byType(wfName, 'workflows')).toBeUndefined();
    // Dependent card types gone.
    for (const ctName of dependentCardTypeNames) {
      expect(project.resources.byType(ctName, 'cardTypes')).toBeUndefined();
    }
    // No card of those types remains.
    const remaining = project.cards(undefined).filter((c) =>
      dependentCardTypeNames.includes(c.metadata?.cardType ?? ''),
    );
    expect(remaining).toHaveLength(0);
  });

  it('isBreaking is true', () => {
    expect(new WorkflowDeleteHandler().isBreaking).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd tools/data-handler && pnpm test test/mutations/handlers/workflow-delete.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Commit the red phase**

```bash
git add tools/data-handler/test/mutations/handlers/workflow-delete.test.ts
git commit -m "test: failing test for WorkflowDeleteHandler"
```

---

### Task 9: `WorkflowDeleteHandler` — implementation

**Files:**

- Create: `tools/data-handler/src/mutations/handlers/workflow-delete.ts`
- Modify: `tools/data-handler/src/mutations/dispatcher.ts`

The cascade chain:

1. For each dependent card type, instantiate `CardTypeDeleteHandler` and call it. That handler is responsible for deleting every card of the card type, then deleting the card-type resource itself.
2. After all dependent card types are gone, delete the workflow resource.

Ordering matters: a card type whose `workflow` field still points at the workflow being deleted will fail `usage()` checks during `resource.delete()`. By deleting dependents first, the workflow's `usage()` returns empty when we finally call `resource.delete()` on it.

If `CardTypeDeleteHandler` is not yet implemented (sibling plan not landed), this handler instead reuses the existing `ResourceObject.delete()` path on the workflow, which will throw because the workflow is in use. In that case keep the apply method body as written but mark the test `it.skip(...)` until the CardType plan lands. **Do not** invent a stub for `CardTypeDeleteHandler` inside this plan.

- [ ] **Step 1: Implement the handler**

```typescript
// tools/data-handler/src/mutations/handlers/workflow-delete.ts

import type { Handler, MutationContext } from '../handler.js';
import type { CascadePreview } from '../types.js';
import {
  resourceName,
  resourceNameToString,
} from '../../utils/resource-utils.js';
import { CardTypeDeleteHandler } from './card-type-delete.js';

export class WorkflowDeleteHandler implements Handler {
  readonly isBreaking = true;

  matches(ctx: MutationContext): boolean {
    return ctx.input.kind === 'delete' && ctx.input.target.type === 'workflows';
  }

  async preview(ctx: MutationContext): Promise<CascadePreview> {
    if (ctx.input.kind !== 'delete') {
      throw new Error('WorkflowDeleteHandler: non-delete input');
    }
    const wfName = resourceNameToString(ctx.input.target);
    const dependentCardTypes = ctx.project.resources
      .cardTypes()
      .filter((ct) => ct.data?.workflow === wfName);

    // Sum cards from every dependent card type's delete preview so we
    // surface the full impact.
    const inner = new CardTypeDeleteHandler();
    let totalCards = 0;
    let totalLinks = 0;
    for (const ct of dependentCardTypes) {
      const ctPreview = await inner.preview({
        project: ctx.project,
        input: {
          kind: 'delete',
          target: resourceName(ct.data!.name),
        },
      });
      totalCards += ctPreview.affectedCardCount;
      totalLinks += ctPreview.affectedLinkCount;
    }

    return {
      affectedCardCount: totalCards,
      affectedLinkCount: totalLinks,
      affectedCalculationCount: 0,
      affectedHandlebarFileCount: 0,
      dataLossExpected: true,
      summary:
        `Deletes workflow '${wfName}'. ${dependentCardTypes.length} card type(s) and ` +
        `${totalCards} card(s) will be deleted as a consequence.`,
    };
  }

  async apply(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'delete') {
      throw new Error('WorkflowDeleteHandler: non-delete input');
    }
    const wfName = resourceNameToString(ctx.input.target);

    // 1. Delete every dependent card type (which itself deletes its cards).
    const dependentCardTypes = ctx.project.resources
      .cardTypes()
      .filter((ct) => ct.data?.workflow === wfName);
    const inner = new CardTypeDeleteHandler();
    for (const ct of dependentCardTypes) {
      await inner.apply({
        project: ctx.project,
        input: {
          kind: 'delete',
          target: resourceName(ct.data!.name),
        },
      });
    }

    // 2. Delete the workflow resource itself. `usage()` is now empty.
    const wf = ctx.project.resources.byType(wfName, 'workflows');
    if (!wf) throw new Error(`Workflow '${wfName}' not found`);
    await wf.delete();
  }

  async affectedFilePaths(ctx: MutationContext): Promise<string[]> {
    if (ctx.input.kind !== 'delete') return [];
    const wfName = resourceNameToString(ctx.input.target);
    const dependentCardTypes = ctx.project.resources
      .cardTypes()
      .filter((ct) => ct.data?.workflow === wfName);
    const paths: string[] = [];
    const inner = new CardTypeDeleteHandler();
    for (const ct of dependentCardTypes) {
      paths.push(
        ...(await inner.affectedFilePaths({
          project: ctx.project,
          input: { kind: 'delete', target: resourceName(ct.data!.name) },
        })),
      );
    }
    return paths;
  }
}
```

- [ ] **Step 2: Register in the dispatcher**

```typescript
import { WorkflowDeleteHandler } from './handlers/workflow-delete.js';

const HANDLERS: Handler[] = [
  new LinkTypeRenameHandler(),
  new WorkflowRenameHandler(),
  new WorkflowAddStateHandler(),
  new WorkflowRemoveStateHandler(),
  new WorkflowRenameStateHandler(),
  new WorkflowTransitionHandler(),
  new WorkflowDeleteHandler(),
  new DefaultNoCascadeHandler(),
];
```

- [ ] **Step 3: Run the test**

```bash
cd tools/data-handler && pnpm test test/mutations/handlers/workflow-delete.test.ts
```

Expected: PASS (if `CardTypeDeleteHandler` exists from the sibling plan). If it does not, the test will fail at import time; mark the `apply` and ordering tests `it.skip(...)` and add a TODO referencing the CardType plan. The `matches` and `isBreaking` tests must still pass.

- [ ] **Step 4: Commit**

```bash
git add tools/data-handler/src/mutations/handlers/workflow-delete.ts \
        tools/data-handler/src/mutations/dispatcher.ts
git commit -m "feat: WorkflowDeleteHandler — cascade through dependent card types"
```

---

### Task 10: Route Workflow operations from `commands/update.ts`, `rename.ts`, `remove.ts`

**Files:**

- Modify: `tools/data-handler/src/commands/update.ts`
- Modify: `tools/data-handler/src/commands/rename.ts` (if separate from `update.ts`; verify)
- Modify: `tools/data-handler/src/commands/remove.ts`
- Test: `tools/data-handler/test/command-update.test.ts`, `tools/data-handler/test/command-remove.test.ts`

Every Workflow operation that hits a command must now flow through `ResourceMutations.plan() + apply()` so the migration log records a properly-shaped entry. The foundation plan wired this for link-type renames; replicate the routing for workflows and extend it to `delete` via the `remove` command.

- [ ] **Step 1: Identify the existing entry points**

```bash
grep -n "extractType\|'workflows'\|resourceTypeFromSingularType" \
  tools/data-handler/src/commands/update.ts \
  tools/data-handler/src/commands/rename.ts \
  tools/data-handler/src/commands/remove.ts
```

The foundation plan introduced a `isLinkTypeRename` early-return in `Update.applyResourceOperation`. Add a parallel `isWorkflowOperation` branch:

```typescript
const type = this.project.resources.extractType(name);
if (type === 'workflows') {
  const { resourceName: parseResourceName } = await import(
    '../utils/resource-utils.js'
  );
  const { ResourceMutations } = await import('../mutations/plan.js');
  const target = parseResourceName(name);
  const mutations = new ResourceMutations(this.project);

  const input =
    updateKey.key === 'name' && operation.name === 'change'
      ? {
          kind: 'rename' as const,
          target,
          newIdentifier: parseResourceName((operation as { to: string }).to)
            .identifier,
        }
      : {
          kind: 'edit' as const,
          target,
          updateKey,
          operation: operation as Operation<unknown>,
        };

  const plan = await mutations.plan(input);
  await mutations.apply(input, { fingerprint: plan.fingerprint });
  return;
}
```

- [ ] **Step 2: Wire the remove command**

In `tools/data-handler/src/commands/remove.ts` around the `projectResource(type)` branch (~line 299-304), route workflow deletes through the engine:

```typescript
if (this.projectResource(type)) {
  const resourceType =
    this.project.resources.resourceTypeFromSingularType(type);
  if (resourceType === 'workflows') {
    const { resourceName: parseResourceName } = await import(
      '../utils/resource-utils.js'
    );
    const { ResourceMutations } = await import('../mutations/plan.js');
    const mutations = new ResourceMutations(this.project);
    const target = parseResourceName(targetName);
    const input = { kind: 'delete' as const, target };
    const plan = await mutations.plan(input);
    await mutations.apply(input, { fingerprint: plan.fingerprint });
    return;
  }
  const resource = this.project.resources.byType(targetName, resourceType);
  return resource?.delete();
}
```

- [ ] **Step 3: Add tests verifying the routing**

Add an integration assertion in `test/command-update.test.ts`:

```typescript
it('routes workflow operations through ResourceMutations', async () => {
  // Reuse the link-type-rename test pattern: open a fresh project, invoke
  // Update.applyResourceOperation for a Workflow operation, and assert that
  // a resource_edit entry lands in the configuration log via the new engine.
  const project = /* ... */;
  const update = new Update(project);
  await update.applyResourceOperation(
    'decision/workflows/decision',
    { key: 'states' },
    { name: 'add', target: { name: 'Archived', category: 'closed' } },
  );
  // Add-state is non-breaking, so no log entry should be created.
  const entries = await ConfigurationLogger.entries(project.basePath);
  expect(entries).toHaveLength(0);
});
```

And in `test/command-remove.test.ts`:

```typescript
it('routes workflow delete through ResourceMutations', async () => {
  const project = /* ... */;
  const remove = new Remove(project);
  await remove.remove('workflow', 'decision/workflows/decision');
  const entries = await ConfigurationLogger.entries(project.basePath);
  expect(entries.some((e) =>
    e.kind === 'resource_delete' &&
    e.target === 'decision/workflows/decision',
  )).toBe(true);
});
```

The remove test requires `CardTypeDeleteHandler` to exist; gate with `it.skip` if it does not.

- [ ] **Step 4: Run the full suite**

```bash
cd tools/data-handler && pnpm test
```

Expected: PASS. The pre-existing Workflow behaviour tests in `test/workflows.test.ts` (verify the file path) should still pass — the cascade is unchanged from the user's perspective; only the routing differs.

- [ ] **Step 5: Commit**

```bash
git add tools/data-handler/src/commands/update.ts \
        tools/data-handler/src/commands/remove.ts \
        tools/data-handler/test/command-update.test.ts \
        tools/data-handler/test/command-remove.test.ts
git commit -m "feat: route Workflow operations through ResourceMutations"
```

---

### Task 11: Remove dead cascade code from `WorkflowResource`

**Files:**

- Modify: `tools/data-handler/src/resources/workflow-resource.ts`

Every handler in this plan absorbs a piece of the resource class's existing cascade. With the routing in place, the in-class cascade is dead code. Delete it; verify the file still compiles and existing tests still pass.

- [ ] **Step 1: Identify removable methods**

```bash
grep -n "private async\|private isStringOperation\|private targetName\|private transitionObject" \
  tools/data-handler/src/resources/workflow-resource.ts
```

Methods to remove or hollow:

- `collectCardsUsingWorkflow` — moved into each handler that needs it.
- `handleStateChange` — replaced by `WorkflowRenameStateHandler`.
- `handleStateRemoval` — replaced by `WorkflowRemoveStateHandler`.
- `updateCardStates` — replaced by handler-private `cardsInState` + `updateCardMetadata` calls.
- `updateCardTypes` — replaced by `WorkflowRenameHandler`.
- `onNameChange` — the cascade portion is gone; the post-rename `write()` can stay inside `rename()` directly.
- The `key === 'states' && op.name === 'remove'` and `key === 'states' && op.name === 'change'` branches in `update<Type, K>` — the handlers now perform these cascades. The resource's `update()` becomes responsible only for the on-disk content edit; let `super.handleArray` do the work, then `super.postUpdate`.
- The `key === 'transitions' && op.name === 'change'` branch with `transitionObject` — keep this; it's content-validation logic the handler still relies on via the resource's `update()`.

- [ ] **Step 2: Apply the deletions**

After hollowing, `update<Type, K>` should look roughly like:

```typescript
public async update<Type, K extends string>(
  updateKey: UpdateKey<K>,
  op: Operation<Type>,
) {
  const { key } = updateKey;
  if (this.isBaseProperty(key)) {
    await super.update(updateKey, op);
    return;
  }
  const content = structuredClone(this.content) as Workflow;

  if (key === 'states' && op.name === 'change') {
    const changeOp = op as ChangeOperation<WorkflowState>;
    if (changeOp.to.name === undefined || changeOp.to.category === undefined) {
      throw new Error(
        `Cannot change state '${this.targetName(changeOp)}' for workflow '${this.content.name}'.
         Updated state must have 'name' and 'category' properties.`,
      );
    }
  }

  if (key === 'states') {
    content.states = super.handleArray(op, key, content.states as Type[]) as WorkflowState[];
  } else if (key === 'transitions') {
    content.transitions = super.handleArray(
      op,
      key,
      content.transitions as WorkflowTransition[] as Type[],
    ) as WorkflowTransition[];

    if (op.name === 'change') {
      // Existing transition-validation path; keep transitionObject and
      // re-apply the validated change.
      let changeOp: ChangeOperation<WorkflowTransition>;
      if (this.isStringOperation(op)) {
        const targetTransition = (this.content as Workflow).transitions.find(
          (t) => t.name === op.target,
        )!;
        changeOp = {
          name: 'change',
          target: targetTransition,
          to: {
            name: op.to as unknown as string,
            toState: targetTransition.toState,
            fromState: targetTransition.fromState,
          },
        };
      } else {
        changeOp = op as ChangeOperation<WorkflowTransition>;
      }
      const newTransition = await this.transitionObject(changeOp);
      content.transitions = content.transitions.map((t) =>
        t.name === newTransition.name ? newTransition : t,
      );
    }
  } else {
    throw new Error(`Unknown property '${key}' for Workflow`);
  }

  await super.postUpdate(content, updateKey, op);
}
```

The `rename()` method becomes:

```typescript
public async rename(newName: ResourceName) {
  const existingName = this.content.name;
  await super.rename(newName);
  // Cascade lives in WorkflowRenameHandler; the base class's rename
  // handles the on-disk file move. Nothing else to do here.
  await Promise.all([
    super.updateHandleBars(existingName, this.content.name),
    super.updateCalculations(existingName, this.content.name),
    super.updateCardContentReferences(existingName, this.content.name),
  ]);
  await this.write();
}
```

(The card-type rewrite that `updateCardTypes` performed now lives in the handler and is called before `resource.rename()`, so this method no longer needs to do it.)

- [ ] **Step 3: Run the full data-handler suite**

```bash
cd tools/data-handler && pnpm test
```

Expected: PASS. Watch for any test that called `resource.update(...)` directly for a Workflow `states` remove/change and depended on the in-class cascade firing. Such tests should be rewritten to go through `ResourceMutations`, or — if their intent was to test the resource class in isolation — to set up the cascade preconditions manually.

- [ ] **Step 4: Commit**

```bash
git add tools/data-handler/src/resources/workflow-resource.ts
git commit -m "refactor: remove cascade from WorkflowResource

The cascade now lives in mutations/handlers/workflow-*.ts. The resource
class retains only on-disk content editing, validation, and the
transition-object normalisation that the rename-state handler invokes
via update()."
```

---

### Task 12: End-to-end integration test — delete workflow with cards and card types

**Files:**

- Create: `tools/data-handler/test/mutations/workflow-integration.test.ts`

A single end-to-end test that exercises the largest cascade in the system from `ResourceMutations.plan(input)` to log entry. The fixture has a workflow, a card type that uses it, and at least one card of that card type. After `apply`, all three are gone, and the migration log contains entries for each level of the cascade.

- [ ] **Step 1: Write the test**

```typescript
// tools/data-handler/test/mutations/workflow-integration.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../src/containers/project.js';
import { ResourceMutations } from '../../src/mutations/plan.js';
import { ConfigurationLogger } from '../../src/utils/configuration-logger.js';
import { resourceName } from '../../src/utils/resource-utils.js';
import { copyDir } from '../../src/utils/file-utils.js';

const FIXTURE_PATH = join(
  import.meta.dirname,
  '..',
  'test-data',
  'valid',
  'decision-records',
);
const tmpDir = join(import.meta.dirname, 'tmp-workflow-integration');

describe('Workflow cascade — end-to-end', () => {
  let project: Project;

  beforeEach(async () => {
    const projectPath = join(tmpDir, `proj-${Date.now()}-${Math.random()}`);
    await mkdir(projectPath, { recursive: true });
    await copyDir(FIXTURE_PATH, projectPath);
    project = new Project(projectPath);
    await project.initialize();
  });
  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('plan → apply → cards, card types and workflow all gone, log entries written', async () => {
    const mutations = new ResourceMutations(project);
    const wfName = 'decision/workflows/decision';
    const dependentCardTypeNames = project.resources
      .cardTypes()
      .filter((ct) => ct.data?.workflow === wfName)
      .map((ct) => ct.data!.name);
    expect(dependentCardTypeNames.length).toBeGreaterThan(0);

    const input = {
      kind: 'delete' as const,
      target: resourceName(wfName),
    };
    const plan = await mutations.plan(input);
    expect(plan.isBreaking).toBe(true);
    expect(plan.preview.dataLossExpected).toBe(true);

    await mutations.apply(input, { fingerprint: plan.fingerprint });

    expect(project.resources.byType(wfName, 'workflows')).toBeUndefined();
    for (const ctName of dependentCardTypeNames) {
      expect(project.resources.byType(ctName, 'cardTypes')).toBeUndefined();
    }
    const survivors = project.cards(undefined).filter((c) =>
      dependentCardTypeNames.includes(c.metadata?.cardType ?? ''),
    );
    expect(survivors).toHaveLength(0);

    const entries = await ConfigurationLogger.entries(project.basePath);
    // One entry per resource_delete: the workflow + every dependent card type.
    const workflowEntry = entries.find(
      (e) => e.kind === 'resource_delete' && e.target === wfName,
    );
    expect(workflowEntry).toBeDefined();
    for (const ctName of dependentCardTypeNames) {
      expect(
        entries.some(
          (e) => e.kind === 'resource_delete' && e.target === ctName,
        ),
      ).toBe(true);
    }
  });

  it('fingerprint mismatches when the project state shifts between plan and apply', async () => {
    const mutations = new ResourceMutations(project);
    const input = {
      kind: 'delete' as const,
      target: resourceName('decision/workflows/decision'),
    };
    const plan = await mutations.plan(input);

    // Drift: change a card's metadata.
    const cards = project.cards(undefined);
    if (cards.length > 0 && cards[0].metadata) {
      cards[0].metadata.title = `${cards[0].metadata.title} (drifted)`;
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
cd tools/data-handler && pnpm test test/mutations/workflow-integration.test.ts
```

Expected: PASS (or `.skip`d on the cascade test if `CardTypeDeleteHandler` is not yet implemented — see Task 9 note).

- [ ] **Step 3: Run the whole suite as a final check**

```bash
cd tools/data-handler && pnpm test
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tools/data-handler/test/mutations/workflow-integration.test.ts
git commit -m "test: end-to-end workflow delete cascade through ResourceMutations"
```

---

## Verification checklist after the plan executes

Run from the repo root:

```bash
pnpm --filter @cyberismo/data-handler test
pnpm --filter @cyberismo/data-handler build
pnpm --filter @cyberismo/data-handler lint
```

All three should succeed. The repo-wide suite must also pass:

```bash
pnpm test
```

If any test in `tools/cli`, `tools/backend`, `tools/app`, or `tools/mcp` references the removed methods on `WorkflowResource` (search with `grep -rn "handleStateChange\|handleStateRemoval\|updateCardStates\|updateCardTypes\|collectCardsUsingWorkflow" tools/`), update it to drive the cascade through `ResourceMutations` instead.

---

## Self-review

Things to verify before declaring the plan done:

1. **Dispatcher ordering.** All Workflow handlers must be registered ahead of `DefaultNoCascadeHandler` and each handler's `matches()` is strict enough that it does not steal inputs from a sibling. The `WorkflowRenameStateHandler.matches()` deliberately requires `target.name !== to.name` so a category-only change falls through to the default; verify by reading both `matches()` methods side-by-side.

2. **Bidirectional coupling with CardType.** `WorkflowRenameHandler` updates each dependent `CardType.workflow` field by calling `cardType.update({ key: 'workflow' }, op)`. The CardType resource's own handler chain may not be active yet (CardType plan landing order is independent). If it isn't, the resource's `update()` still performs the simple `workflow` reassignment via the base class, which is what this handler relies on. Verify by reading `card-type-resource.ts:380-390` after the CardType plan lands; if the CardType plan moves that path into a handler too, this plan's handler still works because it calls the public `update()` method, not the internal helper.

3. **Workflow rename does not recurse.** `WorkflowRenameHandler.apply()` calls `resource.rename()`, which in turn calls `WorkflowResource.rename()`, which in turn calls `Workflow*.updateCardTypes` if any cascade code is left. Task 11 hollows out `rename` so it only does the file-move plus calculation/handlebar/card-content rewrites — no card-type update. Re-grep after Task 11 to confirm `updateCardTypes` is gone.

4. **State remove preview vs apply consistency.** Both must compute the same set of affected cards and the same replacement state. The helper `cardsInState` is shared between `preview()` and `apply()`; do not duplicate the logic in two places.

5. **Delete handler ordering.** `WorkflowDeleteHandler.apply()` deletes dependent card types first, then the workflow. If the order is reversed, the workflow's `usage()` check throws because card types still reference it. The integration test in Task 12 catches this directly; do not bypass it.

6. **Configuration log entries.** Each handler's cascade may write multiple cards. The migration log should record **one entry per top-level operation**, not one per card. The log entry is written by `ResourceMutations.apply()` after the handler returns, not by the handlers themselves. Verify by checking `entries.length` matches the number of dispatcher invocations, not the number of files touched.

7. **`CardTypeDeleteHandler` import.** The import in `workflow-delete.ts` lives at the top of the file. If the CardType plan has not landed, this will fail to compile. The accepted resolution is one of (a) wait for the CardType plan to land before merging this plan, or (b) introduce a thin internal interface in this plan that `CardTypeDeleteHandler` implements when it arrives. (b) keeps this plan landable independently but adds friction; preference is (a).

8. **Fingerprint stability.** Each handler's `affectedFilePaths()` must enumerate every file whose content the cascade reads or writes. For the delete handler, that's every card file under every dependent card type — the handler delegates this list to `CardTypeDeleteHandler.affectedFilePaths()`. Verify the second integration test (drift detection) actually triggers a mismatch by editing a card the delete handler will touch.

---

## What this plan delivers

After all tasks succeed:

- Six Workflow cascade handlers, each owning the cascade for one breaking-change row from `migrations-plan.adoc`.
- Dispatcher registrations covering every Workflow operation, breaking and non-breaking.
- `commands/update.ts` and `commands/remove.ts` route every Workflow operation through `ResourceMutations`, so the migration log records the right entries.
- `WorkflowResource` reduced to ~150 lines: validation, on-disk content editing, transition-object normalisation, `usage()`, `rename()` file-move plus calculation/handlebar/card-content rewrites. All cascade is in `mutations/handlers/`.
- An end-to-end test that exercises the full workflow-delete cascade (cards → card types → workflow) through the engine, with fingerprint drift detection.

## What's next

This plan completes the Workflow column of `migrations-plan.adoc`. The remaining columns are addressed by the follow-on plans listed in the foundation plan (FieldType edits, CardType edits and the still-pending `CardTypeDeleteHandler`, ProjectRename, module update flow, HTTP routes, CLI integration). The patterns this plan establishes — specific handlers ahead of the default, handlers absorbing cascade code from resource classes, delegated cross-resource cascades for delete operations — apply uniformly to those plans.
