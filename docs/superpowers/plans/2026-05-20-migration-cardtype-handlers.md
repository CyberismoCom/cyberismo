# Migration System — CardType Cascade Handlers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add cascade handlers for every CardType breaking-change row in `migrations-plan.adoc` to the mutation engine introduced by `2026-05-20-migration-system-foundation.md`. After this plan, CardType edits, deletes and renames flow through the new engine: previews report what would be affected, applies run inside `project.lock.write`, and a `MigrationEntry` is written for every breaking edit. The ~250 lines of cascade logic currently inside `CardTypeResource` move out into per-handler files; `commands/update.ts`, `commands/remove.ts` and `commands/rename.ts` reroute the CardType path through `ResourceMutations`.

**Architecture:** Each (CardType × variant) pair gets one file in `tools/data-handler/src/mutations/handlers/`. The dispatcher in `mutations/dispatcher.ts` selects the right handler based on `(input.kind, input.target.type, input.updateKey?.key, input.operation?.name)`. Handlers implement the `Handler` interface from the foundation plan: `matches`, `isBreaking`, `preview`, `apply`, `affectedFilePaths`. `preview()` is read-only; `apply()` performs the resource-definition mutation and the cascade. Both run from `ResourceMutations.plan() / .apply()`, which writes the log entry on success. The existing `CardTypeResource` keeps `createCardType`, the public `update()` entry point for non-breaking edits (display-only changes), and its readers — its cascade private methods (`handleCustomFieldsChange`, `handleAddNewField`, `handleRemoveField`, `handleWorkflowChange`, `removeValueFromOtherArrays`, `updateLinkTypes`, `updateCardMetadata` private helper, `verifyStateMapping`) all migrate out.

**Tech Stack:** TypeScript, Node 22, ESM with `.js` extensions on relative imports, Vitest for tests, pnpm workspaces, `node:crypto` for fingerprints. Existing patterns to follow: the foundation plan's `LinkTypeRenameHandler` (`tools/data-handler/src/mutations/handlers/link-type-rename.ts`) is the closest precedent — copy its shape. Test pattern follows `tools/data-handler/test/command-update.test.ts` (`getTestProject(decisionRecordsPath)` against the `decision-records` fixture).

---

## Scope

**In scope (this plan):**

- `mutations/handlers/card-type-rename.ts` — rename a card type. Cascade: rewrite `metadata.cardType` in every card; rewrite occurrences in link-type `sourceCardTypes` / `destinationCardTypes`; rewrite occurrences in template cards' metadata; rewrite occurrences in calculation files and handlebar files.
- `mutations/handlers/card-type-workflow-change.ts` — change a card type's `workflow` reference. Cascade: walk affected cards, set each card's `workflowState` using `mappingTable.stateMapping` when provided, otherwise reset to the first state of the new workflow. Validates the mapping the same way `verifyStateMapping` does today.
- `mutations/handlers/card-type-add-custom-field.ts` — add an entry to `customFields`. Cascade: write `null` for the new field key into every card of this type, so `Validate` accepts the cards.
- `mutations/handlers/card-type-remove-custom-field.ts` — remove an entry from `customFields`. Cascade: delete that metadata key from every card of this type, and also strip the field from this card type's `alwaysVisibleFields` and `optionallyVisibleFields` (today's `removeValueFromOtherArrays`).
- `mutations/handlers/card-type-delete.ts` — delete a card type. Cascade: delete every card of this type (data loss); strip the card type from every link type's `sourceCardTypes` / `destinationCardTypes`. Today's `delete()` refuses with `usage > 0`; the new handler accepts and cascades.
- The `displayName`, `description`, `category`, `alwaysVisibleFields` and `optionallyVisibleFields` paths intentionally fall through to `DefaultNoCascadeHandler`. The plan adds one regression test that asserts they do.
- Register all five new handlers in `mutations/dispatcher.ts`.
- Re-route CardType operations from `commands/update.ts`, `commands/remove.ts` and `commands/rename.ts` through `ResourceMutations`.
- Remove the now-dead cascade methods from `CardTypeResource`.
- One end-to-end integration test that deletes a populated card type and asserts cards are gone, link types are updated and one `resource_delete` migration entry exists.

**Out of scope:**

- Workflow handlers (state add/remove/rename, transitions) — that's a separate plan.
- FieldType handlers (own plan).
- The remaining delete handlers for Template, Calculation, Report, GraphModel, GraphView.
- HTTP routes and CLI verbs.

---

## File structure

**New files:**

- `tools/data-handler/src/mutations/handlers/card-type-rename.ts`
- `tools/data-handler/src/mutations/handlers/card-type-workflow-change.ts`
- `tools/data-handler/src/mutations/handlers/card-type-add-custom-field.ts`
- `tools/data-handler/src/mutations/handlers/card-type-remove-custom-field.ts`
- `tools/data-handler/src/mutations/handlers/card-type-delete.ts`
- `tools/data-handler/test/mutations/handlers/card-type-rename.test.ts`
- `tools/data-handler/test/mutations/handlers/card-type-workflow-change.test.ts`
- `tools/data-handler/test/mutations/handlers/card-type-add-custom-field.test.ts`
- `tools/data-handler/test/mutations/handlers/card-type-remove-custom-field.test.ts`
- `tools/data-handler/test/mutations/handlers/card-type-delete.test.ts`
- `tools/data-handler/test/mutations/integration-card-type.test.ts`

**Modified files:**

- `tools/data-handler/src/mutations/dispatcher.ts` — register the five new handlers ahead of the default.
- `tools/data-handler/src/commands/update.ts` — route CardType edits through `ResourceMutations`.
- `tools/data-handler/src/commands/remove.ts` — route CardType deletes through `ResourceMutations`.
- `tools/data-handler/src/commands/rename.ts` — route CardType renames through `ResourceMutations` (both the explicit `rename` command path and the project-rename loop's per-resource step).
- `tools/data-handler/src/resources/card-type-resource.ts` — delete the cascade methods listed in the scope.
- `tools/data-handler/test/command-update.test.ts` — re-confirm existing CardType assertions still pass (no test edits expected unless the routing changes behaviour observably; new assertions on the migration log are added).

---

## Tasks

### Task 1: CardType rename handler — failing test

**Files:**

- Create: `tools/data-handler/test/mutations/handlers/card-type-rename.test.ts`

The handler must rewrite the card type identifier in: every project card's `metadata.cardType`; every template card's `metadata.cardType`; every link type's `sourceCardTypes` and `destinationCardTypes` arrays; every calculation file (`.lp`); every handlebar file (`.hbs`). This is the largest of the rename cascades. Mirror the precedent in `tools/data-handler/src/mutations/handlers/link-type-rename.ts` from the foundation plan.

- [ ] **Step 1: Write the failing test**

```typescript
// tools/data-handler/test/mutations/handlers/card-type-rename.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { copyDir } from '../../../src/utils/file-utils.js';
import type { Project } from '../../../src/containers/project.js';
import { getTestProject } from '../../helpers/test-utils.js';
import { CardTypeRenameHandler } from '../../../src/mutations/handlers/card-type-rename.js';
import { resourceName } from '../../../src/utils/resource-utils.js';

const baseDir = import.meta.dirname;
const testDir = join(baseDir, 'tmp-card-type-rename');
const decisionRecordsPath = join(testDir, 'valid/decision-records');
let project: Project;

describe('CardTypeRenameHandler', () => {
  beforeEach(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir(
      join(baseDir, '..', '..', 'test-data'),
      testDir,
    );
    project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
  });
  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('matches a CardType rename input', () => {
    const handler = new CardTypeRenameHandler();
    const ctx = {
      project,
      input: {
        kind: 'rename' as const,
        target: resourceName(`${project.projectPrefix}/cardTypes/decision`),
        newIdentifier: 'choice',
      },
    };
    expect(handler.matches(ctx)).toBe(true);
    expect(handler.isBreaking).toBe(true);
  });

  it('preview counts affected cards and link-type references', async () => {
    const handler = new CardTypeRenameHandler();
    const ctx = {
      project,
      input: {
        kind: 'rename' as const,
        target: resourceName(`${project.projectPrefix}/cardTypes/decision`),
        newIdentifier: 'choice',
      },
    };
    const preview = await handler.preview(ctx);
    expect(preview.affectedCardCount).toBeGreaterThan(0);
    expect(preview.dataLossExpected).toBe(false);
  });

  it('rewrites cardType in every affected card after apply', async () => {
    const handler = new CardTypeRenameHandler();
    const oldName = `${project.projectPrefix}/cardTypes/decision`;
    const newName = `${project.projectPrefix}/cardTypes/choice`;
    const ctx = {
      project,
      input: {
        kind: 'rename' as const,
        target: resourceName(oldName),
        newIdentifier: 'choice',
      },
    };
    await handler.apply(ctx);

    for (const card of project.cards(undefined)) {
      expect(card.metadata?.cardType).not.toBe(oldName);
    }
    // The card type file itself has the new name.
    const renamed = project.resources.byType(newName, 'cardTypes').show();
    expect(renamed.name).toBe(newName);
  });

  it('rewrites occurrences in link-type sourceCardTypes/destinationCardTypes', async () => {
    const handler = new CardTypeRenameHandler();
    const oldName = `${project.projectPrefix}/cardTypes/decision`;
    const newName = `${project.projectPrefix}/cardTypes/choice`;
    await handler.apply({
      project,
      input: {
        kind: 'rename' as const,
        target: resourceName(oldName),
        newIdentifier: 'choice',
      },
    });
    for (const lt of project.resources.linkTypes()) {
      const data = lt.data!;
      expect(data.sourceCardTypes).not.toContain(oldName);
      expect(data.destinationCardTypes).not.toContain(oldName);
    }
  });

  it('affectedFilePaths returns the index.json files that will be rewritten', async () => {
    const handler = new CardTypeRenameHandler();
    const ctx = {
      project,
      input: {
        kind: 'rename' as const,
        target: resourceName(`${project.projectPrefix}/cardTypes/decision`),
        newIdentifier: 'choice',
      },
    };
    const paths = await handler.affectedFilePaths(ctx);
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.some((p) => p.endsWith('index.json'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd tools/data-handler && pnpm test test/mutations/handlers/card-type-rename.test.ts
```

Expected: FAIL — module `card-type-rename.js` not found.

- [ ] **Step 3: Commit the test (red phase)**

```bash
git add tools/data-handler/test/mutations/handlers/card-type-rename.test.ts
git commit -m "test: failing tests for CardTypeRenameHandler"
```

---

### Task 2: CardType rename handler — implementation

**Files:**

- Create: `tools/data-handler/src/mutations/handlers/card-type-rename.ts`
- Modify: `tools/data-handler/src/mutations/dispatcher.ts`

The handler delegates the per-resource rename to `ResourceObject.rename()` (which already runs `updateHandleBars`, `updateCalculations`, `updateCardContentReferences` via `onNameChange` in `card-type-resource.ts`). Cascade work this handler owns directly: card metadata rewrite (project + template cards) and link-type rewrite. The handler also strips the existing `updateLinkTypes` private method's role from the resource so that the cascade is no longer double-executed.

- [ ] **Step 1: Implement the handler**

```typescript
// tools/data-handler/src/mutations/handlers/card-type-rename.ts

import { join } from 'node:path';

import type { Handler, MutationContext } from '../handler.js';
import type { CascadePreview } from '../types.js';
import { resourceName, resourceNameToString } from '../../utils/resource-utils.js';
import { ResourcesFrom } from '../../containers/project/resources-from.js';
import type { Card } from '../../interfaces/project-interfaces.js';
import type { ChangeOperation } from '../../resources/resource-object.js';

export class CardTypeRenameHandler implements Handler {
  readonly isBreaking = true;

  matches(ctx: MutationContext): boolean {
    return (
      ctx.input.kind === 'rename' && ctx.input.target.type === 'cardTypes'
    );
  }

  async preview(ctx: MutationContext): Promise<CascadePreview> {
    if (ctx.input.kind !== 'rename') {
      throw new Error('CardTypeRenameHandler called with non-rename input');
    }
    const oldName = resourceNameToString(ctx.input.target);
    const cards = this.affectedCards(ctx, oldName);
    const linkTypeRefs = this.linkTypeReferenceCount(ctx, oldName);
    return {
      affectedCardCount: cards.length,
      affectedLinkCount: linkTypeRefs,
      affectedCalculationCount: 0, // updated via ResourceObject.updateCalculations
      affectedHandlebarFileCount: 0, // updated via ResourceObject.updateHandleBars
      dataLossExpected: false,
      summary: `Renames cardType in ${cards.length} cards and ${linkTypeRefs} link-type references.`,
    };
  }

  async apply(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'rename') {
      throw new Error('CardTypeRenameHandler called with non-rename input');
    }
    const oldName = resourceNameToString(ctx.input.target);
    const newName = `${ctx.input.target.prefix}/cardTypes/${ctx.input.newIdentifier}`;

    // 1. Rewrite card metadata.cardType for every affected card (project + templates).
    const cards = this.affectedCards(ctx, oldName);
    for (const card of cards) {
      const metadata = card.metadata!;
      metadata.cardType = newName;
      await ctx.project.updateCardMetadata(card, metadata);
    }

    // 2. Rename the resource itself. ResourceObject.rename() invokes onNameChange,
    //    which (per card-type-resource.ts) handles handlebar/calculation/content
    //    rewrites and link-type updates. After this plan trims the resource class,
    //    only handlebar/calculation/content rewrites remain in onNameChange; the
    //    link-type rewrite below replaces the removed updateLinkTypes call.
    const resource = ctx.project.resources.byType(oldName, 'cardTypes');
    if (!resource) {
      throw new Error(`CardType '${oldName}' not found`);
    }
    await resource.rename(resourceName(newName));

    // 3. Rewrite link-type sourceCardTypes/destinationCardTypes references.
    const linkTypes = ctx.project.resources.linkTypes(ResourcesFrom.localOnly);
    for (const lt of linkTypes) {
      const data = lt.data;
      if (!data) continue;
      for (const field of ['sourceCardTypes', 'destinationCardTypes'] as const) {
        if (data[field].includes(oldName)) {
          const op: ChangeOperation<string> = {
            name: 'change',
            target: oldName,
            to: newName,
          } as ChangeOperation<string>;
          await lt.update({ key: field }, op);
        }
      }
    }
  }

  async affectedFilePaths(ctx: MutationContext): Promise<string[]> {
    if (ctx.input.kind !== 'rename') return [];
    const oldName = resourceNameToString(ctx.input.target);
    return this.affectedCards(ctx, oldName).map((c) => join(c.path, 'index.json'));
  }

  private affectedCards(ctx: MutationContext, oldName: string): Card[] {
    const project = [...ctx.project.cards(undefined)];
    const templates = ctx.project.resources
      .templates(ResourcesFrom.localOnly)
      .flatMap((t) => t.templateObject().cards());
    return [...project, ...templates].filter(
      (c) => c.metadata?.cardType === oldName,
    );
  }

  private linkTypeReferenceCount(ctx: MutationContext, oldName: string): number {
    let count = 0;
    for (const lt of ctx.project.resources.linkTypes()) {
      const data = lt.data;
      if (!data) continue;
      if (data.sourceCardTypes.includes(oldName)) count += 1;
      if (data.destinationCardTypes.includes(oldName)) count += 1;
    }
    return count;
  }
}
```

- [ ] **Step 2: Register in the dispatcher**

Edit `tools/data-handler/src/mutations/dispatcher.ts` and add the import at the top plus the entry ahead of `DefaultNoCascadeHandler`:

```typescript
import { CardTypeRenameHandler } from './handlers/card-type-rename.js';

const HANDLERS: Handler[] = [
  new LinkTypeRenameHandler(),
  new CardTypeRenameHandler(),
  // existing handlers...
  new DefaultNoCascadeHandler(),
];
```

- [ ] **Step 3: Run the tests**

```bash
cd tools/data-handler && pnpm test test/mutations/handlers/card-type-rename.test.ts
```

Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add tools/data-handler/src/mutations/handlers/card-type-rename.ts \
        tools/data-handler/src/mutations/dispatcher.ts
git commit -m "feat: CardTypeRenameHandler cascades through cards and link types"
```

---

### Task 3: CardType workflow-change handler — failing test

**Files:**

- Create: `tools/data-handler/test/mutations/handlers/card-type-workflow-change.test.ts`

The hardest CardType cascade. The spec is precise: when `mappingTable.stateMapping` is provided in the `ChangeOperation`, every state in the current workflow must appear as a key in the mapping (`verifyStateMapping`'s contract). When the mapping is absent, the cascade defaults every affected card to the first state of the new workflow — that's the row from `migrations-plan.adoc`. `mappingTable` lives on `ChangeOperation<T>` already (see `tools/data-handler/src/resources/resource-object.ts:67`).

- [ ] **Step 1: Write the failing test**

```typescript
// tools/data-handler/test/mutations/handlers/card-type-workflow-change.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { copyDir } from '../../../src/utils/file-utils.js';
import type { Project } from '../../../src/containers/project.js';
import { getTestProject } from '../../helpers/test-utils.js';
import { CardTypeWorkflowChangeHandler } from '../../../src/mutations/handlers/card-type-workflow-change.js';
import { resourceName } from '../../../src/utils/resource-utils.js';

const baseDir = import.meta.dirname;
const testDir = join(baseDir, 'tmp-card-type-workflow');
const decisionRecordsPath = join(testDir, 'valid/decision-records');
let project: Project;

const cardTypeName = () => `${project.projectPrefix}/cardTypes/decision`;
const fromWorkflow = () => `${project.projectPrefix}/workflows/decision`;
const toWorkflow = () => `${project.projectPrefix}/workflows/simple`;

describe('CardTypeWorkflowChangeHandler', () => {
  beforeEach(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir(join(baseDir, '..', '..', 'test-data'), testDir);
    project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
  });
  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('matches an edit of cardType.workflow', () => {
    const handler = new CardTypeWorkflowChangeHandler();
    const ctx = {
      project,
      input: {
        kind: 'edit' as const,
        target: resourceName(cardTypeName()),
        updateKey: { key: 'workflow' },
        operation: {
          name: 'change' as const,
          target: fromWorkflow(),
          to: toWorkflow(),
        },
      },
    };
    expect(handler.matches(ctx)).toBe(true);
    expect(handler.isBreaking).toBe(true);
  });

  it('preview reports data loss when no mapping is provided', async () => {
    const handler = new CardTypeWorkflowChangeHandler();
    const ctx = {
      project,
      input: {
        kind: 'edit' as const,
        target: resourceName(cardTypeName()),
        updateKey: { key: 'workflow' },
        operation: {
          name: 'change' as const,
          target: fromWorkflow(),
          to: toWorkflow(),
        },
      },
    };
    const preview = await handler.preview(ctx);
    expect(preview.affectedCardCount).toBeGreaterThan(0);
    expect(preview.dataLossExpected).toBe(true);
  });

  it('preview reports no data loss when full mapping is provided', async () => {
    const handler = new CardTypeWorkflowChangeHandler();
    const ctx = {
      project,
      input: {
        kind: 'edit' as const,
        target: resourceName(cardTypeName()),
        updateKey: { key: 'workflow' },
        operation: {
          name: 'change' as const,
          target: fromWorkflow(),
          to: toWorkflow(),
          mappingTable: {
            stateMapping: {
              Draft: 'Created',
              Approved: 'Approved',
              Rejected: 'Deprecated',
              Rerejected: 'Deprecated',
              Deprecated: 'Deprecated',
            },
          },
        },
      },
    };
    const preview = await handler.preview(ctx);
    expect(preview.dataLossExpected).toBe(false);
  });

  it('rejects incomplete mappings the same way verifyStateMapping does', async () => {
    const handler = new CardTypeWorkflowChangeHandler();
    const ctx = {
      project,
      input: {
        kind: 'edit' as const,
        target: resourceName(cardTypeName()),
        updateKey: { key: 'workflow' },
        operation: {
          name: 'change' as const,
          target: fromWorkflow(),
          to: toWorkflow(),
          mappingTable: {
            stateMapping: { Draft: 'Created', Approved: 'Approved' },
          },
        },
      },
    };
    await expect(handler.apply(ctx)).rejects.toThrow(
      /State mapping validation failed/,
    );
  });

  it('applies mapping when provided', async () => {
    const handler = new CardTypeWorkflowChangeHandler();
    const ctx = {
      project,
      input: {
        kind: 'edit' as const,
        target: resourceName(cardTypeName()),
        updateKey: { key: 'workflow' },
        operation: {
          name: 'change' as const,
          target: fromWorkflow(),
          to: toWorkflow(),
          mappingTable: {
            stateMapping: {
              Draft: 'Created',
              Approved: 'Approved',
              Rejected: 'Deprecated',
              Rerejected: 'Deprecated',
              Deprecated: 'Deprecated',
            },
          },
        },
      },
    };
    await handler.apply(ctx);
    const updated = project.resources.byType(cardTypeName(), 'cardTypes').show();
    expect(updated.workflow).toBe(toWorkflow());
    for (const card of project.cards(undefined)) {
      if (card.metadata?.cardType === cardTypeName()) {
        expect(['Created', 'Approved', 'Deprecated']).toContain(
          card.metadata.workflowState,
        );
      }
    }
  });

  it('defaults every affected card to the first state of the new workflow when no mapping is given', async () => {
    const handler = new CardTypeWorkflowChangeHandler();
    const ctx = {
      project,
      input: {
        kind: 'edit' as const,
        target: resourceName(cardTypeName()),
        updateKey: { key: 'workflow' },
        operation: {
          name: 'change' as const,
          target: fromWorkflow(),
          to: toWorkflow(),
        },
      },
    };
    await handler.apply(ctx);
    const newWorkflow = project.resources
      .byType(toWorkflow(), 'workflows')
      .show();
    const firstState = newWorkflow!.states[0].name;
    for (const card of project.cards(undefined)) {
      if (card.metadata?.cardType === cardTypeName()) {
        expect(card.metadata.workflowState).toBe(firstState);
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd tools/data-handler && pnpm test test/mutations/handlers/card-type-workflow-change.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Commit the test**

```bash
git add tools/data-handler/test/mutations/handlers/card-type-workflow-change.test.ts
git commit -m "test: failing tests for CardTypeWorkflowChangeHandler"
```

---

### Task 4: CardType workflow-change handler — implementation

**Files:**

- Create: `tools/data-handler/src/mutations/handlers/card-type-workflow-change.ts`
- Modify: `tools/data-handler/src/mutations/dispatcher.ts`

Port `verifyStateMapping` from `card-type-resource.ts:309-359` and the per-card update loop from `handleWorkflowChange` (`card-type-resource.ts:126-163`). Two behaviours: with `mappingTable.stateMapping`, validate and apply per-card; without it, set every affected card to `newWorkflow.states[0].name`.

- [ ] **Step 1: Implement the handler**

```typescript
// tools/data-handler/src/mutations/handlers/card-type-workflow-change.ts

import { join } from 'node:path';

import type { Handler, MutationContext } from '../handler.js';
import type { CascadePreview } from '../types.js';
import { resourceNameToString } from '../../utils/resource-utils.js';
import type { Card } from '../../interfaces/project-interfaces.js';
import type { ChangeOperation } from '../../resources/resource-object.js';

export class CardTypeWorkflowChangeHandler implements Handler {
  readonly isBreaking = true;

  matches(ctx: MutationContext): boolean {
    if (ctx.input.kind !== 'edit') return false;
    if (ctx.input.target.type !== 'cardTypes') return false;
    return (
      ctx.input.updateKey.key === 'workflow' &&
      ctx.input.operation.name === 'change'
    );
  }

  async preview(ctx: MutationContext): Promise<CascadePreview> {
    const { mapping } = this.deconstruct(ctx);
    const cards = this.affectedCards(ctx);
    const dataLoss = Object.keys(mapping).length === 0 && cards.length > 0;
    return {
      affectedCardCount: cards.length,
      affectedLinkCount: 0,
      affectedCalculationCount: 0,
      affectedHandlebarFileCount: 0,
      dataLossExpected: dataLoss,
      summary: dataLoss
        ? `Resets workflowState on ${cards.length} cards to the first state of the new workflow.`
        : `Re-maps workflowState on ${cards.length} cards via state mapping.`,
    };
  }

  async apply(ctx: MutationContext): Promise<void> {
    const { op, mapping, newWorkflowName, cardTypeName } = this.deconstruct(ctx);

    // 1. Validate mapping when provided.
    if (Object.keys(mapping).length > 0) {
      this.verifyStateMapping(ctx, mapping, op);
    }

    // 2. Update the card type's workflow reference via the existing resource update.
    const resource = ctx.project.resources.byType(cardTypeName, 'cardTypes');
    if (!resource) throw new Error(`CardType '${cardTypeName}' not found`);
    // Pass through with mapping stripped so the existing card-type-resource.update
    // (post-trim) doesn't double-fire the cascade. We rewrite cards here.
    const updateOp: ChangeOperation<string> = {
      name: 'change',
      target: op.target as string,
      to: op.to as string,
    } as ChangeOperation<string>;
    await resource.update({ key: 'workflow' }, updateOp);

    // 3. Walk the affected cards.
    const cards = this.affectedCards(ctx);
    const newWorkflow = ctx.project.resources
      .byType(newWorkflowName, 'workflows')
      .show();
    if (!newWorkflow) {
      throw new Error(`Workflow '${newWorkflowName}' does not exist`);
    }
    const firstState = newWorkflow.states[0]?.name;
    if (!firstState) {
      throw new Error(`Workflow '${newWorkflowName}' has no states`);
    }

    for (const card of cards) {
      const metadata = card.metadata;
      if (!metadata) continue;
      const current = metadata.workflowState;
      const next =
        Object.keys(mapping).length > 0 ? mapping[current] ?? firstState : firstState;
      if (next !== current) {
        metadata.workflowState = next;
        await ctx.project.updateCardMetadata(card, metadata);
      }
    }
  }

  async affectedFilePaths(ctx: MutationContext): Promise<string[]> {
    return this.affectedCards(ctx).map((c) => join(c.path, 'index.json'));
  }

  private deconstruct(ctx: MutationContext) {
    if (ctx.input.kind !== 'edit') {
      throw new Error('CardTypeWorkflowChangeHandler called with non-edit input');
    }
    const op = ctx.input.operation as ChangeOperation<string>;
    const mapping = op.mappingTable?.stateMapping ?? {};
    return {
      op,
      mapping,
      cardTypeName: resourceNameToString(ctx.input.target),
      newWorkflowName: op.to as string,
    };
  }

  private affectedCards(ctx: MutationContext): Card[] {
    if (ctx.input.kind !== 'edit') return [];
    const cardTypeName = resourceNameToString(ctx.input.target);
    return [...ctx.project.cards(undefined)].filter(
      (c) => c.metadata?.cardType === cardTypeName,
    );
  }

  // Ported from CardTypeResource.verifyStateMapping.
  private verifyStateMapping(
    ctx: MutationContext,
    mapping: Record<string, string>,
    op: ChangeOperation<string>,
  ) {
    const currentWorkflowName = op.target as string;
    const currentWorkflow = ctx.project.resources
      .byType(currentWorkflowName, 'workflows')
      .show();
    if (!currentWorkflow) {
      throw new Error(
        `Workflow '${currentWorkflowName}' does not exist in the project`,
      );
    }
    const newWorkflow = ctx.project.resources
      .byType(op.to as string, 'workflows')
      .show();
    if (!newWorkflow) {
      throw new Error(`Workflow '${op.to}' does not exist in the project`);
    }
    const currentStates = currentWorkflow.states.map((s) => s.name);
    const mappedSources = Object.keys(mapping);
    const unmappedSources = currentStates.filter(
      (s) => !mappedSources.includes(s),
    );
    if (unmappedSources.length > 0) {
      throw new Error(
        `State mapping validation failed: The following states exist in the current workflow '${currentWorkflowName}' ` +
          `but are not mapped from in the state mapping JSON file: ${unmappedSources.join(', ')}. ` +
          `Please ensure all states in the current workflow are accounted for in the mapping to ensure all cards are properly updated.`,
      );
    }
    const newStates = newWorkflow.states.map((s) => s.name);
    const invalidTargets = Object.values(mapping).filter(
      (s) => !newStates.includes(s),
    );
    if (invalidTargets.length > 0) {
      throw new Error(
        `State mapping validation failed: The following target states in the mapping do not exist in the new workflow '${op.to}': ${invalidTargets.join(', ')}.`,
      );
    }
  }
}
```

- [ ] **Step 2: Register in the dispatcher**

```typescript
import { CardTypeWorkflowChangeHandler } from './handlers/card-type-workflow-change.js';

const HANDLERS: Handler[] = [
  // ...
  new CardTypeWorkflowChangeHandler(),
  new CardTypeRenameHandler(),
  // ...
  new DefaultNoCascadeHandler(),
];
```

Specific edit handlers must precede the rename handlers; both must precede the default. Order inside CardType handlers doesn't matter — `matches()` is mutually exclusive.

- [ ] **Step 3: Run the tests**

```bash
cd tools/data-handler && pnpm test test/mutations/handlers/card-type-workflow-change.test.ts
```

Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add tools/data-handler/src/mutations/handlers/card-type-workflow-change.ts \
        tools/data-handler/src/mutations/dispatcher.ts
git commit -m "feat: CardTypeWorkflowChangeHandler with mappingTable support"
```

---

### Task 5: CardType add-custom-field handler — failing test

**Files:**

- Create: `tools/data-handler/test/mutations/handlers/card-type-add-custom-field.test.ts`

The cascade is small: every card of this type gets the new metadata key set to `null` so that `Validate` accepts it. The plan table calls this near-non-breaking (a validation tweak); the handler is still classified `isBreaking = true` because the migration log must record it so consumers' validators stay happy across the upgrade.

- [ ] **Step 1: Write the failing test**

```typescript
// tools/data-handler/test/mutations/handlers/card-type-add-custom-field.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { copyDir } from '../../../src/utils/file-utils.js';
import type { Project } from '../../../src/containers/project.js';
import { getTestProject } from '../../helpers/test-utils.js';
import { CardTypeAddCustomFieldHandler } from '../../../src/mutations/handlers/card-type-add-custom-field.js';
import { resourceName } from '../../../src/utils/resource-utils.js';

const baseDir = import.meta.dirname;
const testDir = join(baseDir, 'tmp-card-type-add-field');
const decisionRecordsPath = join(testDir, 'valid/decision-records');
let project: Project;

describe('CardTypeAddCustomFieldHandler', () => {
  beforeEach(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir(join(baseDir, '..', '..', 'test-data'), testDir);
    project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
  });
  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('matches an add operation on customFields', () => {
    const handler = new CardTypeAddCustomFieldHandler();
    const ctx = {
      project,
      input: {
        kind: 'edit' as const,
        target: resourceName(`${project.projectPrefix}/cardTypes/decision`),
        updateKey: { key: 'customFields' },
        operation: {
          name: 'add' as const,
          target: { name: `${project.projectPrefix}/fieldTypes/finished` },
        },
      },
    };
    expect(handler.matches(ctx)).toBe(true);
    expect(handler.isBreaking).toBe(true);
  });

  it('writes null for the new field on every affected card', async () => {
    const handler = new CardTypeAddCustomFieldHandler();
    const newField = `${project.projectPrefix}/fieldTypes/finished`;
    // Pick a field that is not already in the decision card type's customFields
    // — or use a fresh field type added via the fixture. (Adjust if needed.)
    const cardTypeName = `${project.projectPrefix}/cardTypes/simplepage`;
    const ctx = {
      project,
      input: {
        kind: 'edit' as const,
        target: resourceName(cardTypeName),
        updateKey: { key: 'customFields' },
        operation: {
          name: 'add' as const,
          target: { name: newField },
        },
      },
    };
    await handler.apply(ctx);
    const cards = project.cards(undefined).filter(
      (c) => c.metadata?.cardType === cardTypeName,
    );
    for (const card of cards) {
      expect(card.metadata).toHaveProperty(newField);
      expect(card.metadata![newField]).toBeNull();
    }
  });
});
```

If `decision/cardTypes/simplepage` is not present in the fixture, swap to whichever local cardType the fixture provides that has at least one card and does not already include `finished` in `customFields`. Run `cat tools/data-handler/test/test-data/valid/decision-records/.cards/local/cardTypes/*.json` to verify.

- [ ] **Step 2: Run test to verify it fails**

```bash
cd tools/data-handler && pnpm test test/mutations/handlers/card-type-add-custom-field.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Commit the test**

```bash
git add tools/data-handler/test/mutations/handlers/card-type-add-custom-field.test.ts
git commit -m "test: failing tests for CardTypeAddCustomFieldHandler"
```

---

### Task 6: CardType add-custom-field handler — implementation

**Files:**

- Create: `tools/data-handler/src/mutations/handlers/card-type-add-custom-field.ts`
- Modify: `tools/data-handler/src/mutations/dispatcher.ts`

```typescript
// tools/data-handler/src/mutations/handlers/card-type-add-custom-field.ts

import { join } from 'node:path';

import type { Handler, MutationContext } from '../handler.js';
import type { CascadePreview } from '../types.js';
import { resourceNameToString } from '../../utils/resource-utils.js';
import type { Card } from '../../interfaces/project-interfaces.js';
import type {
  AddOperation,
  Operation,
} from '../../resources/resource-object.js';
import type { CustomField } from '../../interfaces/resource-interfaces.js';

export class CardTypeAddCustomFieldHandler implements Handler {
  readonly isBreaking = true;

  matches(ctx: MutationContext): boolean {
    if (ctx.input.kind !== 'edit') return false;
    if (ctx.input.target.type !== 'cardTypes') return false;
    return (
      ctx.input.updateKey.key === 'customFields' &&
      ctx.input.operation.name === 'add'
    );
  }

  async preview(ctx: MutationContext): Promise<CascadePreview> {
    const cards = this.affectedCards(ctx);
    return {
      affectedCardCount: cards.length,
      affectedLinkCount: 0,
      affectedCalculationCount: 0,
      affectedHandlebarFileCount: 0,
      dataLossExpected: false,
      summary: `Adds the field as null on ${cards.length} cards.`,
    };
  }

  async apply(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'edit') {
      throw new Error('CardTypeAddCustomFieldHandler called with non-edit input');
    }
    const cardTypeName = resourceNameToString(ctx.input.target);
    const resource = ctx.project.resources.byType(cardTypeName, 'cardTypes');
    if (!resource) throw new Error(`CardType '${cardTypeName}' not found`);
    await resource.update(ctx.input.updateKey, ctx.input.operation as Operation<unknown>);

    const fieldName = this.fieldName(ctx.input.operation as AddOperation<CustomField | string>);
    const cards = this.affectedCards(ctx);
    for (const card of cards) {
      if (!card.metadata) continue;
      card.metadata[fieldName] = null;
      await ctx.project.updateCardMetadata(card, card.metadata);
    }
  }

  async affectedFilePaths(ctx: MutationContext): Promise<string[]> {
    return this.affectedCards(ctx).map((c) => join(c.path, 'index.json'));
  }

  private affectedCards(ctx: MutationContext): Card[] {
    if (ctx.input.kind !== 'edit') return [];
    const cardTypeName = resourceNameToString(ctx.input.target);
    return [...ctx.project.cards(undefined)].filter(
      (c) => c.metadata?.cardType === cardTypeName,
    );
  }

  private fieldName(op: AddOperation<CustomField | string>): string {
    const target = op.target;
    if (typeof target === 'string') return target;
    return (target as CustomField).name;
  }
}
```

- [ ] **Step 1: Implement and register**

Add to the dispatcher's `HANDLERS` array (ahead of the default):

```typescript
import { CardTypeAddCustomFieldHandler } from './handlers/card-type-add-custom-field.js';

const HANDLERS: Handler[] = [
  // ...
  new CardTypeAddCustomFieldHandler(),
  // ...
  new DefaultNoCascadeHandler(),
];
```

- [ ] **Step 2: Run the tests**

```bash
cd tools/data-handler && pnpm test test/mutations/handlers/card-type-add-custom-field.test.ts
```

Expected: all PASS.

- [ ] **Step 3: Commit**

```bash
git add tools/data-handler/src/mutations/handlers/card-type-add-custom-field.ts \
        tools/data-handler/src/mutations/dispatcher.ts
git commit -m "feat: CardTypeAddCustomFieldHandler initialises new field as null"
```

---

### Task 7: CardType remove-custom-field handler — failing test

**Files:**

- Create: `tools/data-handler/test/mutations/handlers/card-type-remove-custom-field.test.ts`

Two cascades: clear the metadata key from every card of this type (today's `handleRemoveField`), and strip the field from `alwaysVisibleFields` / `optionallyVisibleFields` on the card type itself (today's `removeValueFromOtherArrays`).

- [ ] **Step 1: Write the failing test**

```typescript
// tools/data-handler/test/mutations/handlers/card-type-remove-custom-field.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { copyDir } from '../../../src/utils/file-utils.js';
import type { Project } from '../../../src/containers/project.js';
import { getTestProject } from '../../helpers/test-utils.js';
import { CardTypeRemoveCustomFieldHandler } from '../../../src/mutations/handlers/card-type-remove-custom-field.js';
import { resourceName } from '../../../src/utils/resource-utils.js';

const baseDir = import.meta.dirname;
const testDir = join(baseDir, 'tmp-card-type-remove-field');
const decisionRecordsPath = join(testDir, 'valid/decision-records');
let project: Project;

describe('CardTypeRemoveCustomFieldHandler', () => {
  beforeEach(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir(join(baseDir, '..', '..', 'test-data'), testDir);
    project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
  });
  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  const cardTypeName = () => `${project.projectPrefix}/cardTypes/decision`;
  const fieldName = () => `${project.projectPrefix}/fieldTypes/finished`;

  it('matches a remove operation on customFields', () => {
    const handler = new CardTypeRemoveCustomFieldHandler();
    expect(
      handler.matches({
        project,
        input: {
          kind: 'edit',
          target: resourceName(cardTypeName()),
          updateKey: { key: 'customFields' },
          operation: { name: 'remove', target: { name: fieldName() } },
        },
      }),
    ).toBe(true);
    expect(handler.isBreaking).toBe(true);
  });

  it('preview reports data loss', async () => {
    const handler = new CardTypeRemoveCustomFieldHandler();
    const preview = await handler.preview({
      project,
      input: {
        kind: 'edit',
        target: resourceName(cardTypeName()),
        updateKey: { key: 'customFields' },
        operation: { name: 'remove', target: { name: fieldName() } },
      },
    });
    expect(preview.dataLossExpected).toBe(true);
  });

  it('removes the field key from every card of this type', async () => {
    const handler = new CardTypeRemoveCustomFieldHandler();
    await handler.apply({
      project,
      input: {
        kind: 'edit',
        target: resourceName(cardTypeName()),
        updateKey: { key: 'customFields' },
        operation: { name: 'remove', target: { name: fieldName() } },
      },
    });
    const cards = project.cards(undefined).filter(
      (c) => c.metadata?.cardType === cardTypeName(),
    );
    for (const card of cards) {
      expect(card.metadata).not.toHaveProperty(fieldName());
    }
  });

  it('strips the field from alwaysVisibleFields and optionallyVisibleFields', async () => {
    const handler = new CardTypeRemoveCustomFieldHandler();
    await handler.apply({
      project,
      input: {
        kind: 'edit',
        target: resourceName(cardTypeName()),
        updateKey: { key: 'customFields' },
        operation: { name: 'remove', target: { name: fieldName() } },
      },
    });
    const ct = project.resources.byType(cardTypeName(), 'cardTypes').show();
    expect(ct.alwaysVisibleFields ?? []).not.toContain(fieldName());
    expect(ct.optionallyVisibleFields ?? []).not.toContain(fieldName());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd tools/data-handler && pnpm test test/mutations/handlers/card-type-remove-custom-field.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Commit the test**

```bash
git add tools/data-handler/test/mutations/handlers/card-type-remove-custom-field.test.ts
git commit -m "test: failing tests for CardTypeRemoveCustomFieldHandler"
```

---

### Task 8: CardType remove-custom-field handler — implementation

**Files:**

- Create: `tools/data-handler/src/mutations/handlers/card-type-remove-custom-field.ts`
- Modify: `tools/data-handler/src/mutations/dispatcher.ts`

```typescript
// tools/data-handler/src/mutations/handlers/card-type-remove-custom-field.ts

import { join } from 'node:path';

import type { Handler, MutationContext } from '../handler.js';
import type { CascadePreview } from '../types.js';
import { resourceNameToString } from '../../utils/resource-utils.js';
import type { Card } from '../../interfaces/project-interfaces.js';
import type {
  Operation,
  RemoveOperation,
} from '../../resources/resource-object.js';
import type { CustomField } from '../../interfaces/resource-interfaces.js';

export class CardTypeRemoveCustomFieldHandler implements Handler {
  readonly isBreaking = true;

  matches(ctx: MutationContext): boolean {
    if (ctx.input.kind !== 'edit') return false;
    if (ctx.input.target.type !== 'cardTypes') return false;
    return (
      ctx.input.updateKey.key === 'customFields' &&
      ctx.input.operation.name === 'remove'
    );
  }

  async preview(ctx: MutationContext): Promise<CascadePreview> {
    const cards = this.affectedCards(ctx);
    return {
      affectedCardCount: cards.length,
      affectedLinkCount: 0,
      affectedCalculationCount: 0,
      affectedHandlebarFileCount: 0,
      dataLossExpected: true,
      summary: `Removes the field key from ${cards.length} cards (data loss).`,
    };
  }

  async apply(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'edit') {
      throw new Error('CardTypeRemoveCustomFieldHandler called with non-edit input');
    }
    const cardTypeName = resourceNameToString(ctx.input.target);
    const resource = ctx.project.resources.byType(cardTypeName, 'cardTypes');
    if (!resource) throw new Error(`CardType '${cardTypeName}' not found`);

    // Apply the resource-level remove. This drops the entry from customFields
    // and (post-trim) also strips the same value from alwaysVisibleFields and
    // optionallyVisibleFields — we duplicate that strip here so the handler
    // remains correct even after the resource class is trimmed.
    await resource.update(ctx.input.updateKey, ctx.input.operation as Operation<unknown>);

    const fieldName = this.fieldName(
      ctx.input.operation as RemoveOperation<CustomField | string>,
    );

    // Strip from alwaysVisibleFields and optionallyVisibleFields on the resource.
    const after = resource.show() as {
      alwaysVisibleFields?: string[];
      optionallyVisibleFields?: string[];
    };
    if ((after.alwaysVisibleFields ?? []).includes(fieldName)) {
      await resource.update(
        { key: 'alwaysVisibleFields' },
        { name: 'remove', target: fieldName } as RemoveOperation<string>,
      );
    }
    if ((after.optionallyVisibleFields ?? []).includes(fieldName)) {
      await resource.update(
        { key: 'optionallyVisibleFields' },
        { name: 'remove', target: fieldName } as RemoveOperation<string>,
      );
    }

    // Clear the field from every card of this type.
    for (const card of this.affectedCards(ctx)) {
      if (!card.metadata) continue;
      if (Object.prototype.hasOwnProperty.call(card.metadata, fieldName)) {
        delete card.metadata[fieldName];
        await ctx.project.updateCardMetadata(card, card.metadata);
      }
    }
  }

  async affectedFilePaths(ctx: MutationContext): Promise<string[]> {
    return this.affectedCards(ctx).map((c) => join(c.path, 'index.json'));
  }

  private affectedCards(ctx: MutationContext): Card[] {
    if (ctx.input.kind !== 'edit') return [];
    const cardTypeName = resourceNameToString(ctx.input.target);
    return [...ctx.project.cards(undefined)].filter(
      (c) => c.metadata?.cardType === cardTypeName,
    );
  }

  private fieldName(op: RemoveOperation<CustomField | string>): string {
    const target = op.target;
    if (typeof target === 'string') return target;
    return (target as CustomField).name;
  }
}
```

- [ ] **Step 1: Implement and register**

Update the dispatcher:

```typescript
import { CardTypeRemoveCustomFieldHandler } from './handlers/card-type-remove-custom-field.js';

const HANDLERS: Handler[] = [
  // ...
  new CardTypeRemoveCustomFieldHandler(),
  // ...
  new DefaultNoCascadeHandler(),
];
```

- [ ] **Step 2: Run the tests**

```bash
cd tools/data-handler && pnpm test test/mutations/handlers/card-type-remove-custom-field.test.ts
```

Expected: all PASS.

- [ ] **Step 3: Commit**

```bash
git add tools/data-handler/src/mutations/handlers/card-type-remove-custom-field.ts \
        tools/data-handler/src/mutations/dispatcher.ts
git commit -m "feat: CardTypeRemoveCustomFieldHandler clears field and trims visibility lists"
```

---

### Task 9: CardType delete handler — failing test

**Files:**

- Create: `tools/data-handler/test/mutations/handlers/card-type-delete.test.ts`

The destructive cascade. The basic-migration row in `migrations-plan.adoc` says "Delete all cards of this type." On top of that, every link type that references the card type must drop the reference. The current `ResourceObject.delete()` refuses with `usage > 0`; the handler does the cascade then deletes.

- [ ] **Step 1: Write the failing test**

```typescript
// tools/data-handler/test/mutations/handlers/card-type-delete.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { copyDir } from '../../../src/utils/file-utils.js';
import type { Project } from '../../../src/containers/project.js';
import { getTestProject } from '../../helpers/test-utils.js';
import { CardTypeDeleteHandler } from '../../../src/mutations/handlers/card-type-delete.js';
import { resourceName } from '../../../src/utils/resource-utils.js';

const baseDir = import.meta.dirname;
const testDir = join(baseDir, 'tmp-card-type-delete');
const decisionRecordsPath = join(testDir, 'valid/decision-records');
let project: Project;

describe('CardTypeDeleteHandler', () => {
  beforeEach(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir(join(baseDir, '..', '..', 'test-data'), testDir);
    project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
  });
  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  const cardTypeName = () => `${project.projectPrefix}/cardTypes/decision`;

  it('matches a CardType delete input', () => {
    const handler = new CardTypeDeleteHandler();
    expect(
      handler.matches({
        project,
        input: {
          kind: 'delete',
          target: resourceName(cardTypeName()),
        },
      }),
    ).toBe(true);
    expect(handler.isBreaking).toBe(true);
  });

  it('preview reports data loss and counts cards', async () => {
    const handler = new CardTypeDeleteHandler();
    const preview = await handler.preview({
      project,
      input: { kind: 'delete', target: resourceName(cardTypeName()) },
    });
    expect(preview.dataLossExpected).toBe(true);
    expect(preview.affectedCardCount).toBeGreaterThan(0);
  });

  it('deletes every card of this type', async () => {
    const handler = new CardTypeDeleteHandler();
    const before = project.cards(undefined).filter(
      (c) => c.metadata?.cardType === cardTypeName(),
    );
    expect(before.length).toBeGreaterThan(0);

    await handler.apply({
      project,
      input: { kind: 'delete', target: resourceName(cardTypeName()) },
    });
    // Re-read after apply (caches were invalidated by removeCard calls).
    await project.populateCaches();
    const after = project.cards(undefined).filter(
      (c) => c.metadata?.cardType === cardTypeName(),
    );
    expect(after).toHaveLength(0);
  });

  it('strips the card type from every link types sourceCardTypes/destinationCardTypes', async () => {
    const handler = new CardTypeDeleteHandler();
    await handler.apply({
      project,
      input: { kind: 'delete', target: resourceName(cardTypeName()) },
    });
    for (const lt of project.resources.linkTypes()) {
      const data = lt.data!;
      expect(data.sourceCardTypes).not.toContain(cardTypeName());
      expect(data.destinationCardTypes).not.toContain(cardTypeName());
    }
  });

  it('deletes the card type resource file from disk', async () => {
    const handler = new CardTypeDeleteHandler();
    await handler.apply({
      project,
      input: { kind: 'delete', target: resourceName(cardTypeName()) },
    });
    expect(project.resources.exists(cardTypeName())).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd tools/data-handler && pnpm test test/mutations/handlers/card-type-delete.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Commit the test**

```bash
git add tools/data-handler/test/mutations/handlers/card-type-delete.test.ts
git commit -m "test: failing tests for CardTypeDeleteHandler"
```

---

### Task 10: CardType delete handler — implementation

**Files:**

- Create: `tools/data-handler/src/mutations/handlers/card-type-delete.ts`
- Modify: `tools/data-handler/src/mutations/dispatcher.ts`

The order matters: drop link-type references first, then delete cards (so the link-removal logic does not need to deal with orphan links), then finally call `resource.delete()`. By the time `delete()` runs the resource's `usage()` returns `[]`, so the existing safety guard passes naturally.

Use `Remove.removeCard` (in `tools/data-handler/src/commands/remove.ts`) for card deletion — that's the function that already handles link cleanup and child cascades.

- [ ] **Step 1: Implement the handler**

```typescript
// tools/data-handler/src/mutations/handlers/card-type-delete.ts

import { join } from 'node:path';

import type { Handler, MutationContext } from '../handler.js';
import type { CascadePreview } from '../types.js';
import { resourceNameToString } from '../../utils/resource-utils.js';
import { ResourcesFrom } from '../../containers/project/resources-from.js';
import type { Card } from '../../interfaces/project-interfaces.js';
import type { ChangeOperation } from '../../resources/resource-object.js';
import { Remove } from '../../commands/remove.js';

export class CardTypeDeleteHandler implements Handler {
  readonly isBreaking = true;

  matches(ctx: MutationContext): boolean {
    return (
      ctx.input.kind === 'delete' && ctx.input.target.type === 'cardTypes'
    );
  }

  async preview(ctx: MutationContext): Promise<CascadePreview> {
    if (ctx.input.kind !== 'delete') {
      throw new Error('CardTypeDeleteHandler called with non-delete input');
    }
    const cardTypeName = resourceNameToString(ctx.input.target);
    const cards = this.affectedCards(ctx, cardTypeName);
    const linkRefs = this.linkTypeReferenceCount(ctx, cardTypeName);
    return {
      affectedCardCount: cards.length,
      affectedLinkCount: linkRefs,
      affectedCalculationCount: 0,
      affectedHandlebarFileCount: 0,
      dataLossExpected: true,
      summary:
        `Deletes ${cards.length} cards and removes ${linkRefs} link-type references; ` +
        `then deletes the card type resource.`,
    };
  }

  async apply(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'delete') {
      throw new Error('CardTypeDeleteHandler called with non-delete input');
    }
    const cardTypeName = resourceNameToString(ctx.input.target);

    // 1. Strip the card type from every link type.
    const linkTypes = ctx.project.resources.linkTypes(ResourcesFrom.localOnly);
    for (const lt of linkTypes) {
      const data = lt.data;
      if (!data) continue;
      for (const field of ['sourceCardTypes', 'destinationCardTypes'] as const) {
        if (data[field].includes(cardTypeName)) {
          const op: ChangeOperation<string> = {
            name: 'remove',
            target: cardTypeName,
          } as unknown as ChangeOperation<string>;
          // remove operation is allowed here despite the type alias.
          await lt.update({ key: field }, op);
        }
      }
    }

    // 2. Delete every card of this type. Uses Remove.remove which already
    //    handles child cascades and link cleanup.
    const remove = new Remove(ctx.project);
    const cards = this.affectedCards(ctx, cardTypeName);
    // Sort root-cards-last is unnecessary here — removeCard handles descendants.
    // But sort cards so that cards deeper in the tree are removed first to
    // avoid double-removal attempts.
    const sorted = [...cards].sort(
      (a, b) => b.path.split('/').length - a.path.split('/').length,
    );
    for (const card of sorted) {
      // Some descendants may already be gone; ignore missing-card errors.
      try {
        await remove.remove('card', card.key);
      } catch {
        // already removed via parent cascade
      }
    }

    // 3. Delete the card type resource itself. By now usage() returns [].
    const resource = ctx.project.resources.byType(cardTypeName, 'cardTypes');
    if (!resource) throw new Error(`CardType '${cardTypeName}' not found`);
    await resource.delete();
  }

  async affectedFilePaths(ctx: MutationContext): Promise<string[]> {
    if (ctx.input.kind !== 'delete') return [];
    const cardTypeName = resourceNameToString(ctx.input.target);
    return this.affectedCards(ctx, cardTypeName).map((c) =>
      join(c.path, 'index.json'),
    );
  }

  private affectedCards(ctx: MutationContext, cardTypeName: string): Card[] {
    return [...ctx.project.cards(undefined)].filter(
      (c) => c.metadata?.cardType === cardTypeName,
    );
  }

  private linkTypeReferenceCount(
    ctx: MutationContext,
    cardTypeName: string,
  ): number {
    let count = 0;
    for (const lt of ctx.project.resources.linkTypes()) {
      const data = lt.data;
      if (!data) continue;
      if (data.sourceCardTypes.includes(cardTypeName)) count += 1;
      if (data.destinationCardTypes.includes(cardTypeName)) count += 1;
    }
    return count;
  }
}
```

- [ ] **Step 2: Register in the dispatcher**

```typescript
import { CardTypeDeleteHandler } from './handlers/card-type-delete.js';

const HANDLERS: Handler[] = [
  new CardTypeDeleteHandler(),
  // ...
  new DefaultNoCascadeHandler(),
];
```

- [ ] **Step 3: Run the tests**

```bash
cd tools/data-handler && pnpm test test/mutations/handlers/card-type-delete.test.ts
```

Expected: all PASS. If a test fails because `Remove.remove('card', card.key)` rejects on a card already removed by a parent cascade, refine the try/catch above to filter on the specific error message.

- [ ] **Step 4: Commit**

```bash
git add tools/data-handler/src/mutations/handlers/card-type-delete.ts \
        tools/data-handler/src/mutations/dispatcher.ts
git commit -m "feat: CardTypeDeleteHandler cascades card and link-type cleanup"
```

---

### Task 11: Route CardType operations through `ResourceMutations`

**Files:**

- Modify: `tools/data-handler/src/commands/update.ts`
- Modify: `tools/data-handler/src/commands/remove.ts`
- Modify: `tools/data-handler/src/commands/rename.ts`
- Test: `tools/data-handler/test/command-update.test.ts`

The foundation plan routed link-type renames; this task widens the routing for CardType. Three call sites:

1. `commands/update.ts:applyResourceOperation` — for CardType `customFields` (add/remove) and `workflow` (change) edits, and for `name` (change) renames, delegate to `ResourceMutations`. Other keys fall through.
2. `commands/remove.ts:remove` — for `type === 'cardType'`, route through `ResourceMutations.apply({ kind: 'delete', target })` instead of `resource.delete()`.
3. `commands/rename.ts` — for direct cardType renames (the `rename` command's branch), delegate to `ResourceMutations.apply({ kind: 'rename', ... })`. Inside the project-rename loop (`commands/rename.ts:218-225`), leave the per-resource `cardType.rename(...)` call as-is — project rename is its own atomic operation; routing each subordinate step through `ResourceMutations` would double-log.

- [ ] **Step 1: Write a regression test for the update path**

Append to `tools/data-handler/test/command-update.test.ts` (inside the existing `describe('update command', …)` block):

```typescript
it('routes CardType workflow change through the mutation engine', async () => {
  const { ConfigurationLogger } = await import(
    '../src/utils/configuration-logger.js'
  );
  const name = `${project.projectPrefix}/cardTypes/decision`;
  const currentWorkflow = `${project.projectPrefix}/workflows/decision`;
  const newWorkflow = `${project.projectPrefix}/workflows/simple`;
  const stateMap = {
    stateMapping: {
      Draft: 'Created',
      Approved: 'Approved',
      Rejected: 'Deprecated',
      Rerejected: 'Deprecated',
      Deprecated: 'Deprecated',
    },
  };

  await update.updateValue(
    name,
    'change',
    'workflow',
    currentWorkflow,
    newWorkflow,
    stateMap,
  );

  const entries = await ConfigurationLogger.entries(project.basePath);
  expect(
    entries.some(
      (e) => e.kind === 'resource_edit' && e.target === name,
    ),
  ).toBe(true);
});

it('routes CardType delete through the mutation engine', async () => {
  const { ConfigurationLogger } = await import(
    '../src/utils/configuration-logger.js'
  );
  const { Remove } = await import('../src/commands/remove.js');
  const remove = new Remove(project);
  const name = `${project.projectPrefix}/cardTypes/decision`;

  await remove.remove('cardType', name);

  expect(project.resources.exists(name)).toBe(false);
  const entries = await ConfigurationLogger.entries(project.basePath);
  expect(
    entries.some((e) => e.kind === 'resource_delete' && e.target === name),
  ).toBe(true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd tools/data-handler && pnpm test test/command-update.test.ts -t "routes CardType"
```

Expected: FAIL — log entries not present (the old path doesn't produce them) and/or the delete throws on `usage > 0`.

- [ ] **Step 3: Modify `commands/update.ts`**

Locate `applyResourceOperation` (the same function the foundation plan modified for link-type rename). Widen the routing predicate. After the link-type-rename branch the foundation plan added, add a CardType branch:

```typescript
public async applyResourceOperation<
  Type,
  T extends UpdateOperations,
  K extends string,
>(name: string, updateKey: UpdateKey<K>, operation: OperationFor<Type, T>) {
  const type = this.project.resources.extractType(name);

  // Foundation plan: link-type rename branch (unchanged).
  // ... existing branch ...

  // CardType-specific routing.
  if (type === 'cardTypes') {
    const { resourceName: parseResourceName } = await import(
      '../utils/resource-utils.js'
    );
    const { ResourceMutations } = await import('../mutations/plan.js');
    const mutations = new ResourceMutations(this.project);
    const target = parseResourceName(name);

    // Rename (change name).
    if (updateKey.key === 'name' && operation.name === 'change') {
      const newIdentifier = parseResourceName(
        (operation as { to: string }).to,
      ).identifier;
      const plan = await mutations.plan({ kind: 'rename', target, newIdentifier });
      await mutations.apply(
        { kind: 'rename', target, newIdentifier },
        { fingerprint: plan.fingerprint },
      );
      return;
    }

    // Routed edits: workflow change, customFields add/remove.
    const isRoutedEdit =
      (updateKey.key === 'workflow' && operation.name === 'change') ||
      (updateKey.key === 'customFields' &&
        (operation.name === 'add' || operation.name === 'remove'));

    if (isRoutedEdit) {
      const input = {
        kind: 'edit' as const,
        target,
        updateKey: updateKey as { key: string },
        operation: operation as unknown as Operation<unknown>,
      };
      const plan = await mutations.plan(input);
      await mutations.apply(input, { fingerprint: plan.fingerprint });
      return;
    }
    // Display-only and visibility-list edits fall through to the existing path.
  }

  // Existing fallback (unchanged from foundation plan).
  const run = () =>
    this.project.lock.write(async () => {
      const resource = this.project.resources.byType(name, type);
      await resource?.update(updateKey, operation);
    });
  return runWithDefaultCommitMessage('Apply resource operation', run);
}
```

- [ ] **Step 4: Modify `commands/remove.ts`**

In the `remove()` method's `projectResource(type)` branch, special-case CardType:

```typescript
if (this.projectResource(type)) {
  const resourceType = this.project.resources.resourceTypeFromSingularType(type);
  if (resourceType === 'cardTypes') {
    const { resourceName: parseResourceName } = await import(
      '../utils/resource-utils.js'
    );
    const { ResourceMutations } = await import('../mutations/plan.js');
    const mutations = new ResourceMutations(this.project);
    const target = parseResourceName(targetName);
    const plan = await mutations.plan({ kind: 'delete', target });
    await mutations.apply(
      { kind: 'delete', target },
      { fingerprint: plan.fingerprint },
    );
    return;
  }
  const resource = this.project.resources.byType(targetName, resourceType);
  return resource?.delete();
}
```

- [ ] **Step 5: Modify `commands/rename.ts`**

In the top-level `rename(targetName, newName)` path (find it — it's the public method that branches by extracted resource type and ultimately calls `cardType.rename(...)` for cardTypes), add the same `ResourceMutations` routing before the `await cardType.rename(...)` call site that handles direct cardType renames. Leave the project-rename loop (the `rename(to)` method at `commands/rename.ts:194`) untouched.

```typescript
// Inside the top-level rename command's cardType branch:
const { ResourceMutations } = await import('../mutations/plan.js');
const { resourceName: parseResourceName } = await import(
  '../utils/resource-utils.js'
);
const mutations = new ResourceMutations(this.project);
const target = parseResourceName(targetName);
const newIdentifier = parseResourceName(newName).identifier;
const plan = await mutations.plan({ kind: 'rename', target, newIdentifier });
await mutations.apply(
  { kind: 'rename', target, newIdentifier },
  { fingerprint: plan.fingerprint },
);
return;
```

Locate the exact line by running `grep -n "cardType.rename" tools/data-handler/src/commands/rename.ts` — it's the call inside the top-level `rename` method (distinct from the project-rename helper).

- [ ] **Step 6: Run the routing tests**

```bash
cd tools/data-handler && pnpm test test/command-update.test.ts -t "routes CardType"
cd tools/data-handler && pnpm test test/command-update.test.ts
```

Expected: PASS.

- [ ] **Step 7: Run the full suite**

```bash
cd tools/data-handler && pnpm test
```

Expected: all PASS. If any existing test asserts on the old `usage > 0` throw for cardType delete, update it — the new behaviour is the intended one.

- [ ] **Step 8: Commit**

```bash
git add tools/data-handler/src/commands/update.ts \
        tools/data-handler/src/commands/remove.ts \
        tools/data-handler/src/commands/rename.ts \
        tools/data-handler/test/command-update.test.ts
git commit -m "feat: route CardType edits/deletes/renames through ResourceMutations"
```

---

### Task 12: Trim `CardTypeResource` of its cascade methods

**Files:**

- Modify: `tools/data-handler/src/resources/card-type-resource.ts`

The handlers now own the cascade. The methods listed below are dead from the public `update()` entry point's perspective. Some are also called from `onNameChange()` — that path is also dead once the foundation plan + this plan route renames through `ResourceMutations`, but we leave `onNameChange()` itself intact because it still runs `updateHandleBars`, `updateCalculations`, `updateCardContentReferences` (these are inherited from `FileResource` / `ResourceObject`, not duplicated in the handler).

**Methods to remove:**

- `handleCustomFieldsChange` (lines ~73-102)
- `handleAddNewField` (lines ~104-112)
- `handleRemoveField` (lines ~114-122)
- `handleWorkflowChange` (lines ~126-163)
- `removeValueFromOtherArrays` (lines ~195-209)
- `updateLinkTypes` (lines ~237-264)
- `updateCardMetadata` private helper (lines ~267-277)
- `verifyStateMapping` (lines ~309-359)

**Method to simplify:**

- `update(updateKey, op)` (lines ~445-496). After removing the helpers, the body collapses to:
  - `name` → `super.update(updateKey, op)` via `isBaseProperty(key)`.
  - `alwaysVisibleFields` / `optionallyVisibleFields` → keep `validateFieldType` + `handleArray` block.
  - `workflow` / `customFields` → strip everything except the `super.postUpdate(content, updateKey, op)` write. Cards are no longer touched here; the handler does that.

**`onNameChange`**: remove the `this.updateLinkTypes(existingName)` line from the `Promise.all`. The link-type rewrite is now in `CardTypeRenameHandler.apply`. Keep the other three (`updateHandleBars`, `updateCalculations`, `updateCardContentReferences`) as-is — those run through the base class and are not duplicated in the handler.

- [ ] **Step 1: Edit the file**

Open `tools/data-handler/src/resources/card-type-resource.ts`. Delete the eight private methods listed above. Update `update()` so the `workflow` and `customFields` branches no longer call `handleWorkflowChange`, `removeValueFromOtherArrays` or `handleCustomFieldsChange`:

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
  const content = structuredClone(this.content);
  if (key === 'alwaysVisibleFields') {
    await this.validateFieldType(key, op);
    content.alwaysVisibleFields = super.handleArray(
      op,
      key,
      content.alwaysVisibleFields as Type[],
    ) as string[];
  } else if (key === 'optionallyVisibleFields') {
    await this.validateFieldType(key, op);
    content.optionallyVisibleFields = super.handleArray(
      op,
      key,
      content.optionallyVisibleFields as Type[],
    ) as string[];
  } else if (key === 'workflow') {
    content.workflow = super.handleScalar(op) as string;
    // Cascade lives in CardTypeWorkflowChangeHandler.
  } else if (key === 'customFields') {
    await this.validateFieldType(key, op);
    content.customFields = super.handleArray(
      op,
      key,
      content.customFields as Type[],
    ) as CustomField[];
    // Cascade lives in CardTypeAddCustomFieldHandler /
    // CardTypeRemoveCustomFieldHandler.
  } else {
    throw new Error(`Unknown property '${key}' for CardType`);
  }
  await super.postUpdate(content, updateKey, op);
}
```

Remove the now-unused imports (`AddOperation`, `RemoveOperation`, `ChangeOperation` may still be needed elsewhere; check). Run the type-checker after the edit and clean up any leftover imports flagged.

- [ ] **Step 2: Run the full data-handler suite**

```bash
cd tools/data-handler && pnpm build
cd tools/data-handler && pnpm test
```

Expected: all PASS. Existing tests for `update.updateValue(name, 'change', 'workflow', ...)` and `update.updateValue(name, 'remove', 'customFields', ...)` still pass because the routing in `commands/update.ts` (Task 11) sends them through the handlers, which produce the same observable end-state. If a test that bypassed `Update` and called `cardType.update(...)` directly now fails, it was asserting the cascade — port that assertion to the corresponding handler test.

- [ ] **Step 3: Commit**

```bash
git add tools/data-handler/src/resources/card-type-resource.ts
git commit -m "refactor: drop cascade methods from CardTypeResource

The card metadata, link-type and workflow-state cascades now live in
mutations/handlers/card-type-*.ts. The resource class keeps the resource-
definition update path (handleArray/handleScalar + postUpdate) and the
non-cascade methods (createCardType, usage, hasFieldType, validateFieldType,
fieldTypeExists, cardsWithCardType, relevantLinkTypes, setContainerValues,
onNameChange minus updateLinkTypes)."
```

---

### Task 13: End-to-end integration test

**Files:**

- Create: `tools/data-handler/test/mutations/integration-card-type.test.ts`

A single test that proves the full plan/apply roundtrip for a destructive CardType delete: a populated card type is deleted, every card of that type disappears, every link-type cleans up, and one `resource_delete` entry lands in the migration log.

- [ ] **Step 1: Write the test**

```typescript
// tools/data-handler/test/mutations/integration-card-type.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { copyDir } from '../../src/utils/file-utils.js';
import type { Project } from '../../src/containers/project.js';
import { getTestProject } from '../helpers/test-utils.js';
import { ResourceMutations } from '../../src/mutations/plan.js';
import { ConfigurationLogger } from '../../src/utils/configuration-logger.js';
import { resourceName } from '../../src/utils/resource-utils.js';

const baseDir = import.meta.dirname;
const testDir = join(baseDir, 'tmp-card-type-integration');
const decisionRecordsPath = join(testDir, 'valid/decision-records');
let project: Project;

describe('CardType mutation engine end-to-end', () => {
  beforeEach(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir(join(baseDir, '..', 'test-data'), testDir);
    project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
  });
  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('plan → apply → log entry for a CardType delete with cards', async () => {
    const mutations = new ResourceMutations(project);
    const target = resourceName(`${project.projectPrefix}/cardTypes/decision`);
    const input = { kind: 'delete' as const, target };

    const plan = await mutations.plan(input);
    expect(plan.isBreaking).toBe(true);
    expect(plan.preview.affectedCardCount).toBeGreaterThan(0);
    expect(plan.preview.dataLossExpected).toBe(true);

    await mutations.apply(input, { fingerprint: plan.fingerprint });

    await project.populateCaches();
    expect(project.resources.exists(`${project.projectPrefix}/cardTypes/decision`)).toBe(false);
    const remaining = project.cards(undefined).filter(
      (c) => c.metadata?.cardType === `${project.projectPrefix}/cardTypes/decision`,
    );
    expect(remaining).toHaveLength(0);

    const entries = await ConfigurationLogger.entries(project.basePath);
    expect(
      entries.some(
        (e) =>
          e.kind === 'resource_delete' &&
          e.target === `${project.projectPrefix}/cardTypes/decision`,
      ),
    ).toBe(true);
  });

  it('plan → apply → log entry for a CardType rename', async () => {
    const mutations = new ResourceMutations(project);
    const target = resourceName(`${project.projectPrefix}/cardTypes/decision`);
    const input = {
      kind: 'rename' as const,
      target,
      newIdentifier: 'choice',
    };

    const plan = await mutations.plan(input);
    await mutations.apply(input, { fingerprint: plan.fingerprint });

    const entries = await ConfigurationLogger.entries(project.basePath);
    expect(
      entries.some(
        (e) =>
          e.kind === 'resource_rename' &&
          e.target === `${project.projectPrefix}/cardTypes/decision`,
      ),
    ).toBe(true);
  });

  it('display-only changes fall through to DefaultNoCascadeHandler (no log entry)', async () => {
    const mutations = new ResourceMutations(project);
    const input = {
      kind: 'edit' as const,
      target: resourceName(`${project.projectPrefix}/cardTypes/decision`),
      updateKey: { key: 'displayName' },
      operation: { name: 'change' as const, target: 'Decision', to: 'Choice' },
    };
    const plan = await mutations.plan(input);
    expect(plan.isBreaking).toBe(false);
    await mutations.apply(input);

    const entries = await ConfigurationLogger.entries(project.basePath);
    expect(entries).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the integration test**

```bash
cd tools/data-handler && pnpm test test/mutations/integration-card-type.test.ts
```

Expected: all PASS.

- [ ] **Step 3: Run the full data-handler suite as a final check**

```bash
cd tools/data-handler && pnpm test
cd tools/data-handler && pnpm build
cd tools/data-handler && pnpm lint
```

Expected: PASS, PASS, PASS.

- [ ] **Step 4: Run the whole repo**

```bash
pnpm test
pnpm build
pnpm lint
```

Expected: PASS, PASS, PASS. If `tools/cli`, `tools/backend`, `tools/app` or `tools/mcp` reference any of the deleted private methods, fix the callers (none expected; the deleted methods were private).

- [ ] **Step 5: Commit**

```bash
git add tools/data-handler/test/mutations/integration-card-type.test.ts
git commit -m "test: end-to-end plan/apply integration for CardType cascades"
```

---

## Self-review

Before declaring the plan complete, verify the following:

- [ ] `pnpm --filter @cyberismo/data-handler test` is green.
- [ ] `pnpm --filter @cyberismo/data-handler build` is green.
- [ ] `pnpm --filter @cyberismo/data-handler lint` is green.
- [ ] `pnpm test` at repo root is green.
- [ ] The five new handler files exist and each implements `matches`, `isBreaking`, `preview`, `apply`, `affectedFilePaths`.
- [ ] The five new handlers are registered in `mutations/dispatcher.ts` ahead of `DefaultNoCascadeHandler`.
- [ ] `commands/update.ts` routes CardType `customFields` (add/remove), `workflow` (change) and `name` (change) through `ResourceMutations`.
- [ ] `commands/remove.ts` routes `type === 'cardType'` through `ResourceMutations`.
- [ ] `commands/rename.ts`'s top-level cardType branch routes through `ResourceMutations`; the project-rename loop does not.
- [ ] `card-type-resource.ts` no longer contains `handleCustomFieldsChange`, `handleAddNewField`, `handleRemoveField`, `handleWorkflowChange`, `removeValueFromOtherArrays`, `updateLinkTypes`, the private `updateCardMetadata` helper, or `verifyStateMapping`. `grep -n "handleCustomFieldsChange\|handleAddNewField\|handleRemoveField\|handleWorkflowChange\|removeValueFromOtherArrays\|updateLinkTypes\|verifyStateMapping" tools/data-handler/src/resources/card-type-resource.ts` returns nothing.
- [ ] The display-only edits (`displayName`, `description`, `category`, and the visibility lists when classified non-breaking) still flow through `DefaultNoCascadeHandler` — the integration test's third `it` asserts this.
- [ ] The migration log gains exactly one entry per breaking edit and zero entries per non-breaking edit. The integration test asserts this for delete, rename and a display-only edit.
- [ ] Stale-fingerprint detection still works for CardType cascades — the same drift check the foundation plan added in `ResourceMutations.apply` runs for every handler that reports a non-empty `affectedFilePaths`. No extra plumbing was needed; if it works for `LinkTypeRenameHandler`, it works for these.

If any check fails, fix the underlying issue and re-run the relevant verification commands before claiming completion.

---

## What this plan delivers

After all tasks succeed:

- Five new cascade handlers cover every breaking CardType row in `migrations-plan.adoc` (rename, workflow change, custom-field add, custom-field remove, delete).
- Display-only CardType edits (`displayName`, `description`, `category`, visibility lists) intentionally fall through to `DefaultNoCascadeHandler` and produce no log entry — matching the spec.
- `CardTypeResource` loses ~250 lines of cascade logic; the resource class keeps only the resource-definition update mechanics and read paths.
- `commands/update.ts`, `commands/remove.ts` and the top-level cardType branch of `commands/rename.ts` route through `ResourceMutations`, producing the right `MigrationEntry` shape for each verb.
- An integration test proves plan → apply → log roundtrip for the destructive case (delete-with-cards) and for the non-destructive case (display-only edit produces zero log entries).

## What's next

Follow-on plans continue to chip away at `migrations-plan.adoc`:

- **Workflow handlers** — state add/remove/rename, transitions; `updateCardStates`, `updateCardTypes` move out of `WorkflowResource`.
- **FieldType handlers** — `dataTypeChanged`, `handleEnumValueReplacements`, enum-value add/remove/rename, field-type delete; the largest cascade family.
- **Remaining delete handlers** — Template, Calculation, Report, GraphModel, GraphView.
- **ProjectRename handler** — wraps the existing `commands/rename.ts:rename(to)` body and adds `project_rename` to the `MigrationEntryKind` union.
- **Module update flow** — `PreviewModuleUpdate`, `UpdateModule`, replay engine, `appliedModules.json`, conflict detection.
- **HTTP routes and CLI verbs** — `POST /mutations/preview`, `POST /mutations/apply`, SSE for module updates; `cyberismo delete`, `cyberismo rename`, `cyberismo project-rename`, `cyberismo module update`.

Each plan reuses the engine and dispatcher; they add handlers and routes through them.
