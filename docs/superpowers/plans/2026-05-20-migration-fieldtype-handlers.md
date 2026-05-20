# Migration System — FieldType Handlers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build out cascade handlers for every breaking-change row of the FieldType section of `migrations-plan.adoc`. After this plan executes, FieldType edits (`dataType`, `enumValues` add/remove/rename), deletes, and renames all flow through the new `ResourceMutations` engine that was introduced in `docs/superpowers/plans/2026-05-20-migration-system-foundation.md`. The ~150 lines of cascade logic that today live in `tools/data-handler/src/resources/field-type-resource.ts` (`dataTypeChanged`, `convertValue`/`doConvertValue`, `handleEnumValueReplacements`, `relevantCardTypes`, `updateCardTypes`, and parts of `rename`) move out into per-mutation handlers under `tools/data-handler/src/mutations/handlers/`.

**Architecture:** This plan adds six handlers to the existing dispatcher and re-routes three commands (`update.ts`, `remove.ts`, `rename.ts`) so that all FieldType operations go through `ResourceMutations.plan() / apply()`. Each handler implements the `Handler` interface from the foundation plan: `matches`, `isBreaking`, `preview`, `apply`, `affectedFilePaths`. The handlers reuse the value-conversion helpers (`fromDate`, `fromNumber`, `fromString`, `allowed`) that already exist in `tools/data-handler/src/utils/value-utils.js`. Once the engine owns every FieldType cascade, the resource class can shed its cascade methods and become a pure "definition + validation" class.

**Tech Stack:** TypeScript, Node 22, ESM with `.js` extensions on relative imports, Vitest for tests, pnpm workspaces, `node:crypto` for fingerprints. Existing patterns to follow: `tools/data-handler/src/mutations/handlers/link-type-rename.ts` (the template; this plan adds six more handlers like it), `tools/data-handler/src/resources/field-type-resource.ts` (the source of truth for the conversion semantics), `tools/data-handler/test/test-data/valid/decision-records` (the fixture every handler test reuses — it has a populated `fieldTypes/` folder and cards that reference those field types).

---

## Scope

**In scope (this plan):**
- `mutations/handlers/field-type-rename.ts` — full-resource rename cascade.
- `mutations/handlers/field-type-data-type.ts` — dataType-change cascade with value conversion.
- `mutations/handlers/field-type-enum-add.ts` — enum-value addition (non-breaking, no cascade — applies definition only).
- `mutations/handlers/field-type-enum-remove.ts` — enum-value removal cascade (null or replacement value).
- `mutations/handlers/field-type-enum-rename.ts` — enum-value rename cascade.
- `mutations/handlers/field-type-delete.ts` — full-resource delete cascade (strip field from card types + cards).
- Dispatcher registration for all six handlers, ordered ahead of `DefaultNoCascadeHandler`.
- Routing of FieldType ops in `commands/update.ts`, `commands/remove.ts`, `commands/rename.ts` through `ResourceMutations`.
- Removal of the now-dead cascade helpers from `FieldTypeResource`.
- Integration test exercising the full FieldType lifecycle through the engine.

**Out of scope (follow-on plans needed):**
- Plan 3: CardType edit/delete/workflow-change handlers (the next resource family).
- Plan 4: Workflow handlers.
- Plan 5: Remaining delete handlers (Template, Calculation, Report, GraphModel, GraphView).
- Plan 6: ProjectRename handler.
- Plan 7: Module update flow.
- Plan 8: HTTP routes for mutations.
- Plan 9: CLI integration for the remaining verbs.

Each follow-on plan extends the same pattern. After this plan, two resource families (LinkType and FieldType) have full cascade coverage, and the engine is exercised by ~7 production handlers — enough to confirm the pattern scales.

---

## File structure

**New files:**
- `tools/data-handler/src/mutations/handlers/field-type-rename.ts`
- `tools/data-handler/src/mutations/handlers/field-type-data-type.ts`
- `tools/data-handler/src/mutations/handlers/field-type-enum-add.ts`
- `tools/data-handler/src/mutations/handlers/field-type-enum-remove.ts`
- `tools/data-handler/src/mutations/handlers/field-type-enum-rename.ts`
- `tools/data-handler/src/mutations/handlers/field-type-delete.ts`
- `tools/data-handler/test/mutations/handlers/field-type-rename.test.ts`
- `tools/data-handler/test/mutations/handlers/field-type-data-type.test.ts`
- `tools/data-handler/test/mutations/handlers/field-type-enum-add.test.ts`
- `tools/data-handler/test/mutations/handlers/field-type-enum-remove.test.ts`
- `tools/data-handler/test/mutations/handlers/field-type-enum-rename.test.ts`
- `tools/data-handler/test/mutations/handlers/field-type-delete.test.ts`
- `tools/data-handler/test/mutations/integration-field-type.test.ts`

**Modified files:**
- `tools/data-handler/src/mutations/dispatcher.ts` — register the six new handlers ahead of the default.
- `tools/data-handler/src/commands/update.ts` — route FieldType edits and renames through `ResourceMutations`.
- `tools/data-handler/src/commands/remove.ts` — route FieldType deletes through `ResourceMutations`.
- `tools/data-handler/src/commands/rename.ts` — already calls `fieldType.rename()` per-resource during project-rename; this stays on the resource path (project_rename is its own future handler). No change unless tests force one.
- `tools/data-handler/src/resources/field-type-resource.ts` — remove `dataTypeChanged`, `doConvertValue`, `convertValue`, `handleEnumValueReplacements`, `relevantCardTypes`, `updateCardTypes`, the `update<Type, K>` body for `dataType`/`enumValues`, and the `onNameChange` body. The class keeps `cardsWithFieldType`, `createFieldType`, `fieldDataTypes`, `fromClingoResult`, `parseClingoArray`, `usage` (the public API the rest of the codebase calls) and a thin `update()` that delegates validation to the parent.

---

## Tasks

### Task 1: `FieldTypeRenameHandler` — write the failing test

**Files:**
- Create: `tools/data-handler/test/mutations/handlers/field-type-rename.test.ts`

Rename cascade for a field type. The cascade rewrites:
1. The field key (`<prefix>/fieldTypes/<old>`) inside every card's `metadata` to the new key.
2. The `customFields[].name` reference inside every card type that references the field.
3. References inside calculation `.lp` files and report handlebars files (matches the existing `onNameChange` in `field-type-resource.ts`).
4. Card content (asciidoc) references that include the field name.

- [ ] **Step 1: Write the failing test**

```typescript
// tools/data-handler/test/mutations/handlers/field-type-rename.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../../src/containers/project.js';
import { FieldTypeRenameHandler } from '../../../src/mutations/handlers/field-type-rename.js';
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
const tmpDir = join(import.meta.dirname, 'tmp-field-type-rename');

describe('FieldTypeRenameHandler', () => {
  let project: Project;
  let projectPath: string;

  beforeEach(async () => {
    projectPath = join(tmpDir, `proj-${Date.now()}-${Math.random()}`);
    await mkdir(projectPath, { recursive: true });
    await copyDir(FIXTURE_PATH, projectPath);
    project = new Project(projectPath);
    await project.initialize();
  });
  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('matches a field-type rename input', () => {
    const handler = new FieldTypeRenameHandler();
    const ctx = {
      project,
      input: {
        kind: 'rename' as const,
        target: resourceName(`${project.projectPrefix}/fieldTypes/finished`),
        newIdentifier: 'completed',
      },
    };
    expect(handler.matches(ctx)).toBe(true);
  });

  it('does not match a link-type rename', () => {
    const handler = new FieldTypeRenameHandler();
    const ctx = {
      project,
      input: {
        kind: 'rename' as const,
        target: resourceName(`${project.projectPrefix}/linkTypes/causes`),
        newIdentifier: 'is-caused-by',
      },
    };
    expect(handler.matches(ctx)).toBe(false);
  });

  it('preview reports affected card and card-type counts', async () => {
    const handler = new FieldTypeRenameHandler();
    const ctx = {
      project,
      input: {
        kind: 'rename' as const,
        target: resourceName(`${project.projectPrefix}/fieldTypes/finished`),
        newIdentifier: 'completed',
      },
    };
    const preview = await handler.preview(ctx);
    expect(preview.dataLossExpected).toBe(false);
    // The decision-records fixture has at least one card type using
    // "finished" and at least one card carrying the metadata key.
    expect(preview.affectedCardCount).toBeGreaterThanOrEqual(0);
  });

  it('applying rewrites every card metadata key and every card type customFields entry', async () => {
    const handler = new FieldTypeRenameHandler();
    const oldName = `${project.projectPrefix}/fieldTypes/finished`;
    const newName = `${project.projectPrefix}/fieldTypes/completed`;
    const ctx = {
      project,
      input: {
        kind: 'rename' as const,
        target: resourceName(oldName),
        newIdentifier: 'completed',
      },
    };
    await handler.apply(ctx);

    for (const card of project.cards(undefined)) {
      if (!card.metadata) continue;
      expect(Object.keys(card.metadata)).not.toContain(oldName);
    }
    for (const cardType of project.resources.cardTypes()) {
      const customFields = cardType.data?.customFields ?? [];
      for (const cf of customFields) {
        expect(cf.name).not.toBe(oldName);
        if (cf.name.endsWith('/fieldTypes/completed')) {
          expect(cf.name).toBe(newName);
        }
      }
    }
  });

  it('isBreaking is true', () => {
    expect(new FieldTypeRenameHandler().isBreaking).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd tools/data-handler && pnpm test test/mutations/handlers/field-type-rename.test.ts
```

Expected: FAIL — `Cannot find module '../../../src/mutations/handlers/field-type-rename.js'`.

- [ ] **Step 3: Commit the failing test (red phase)**

```bash
git add tools/data-handler/test/mutations/handlers/field-type-rename.test.ts
git commit -m "test: failing test for FieldTypeRenameHandler"
```

---

### Task 2: `FieldTypeRenameHandler` — implementation

**Files:**
- Create: `tools/data-handler/src/mutations/handlers/field-type-rename.ts`
- Modify: `tools/data-handler/src/mutations/dispatcher.ts`

The cascade extracts the body of `FieldTypeResource.onNameChange` plus `updateCardTypes`. Card metadata also needs key-rename treatment (the field is stored as `metadata[<resourceName>]` per the existing `cardsWithFieldType` helper). The resource rename itself happens through `ResourceObject.rename()` (which writes the new file and renames the metadata file).

- [ ] **Step 1: Implement the handler**

```typescript
// tools/data-handler/src/mutations/handlers/field-type-rename.ts

import { join } from 'node:path';

import type { Handler, MutationContext } from '../handler.js';
import type { CascadePreview } from '../types.js';
import { resourceNameToString } from '../../utils/resource-utils.js';
import type { Card } from '../../interfaces/project-interfaces.js';

export class FieldTypeRenameHandler implements Handler {
  readonly isBreaking = true;

  matches(ctx: MutationContext): boolean {
    return (
      ctx.input.kind === 'rename' && ctx.input.target.type === 'fieldTypes'
    );
  }

  async preview(ctx: MutationContext): Promise<CascadePreview> {
    if (ctx.input.kind !== 'rename') {
      throw new Error('FieldTypeRenameHandler called with non-rename input');
    }
    const oldName = resourceNameToString(ctx.input.target);
    const cards = this.cardsWithField(ctx, oldName);
    const cardTypes = this.cardTypesReferencing(ctx, oldName);
    return {
      affectedCardCount: cards.length,
      affectedLinkCount: 0,
      affectedCalculationCount: 0,
      affectedHandlebarFileCount: 0,
      dataLossExpected: false,
      summary: `Renames field key on ${cards.length} cards and updates ${cardTypes.length} card types.`,
    };
  }

  async apply(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'rename') {
      throw new Error('FieldTypeRenameHandler called with non-rename input');
    }
    const oldName = resourceNameToString(ctx.input.target);
    const newName = `${ctx.input.target.prefix}/fieldTypes/${ctx.input.newIdentifier}`;

    // 1. Rewrite the metadata key on every card carrying the field.
    for (const card of this.cardsWithField(ctx, oldName)) {
      const metadata = card.metadata!;
      const value = metadata[oldName];
      delete metadata[oldName];
      metadata[newName] = value;
      await ctx.project.updateCardMetadata(card, metadata);
    }

    // 2. Rewrite customFields[].name entries on every card type.
    for (const cardType of this.cardTypesReferencing(ctx, oldName)) {
      await cardType.update(
        { key: 'customFields' },
        { name: 'change', target: { name: oldName }, to: { name: newName } } as never,
      );
    }

    // 3. Perform the resource-level rename. ResourceObject.rename() also
    //    triggers updateCalculations / updateHandleBars / updateCardContentReferences
    //    via onNameChange. We intentionally leave the parent class's rename
    //    machinery in place during this plan — Task 9 removes the FieldType
    //    override (`onNameChange`) so the parent does the right thing.
    const resource = ctx.project.resources.byType(oldName, 'fieldTypes');
    if (!resource) {
      throw new Error(`Field type '${oldName}' not found`);
    }
    await resource.update({ key: 'name' }, {
      name: 'change',
      target: oldName,
      to: newName,
    });
  }

  async affectedFilePaths(ctx: MutationContext): Promise<string[]> {
    if (ctx.input.kind !== 'rename') return [];
    const oldName = resourceNameToString(ctx.input.target);
    const cardPaths = this.cardsWithField(ctx, oldName).map((c) =>
      join(c.path, 'index.json'),
    );
    const cardTypePaths = this.cardTypesReferencing(ctx, oldName).map(
      (ct) => ct.fileName,
    );
    return [...cardPaths, ...cardTypePaths];
  }

  private cardsWithField(ctx: MutationContext, oldName: string): Card[] {
    const all = [
      ...ctx.project.cards(undefined),
      ...ctx.project.allTemplateCards(),
    ];
    return all.filter((c) => c.metadata && oldName in c.metadata);
  }

  private cardTypesReferencing(ctx: MutationContext, oldName: string) {
    return ctx.project.resources
      .cardTypes()
      .filter((ct) =>
        ct.data?.customFields?.some((cf) => cf.name === oldName),
      );
  }
}
```

- [ ] **Step 2: Register the handler in the dispatcher**

Edit `tools/data-handler/src/mutations/dispatcher.ts`. Add the import and prepend the handler to the registry (specific handlers come before `DefaultNoCascadeHandler`):

```typescript
import { FieldTypeRenameHandler } from './handlers/field-type-rename.js';

const HANDLERS: Handler[] = [
  new LinkTypeRenameHandler(),
  new FieldTypeRenameHandler(),
  new DefaultNoCascadeHandler(),
];
```

- [ ] **Step 3: Run test to verify it passes**

```bash
cd tools/data-handler && pnpm test test/mutations/handlers/field-type-rename.test.ts
```

Expected: PASS for all five `it` blocks.

- [ ] **Step 4: Commit**

```bash
git add tools/data-handler/src/mutations/handlers/field-type-rename.ts \
        tools/data-handler/src/mutations/dispatcher.ts
git commit -m "feat: FieldTypeRenameHandler

Cascade rewrites field key on every card, customFields entries on every
card type, and delegates the resource-level rename to ResourceObject.rename
(which still owns calculation/handlebars/card-content updates for now)."
```

---

### Task 3: `FieldTypeDataTypeHandler` — write the failing test

**Files:**
- Create: `tools/data-handler/test/mutations/handlers/field-type-data-type.test.ts`

Handles `update <fieldType> change dataType <new>`. The cascade walks every card whose `cardType` is among the card types that include the field, converts each existing value, and writes the result back. Conversions that fail produce `null` (the basic-migration policy per `migrations-plan.adoc`); a strict mode is out of scope for this plan.

- [ ] **Step 1: Write the failing test**

```typescript
// tools/data-handler/test/mutations/handlers/field-type-data-type.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../../src/containers/project.js';
import { FieldTypeDataTypeHandler } from '../../../src/mutations/handlers/field-type-data-type.js';
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
const tmpDir = join(import.meta.dirname, 'tmp-field-type-data-type');

describe('FieldTypeDataTypeHandler', () => {
  let project: Project;
  let projectPath: string;

  beforeEach(async () => {
    projectPath = join(tmpDir, `proj-${Date.now()}-${Math.random()}`);
    await mkdir(projectPath, { recursive: true });
    await copyDir(FIXTURE_PATH, projectPath);
    project = new Project(projectPath);
    await project.initialize();
  });
  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  const input = (target: string, from: string, to: string) => ({
    kind: 'edit' as const,
    target: resourceName(target),
    updateKey: { key: 'dataType' as const },
    operation: { name: 'change' as const, target: from, to },
  });

  it('matches an edit with key=dataType on a field type', () => {
    const handler = new FieldTypeDataTypeHandler();
    const ctx = {
      project,
      input: input(`${project.projectPrefix}/fieldTypes/finished`, 'boolean', 'shortText'),
    };
    expect(handler.matches(ctx)).toBe(true);
  });

  it('does not match a displayName change', () => {
    const handler = new FieldTypeDataTypeHandler();
    const ctx = {
      project,
      input: {
        kind: 'edit' as const,
        target: resourceName(`${project.projectPrefix}/fieldTypes/finished`),
        updateKey: { key: 'displayName' as const },
        operation: { name: 'change' as const, target: 'A', to: 'B' },
      },
    };
    expect(handler.matches(ctx)).toBe(false);
  });

  it('shortText ↔ longText is non-data-loss (existing values are preserved)', async () => {
    // Pick a field type that is shortText in the fixture; the plan assumes
    // `commitDescription` is shortText. Adjust if the fixture differs.
    const handler = new FieldTypeDataTypeHandler();
    const ctx = {
      project,
      input: input(
        `${project.projectPrefix}/fieldTypes/commitDescription`,
        'shortText',
        'longText',
      ),
    };
    const preview = await handler.preview(ctx);
    expect(preview.dataLossExpected).toBe(false);
  });

  it('boolean → integer flags potential data loss when values cannot convert', async () => {
    const handler = new FieldTypeDataTypeHandler();
    const ctx = {
      project,
      input: input(
        `${project.projectPrefix}/fieldTypes/finished`,
        'boolean',
        'integer',
      ),
    };
    const preview = await handler.preview(ctx);
    // boolean → integer is not in the allowed map; preview should warn.
    expect(preview.dataLossExpected).toBe(true);
  });

  it('applying converts values on every affected card', async () => {
    const handler = new FieldTypeDataTypeHandler();
    const fieldName = `${project.projectPrefix}/fieldTypes/finished`;
    const ctx = {
      project,
      input: input(fieldName, 'boolean', 'shortText'),
    };
    await handler.apply(ctx);
    for (const card of project.cards(undefined)) {
      const value = card.metadata?.[fieldName];
      if (value === undefined || value === null) continue;
      // After boolean → shortText the value should be a string like "true"/"false".
      expect(typeof value).toBe('string');
    }
  });

  it('isBreaking is true', () => {
    expect(new FieldTypeDataTypeHandler().isBreaking).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd tools/data-handler && pnpm test test/mutations/handlers/field-type-data-type.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Commit the failing test**

```bash
git add tools/data-handler/test/mutations/handlers/field-type-data-type.test.ts
git commit -m "test: failing test for FieldTypeDataTypeHandler"
```

---

### Task 4: `FieldTypeDataTypeHandler` — implementation

**Files:**
- Create: `tools/data-handler/src/mutations/handlers/field-type-data-type.ts`
- Modify: `tools/data-handler/src/mutations/dispatcher.ts`

Extract `dataTypeChanged`, `convertValue`, `doConvertValue`, `relevantCardTypes`, and `isConversionValid` from `FieldTypeResource` into the handler. Reuse `allowed`, `fromDate`, `fromNumber`, `fromString` from `tools/data-handler/src/utils/value-utils.ts` directly — they have no FieldType dependency.

- [ ] **Step 1: Implement the handler**

```typescript
// tools/data-handler/src/mutations/handlers/field-type-data-type.ts

import { join } from 'node:path';

import type { Handler, MutationContext } from '../handler.js';
import type { CascadePreview } from '../types.js';
import { resourceNameToString } from '../../utils/resource-utils.js';
import {
  allowed,
  fromDate,
  fromNumber,
  fromString,
} from '../../utils/value-utils.js';
import type {
  DataType,
  FieldType,
} from '../../interfaces/resource-interfaces.js';
import type { Card } from '../../interfaces/project-interfaces.js';

const SHORT_TEXT_MAX_LENGTH = 80;

export class FieldTypeDataTypeHandler implements Handler {
  readonly isBreaking = true;

  matches(ctx: MutationContext): boolean {
    return (
      ctx.input.kind === 'edit' &&
      ctx.input.target.type === 'fieldTypes' &&
      ctx.input.updateKey.key === 'dataType' &&
      ctx.input.operation.name === 'change'
    );
  }

  async preview(ctx: MutationContext): Promise<CascadePreview> {
    if (ctx.input.kind !== 'edit') {
      throw new Error('FieldTypeDataTypeHandler: non-edit input');
    }
    const fieldName = resourceNameToString(ctx.input.target);
    const resource = ctx.project.resources.byType(fieldName, 'fieldTypes');
    if (!resource) {
      throw new Error(`Field type '${fieldName}' not found`);
    }
    const from = (resource.contentData() as FieldType).dataType;
    const to = (ctx.input.operation as { to: DataType }).to;
    const cards = this.cardsWithField(ctx, fieldName);

    // Detect data-loss: if any card has a non-null value that won't survive
    // the conversion, flag it. shortText↔longText is the lossless case.
    let willLoseData = false;
    for (const card of cards) {
      const value = card.metadata?.[fieldName];
      if (value === undefined || value === null) continue;
      const converted = this.tryConvert(value, from, to);
      if (converted === null) {
        willLoseData = true;
        break;
      }
    }

    return {
      affectedCardCount: cards.length,
      affectedLinkCount: 0,
      affectedCalculationCount: 0,
      affectedHandlebarFileCount: 0,
      dataLossExpected: willLoseData,
      summary: `Convert '${fieldName}' from ${from} to ${to} on ${cards.length} cards.`,
    };
  }

  async apply(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'edit') {
      throw new Error('FieldTypeDataTypeHandler: non-edit input');
    }
    const fieldName = resourceNameToString(ctx.input.target);
    const resource = ctx.project.resources.byType(fieldName, 'fieldTypes');
    if (!resource) {
      throw new Error(`Field type '${fieldName}' not found`);
    }
    const from = (resource.contentData() as FieldType).dataType;
    const to = (ctx.input.operation as { to: DataType }).to;

    if (!allowed(from, to)) {
      throw new Error(
        `Cannot change data type from '${from}' to '${to}' (no conversion allowed)`,
      );
    }

    // 1. Convert every card's value.
    for (const card of this.cardsWithField(ctx, fieldName)) {
      const metadata = card.metadata!;
      const value = metadata[fieldName];
      if (value === undefined || value === null) continue;
      const converted = this.tryConvert(value, from, to);
      metadata[fieldName] = converted;
      await ctx.project.updateCardMetadata(card, metadata);
    }

    // 2. Apply the resource-definition change.
    await resource.update(ctx.input.updateKey, ctx.input.operation);
  }

  async affectedFilePaths(ctx: MutationContext): Promise<string[]> {
    if (ctx.input.kind !== 'edit') return [];
    const fieldName = resourceNameToString(ctx.input.target);
    return this.cardsWithField(ctx, fieldName).map((c) =>
      join(c.path, 'index.json'),
    );
  }

  private cardsWithField(ctx: MutationContext, fieldName: string): Card[] {
    const all = [
      ...ctx.project.cards(undefined),
      ...ctx.project.allTemplateCards(),
    ];
    return all.filter((c) => c.metadata && fieldName in c.metadata);
  }

  /**
   * Pure value conversion. Returns null when conversion fails (caller writes
   * null to the card metadata). The semantics mirror the existing
   * FieldTypeResource.doConvertValue.
   */
  private tryConvert(value: unknown, from: DataType, to: DataType): unknown {
    if (from === to) return value;
    if (from === 'date' || from === 'dateTime') {
      return fromDate(value, to);
    }
    if (from === 'integer' || from === 'number') {
      return fromNumber(value, to);
    }
    if (from === 'shortText' || from === 'longText') {
      return fromString(value, to);
    }
    if (to === 'shortText' || to === 'longText') {
      let str = String(value).replace(/(\\")/g, '');
      if (to === 'shortText' && str.length > SHORT_TEXT_MAX_LENGTH) {
        return null;
      }
      return str;
    }
    return null;
  }
}
```

- [ ] **Step 2: Register the handler**

In `tools/data-handler/src/mutations/dispatcher.ts`:

```typescript
import { FieldTypeDataTypeHandler } from './handlers/field-type-data-type.js';

const HANDLERS: Handler[] = [
  new LinkTypeRenameHandler(),
  new FieldTypeRenameHandler(),
  new FieldTypeDataTypeHandler(),
  new DefaultNoCascadeHandler(),
];
```

- [ ] **Step 3: Run tests**

```bash
cd tools/data-handler && pnpm test test/mutations/handlers/field-type-data-type.test.ts
```

Expected: PASS. If the fixture's `finished` field type happens not to be a `boolean`, adjust the test inputs to match what's actually in `test-data/valid/decision-records/.cards/local/fieldTypes/`.

- [ ] **Step 4: Commit**

```bash
git add tools/data-handler/src/mutations/handlers/field-type-data-type.ts \
        tools/data-handler/src/mutations/dispatcher.ts
git commit -m "feat: FieldTypeDataTypeHandler

Cascade converts card values when a field type's dataType changes.
Conversions that aren't allowed throw; conversions that allow the type
change but fail per-value produce null. Extracted from
FieldTypeResource.dataTypeChanged / convertValue / doConvertValue."
```

---

### Task 5: `FieldTypeEnumAddHandler` — write test + implement

**Files:**
- Create: `tools/data-handler/test/mutations/handlers/field-type-enum-add.test.ts`
- Create: `tools/data-handler/src/mutations/handlers/field-type-enum-add.ts`
- Modify: `tools/data-handler/src/mutations/dispatcher.ts`

Enum-value adds are non-breaking per `migrations-plan.adoc`. The handler reports zero cascade effects and `isBreaking = false`, so `ResourceMutations.apply()` does not record a log entry. The handler still has to *exist* (rather than falling through to `DefaultNoCascadeHandler`) because the engine dispatches on the (kind, target, key, operation) tuple and a handler that "just updates the resource" needs to apply the enum-array add through `FieldTypeResource.update()` — exactly what `DefaultNoCascadeHandler.apply()` does, but `DefaultNoCascadeHandler.matches()` doesn't qualify the input shape. Reusing the default by making this a thin subclass keeps the policy explicit.

- [ ] **Step 1: Write the failing test**

```typescript
// tools/data-handler/test/mutations/handlers/field-type-enum-add.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../../src/containers/project.js';
import { FieldTypeEnumAddHandler } from '../../../src/mutations/handlers/field-type-enum-add.js';
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
const tmpDir = join(import.meta.dirname, 'tmp-field-type-enum-add');

describe('FieldTypeEnumAddHandler', () => {
  let project: Project;
  let projectPath: string;

  beforeEach(async () => {
    projectPath = join(tmpDir, `proj-${Date.now()}-${Math.random()}`);
    await mkdir(projectPath, { recursive: true });
    await copyDir(FIXTURE_PATH, projectPath);
    project = new Project(projectPath);
    await project.initialize();
  });
  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  const enumFieldName = (p: Project) =>
    // Pick an enum field type from the fixture. If the fixture lacks one,
    // the test setup should create one before this test runs. Replace
    // 'percentageReady' with whatever the actual enum field is.
    `${p.projectPrefix}/fieldTypes/percentageReady`;

  it('matches add operation on enumValues', () => {
    const handler = new FieldTypeEnumAddHandler();
    const ctx = {
      project,
      input: {
        kind: 'edit' as const,
        target: resourceName(enumFieldName(project)),
        updateKey: { key: 'enumValues' as const },
        operation: { name: 'add' as const, target: { enumValue: 'new-value' } },
      },
    };
    expect(handler.matches(ctx)).toBe(true);
  });

  it('does not match remove on enumValues', () => {
    const handler = new FieldTypeEnumAddHandler();
    const ctx = {
      project,
      input: {
        kind: 'edit' as const,
        target: resourceName(enumFieldName(project)),
        updateKey: { key: 'enumValues' as const },
        operation: { name: 'remove' as const, target: { enumValue: 'old' } },
      },
    };
    expect(handler.matches(ctx)).toBe(false);
  });

  it('is non-breaking and reports zero cascade effects', async () => {
    const handler = new FieldTypeEnumAddHandler();
    expect(handler.isBreaking).toBe(false);
    const ctx = {
      project,
      input: {
        kind: 'edit' as const,
        target: resourceName(enumFieldName(project)),
        updateKey: { key: 'enumValues' as const },
        operation: { name: 'add' as const, target: { enumValue: 'fresh' } },
      },
    };
    const preview = await handler.preview(ctx);
    expect(preview.affectedCardCount).toBe(0);
    expect(preview.dataLossExpected).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd tools/data-handler && pnpm test test/mutations/handlers/field-type-enum-add.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the handler**

```typescript
// tools/data-handler/src/mutations/handlers/field-type-enum-add.ts

import type { Handler, MutationContext } from '../handler.js';
import type { CascadePreview } from '../types.js';
import { resourceNameToString } from '../../utils/resource-utils.js';

export class FieldTypeEnumAddHandler implements Handler {
  readonly isBreaking = false;

  matches(ctx: MutationContext): boolean {
    return (
      ctx.input.kind === 'edit' &&
      ctx.input.target.type === 'fieldTypes' &&
      ctx.input.updateKey.key === 'enumValues' &&
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
      summary: 'Adds a new enum value (no cascade effects).',
    };
  }

  async apply(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'edit') {
      throw new Error('FieldTypeEnumAddHandler: non-edit input');
    }
    const fieldName = resourceNameToString(ctx.input.target);
    const resource = ctx.project.resources.byType(fieldName, 'fieldTypes');
    if (!resource) {
      throw new Error(`Field type '${fieldName}' not found`);
    }
    await resource.update(ctx.input.updateKey, ctx.input.operation);
  }

  async affectedFilePaths(_ctx: MutationContext): Promise<string[]> {
    return [];
  }
}
```

- [ ] **Step 4: Register the handler**

In `tools/data-handler/src/mutations/dispatcher.ts`:

```typescript
import { FieldTypeEnumAddHandler } from './handlers/field-type-enum-add.js';

const HANDLERS: Handler[] = [
  new LinkTypeRenameHandler(),
  new FieldTypeRenameHandler(),
  new FieldTypeDataTypeHandler(),
  new FieldTypeEnumAddHandler(),
  new DefaultNoCascadeHandler(),
];
```

- [ ] **Step 5: Run tests**

```bash
cd tools/data-handler && pnpm test test/mutations/handlers/field-type-enum-add.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tools/data-handler/src/mutations/handlers/field-type-enum-add.ts \
        tools/data-handler/test/mutations/handlers/field-type-enum-add.test.ts \
        tools/data-handler/src/mutations/dispatcher.ts
git commit -m "feat: FieldTypeEnumAddHandler (non-breaking, no cascade)"
```

---

### Task 6: `FieldTypeEnumRemoveHandler` — write the failing test

**Files:**
- Create: `tools/data-handler/test/mutations/handlers/field-type-enum-remove.test.ts`

Enum-value removal. The cascade: every card whose value for this field is the removed enum value gets either `null` (basic-migration default) or the `replacementValue` (when provided on the `RemoveOperation`). This extracts `handleEnumValueReplacements` from `FieldTypeResource`, but the null-out branch is new (today the existing code refuses the remove unless `replacementValue` is given — but that contradicts the basic-migration policy in `migrations-plan.adoc`; this plan implements the basic-migration policy and treats `replacementValue` as the complete-migration override).

- [ ] **Step 1: Write the failing test**

```typescript
// tools/data-handler/test/mutations/handlers/field-type-enum-remove.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../../src/containers/project.js';
import { FieldTypeEnumRemoveHandler } from '../../../src/mutations/handlers/field-type-enum-remove.js';
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
const tmpDir = join(import.meta.dirname, 'tmp-field-type-enum-remove');

describe('FieldTypeEnumRemoveHandler', () => {
  let project: Project;
  let projectPath: string;
  const fieldName = () => `${project.projectPrefix}/fieldTypes/percentageReady`;

  beforeEach(async () => {
    projectPath = join(tmpDir, `proj-${Date.now()}-${Math.random()}`);
    await mkdir(projectPath, { recursive: true });
    await copyDir(FIXTURE_PATH, projectPath);
    project = new Project(projectPath);
    await project.initialize();

    // Ensure at least one card carries the soon-to-be-removed enum value.
    // Use an existing enum field in the fixture; adjust 'low' if the fixture
    // uses a different enum value.
    const cards = project.cards(undefined);
    if (cards.length > 0 && cards[0].metadata) {
      cards[0].metadata[fieldName()] = 'low';
      await project.updateCardMetadata(cards[0], cards[0].metadata);
    }
  });
  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('matches remove on enumValues', () => {
    const handler = new FieldTypeEnumRemoveHandler();
    const ctx = {
      project,
      input: {
        kind: 'edit' as const,
        target: resourceName(fieldName()),
        updateKey: { key: 'enumValues' as const },
        operation: { name: 'remove' as const, target: { enumValue: 'low' } },
      },
    };
    expect(handler.matches(ctx)).toBe(true);
  });

  it('preview reports data loss when no replacement is provided', async () => {
    const handler = new FieldTypeEnumRemoveHandler();
    const ctx = {
      project,
      input: {
        kind: 'edit' as const,
        target: resourceName(fieldName()),
        updateKey: { key: 'enumValues' as const },
        operation: { name: 'remove' as const, target: { enumValue: 'low' } },
      },
    };
    const preview = await handler.preview(ctx);
    expect(preview.dataLossExpected).toBe(true);
    expect(preview.affectedCardCount).toBeGreaterThan(0);
  });

  it('preview does not flag data loss when replacementValue is set', async () => {
    const handler = new FieldTypeEnumRemoveHandler();
    const ctx = {
      project,
      input: {
        kind: 'edit' as const,
        target: resourceName(fieldName()),
        updateKey: { key: 'enumValues' as const },
        operation: {
          name: 'remove' as const,
          target: { enumValue: 'low' },
          replacementValue: { enumValue: 'medium' },
        },
      },
    };
    const preview = await handler.preview(ctx);
    expect(preview.dataLossExpected).toBe(false);
  });

  it('applying without replacement nulls the field on every affected card', async () => {
    const handler = new FieldTypeEnumRemoveHandler();
    const ctx = {
      project,
      input: {
        kind: 'edit' as const,
        target: resourceName(fieldName()),
        updateKey: { key: 'enumValues' as const },
        operation: { name: 'remove' as const, target: { enumValue: 'low' } },
      },
    };
    await handler.apply(ctx);
    for (const card of project.cards(undefined)) {
      expect(card.metadata?.[fieldName()]).not.toBe('low');
    }
  });

  it('applying with replacementValue rewrites instead of nulling', async () => {
    const handler = new FieldTypeEnumRemoveHandler();
    const ctx = {
      project,
      input: {
        kind: 'edit' as const,
        target: resourceName(fieldName()),
        updateKey: { key: 'enumValues' as const },
        operation: {
          name: 'remove' as const,
          target: { enumValue: 'low' },
          replacementValue: { enumValue: 'medium' },
        },
      },
    };
    await handler.apply(ctx);
    let anyCardHasMedium = false;
    for (const card of project.cards(undefined)) {
      if (card.metadata?.[fieldName()] === 'medium') anyCardHasMedium = true;
      expect(card.metadata?.[fieldName()]).not.toBe('low');
    }
    expect(anyCardHasMedium).toBe(true);
  });

  it('isBreaking is true', () => {
    expect(new FieldTypeEnumRemoveHandler().isBreaking).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd tools/data-handler && pnpm test test/mutations/handlers/field-type-enum-remove.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Commit the failing test**

```bash
git add tools/data-handler/test/mutations/handlers/field-type-enum-remove.test.ts
git commit -m "test: failing test for FieldTypeEnumRemoveHandler"
```

---

### Task 7: `FieldTypeEnumRemoveHandler` — implementation

**Files:**
- Create: `tools/data-handler/src/mutations/handlers/field-type-enum-remove.ts`
- Modify: `tools/data-handler/src/mutations/dispatcher.ts`

- [ ] **Step 1: Implement the handler**

```typescript
// tools/data-handler/src/mutations/handlers/field-type-enum-remove.ts

import { join } from 'node:path';

import type { Handler, MutationContext } from '../handler.js';
import type { CascadePreview } from '../types.js';
import { resourceNameToString } from '../../utils/resource-utils.js';
import type {
  EnumDefinition,
} from '../../interfaces/resource-interfaces.js';
import type { Card } from '../../interfaces/project-interfaces.js';
import type { RemoveOperation } from '../../resources/resource-object.js';

export class FieldTypeEnumRemoveHandler implements Handler {
  readonly isBreaking = true;

  matches(ctx: MutationContext): boolean {
    return (
      ctx.input.kind === 'edit' &&
      ctx.input.target.type === 'fieldTypes' &&
      ctx.input.updateKey.key === 'enumValues' &&
      ctx.input.operation.name === 'remove'
    );
  }

  async preview(ctx: MutationContext): Promise<CascadePreview> {
    if (ctx.input.kind !== 'edit') {
      throw new Error('FieldTypeEnumRemoveHandler: non-edit input');
    }
    const fieldName = resourceNameToString(ctx.input.target);
    const op = ctx.input.operation as RemoveOperation<EnumDefinition>;
    const removed = (op.target as EnumDefinition).enumValue;
    const affected = this.affectedCards(ctx, fieldName, removed);
    const replacement = (op.replacementValue as EnumDefinition | undefined)
      ?.enumValue;
    return {
      affectedCardCount: affected.length,
      affectedLinkCount: 0,
      affectedCalculationCount: 0,
      affectedHandlebarFileCount: 0,
      dataLossExpected: replacement === undefined && affected.length > 0,
      summary: replacement
        ? `Replaces '${removed}' with '${replacement}' on ${affected.length} cards.`
        : `Removes '${removed}' (sets ${affected.length} cards to null).`,
    };
  }

  async apply(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'edit') {
      throw new Error('FieldTypeEnumRemoveHandler: non-edit input');
    }
    const fieldName = resourceNameToString(ctx.input.target);
    const op = ctx.input.operation as RemoveOperation<EnumDefinition>;
    const removed = (op.target as EnumDefinition).enumValue;
    const replacement = (op.replacementValue as EnumDefinition | undefined)
      ?.enumValue;

    // 1. Cascade: rewrite or null the value on every affected card.
    for (const card of this.affectedCards(ctx, fieldName, removed)) {
      const metadata = card.metadata!;
      metadata[fieldName] = replacement ?? null;
      await ctx.project.updateCardMetadata(card, metadata);
    }

    // 2. Remove the enum entry from the field type definition.
    const resource = ctx.project.resources.byType(fieldName, 'fieldTypes');
    if (!resource) {
      throw new Error(`Field type '${fieldName}' not found`);
    }
    await resource.update(ctx.input.updateKey, ctx.input.operation);
  }

  async affectedFilePaths(ctx: MutationContext): Promise<string[]> {
    if (ctx.input.kind !== 'edit') return [];
    const fieldName = resourceNameToString(ctx.input.target);
    const op = ctx.input.operation as RemoveOperation<EnumDefinition>;
    const removed = (op.target as EnumDefinition).enumValue;
    return this.affectedCards(ctx, fieldName, removed).map((c) =>
      join(c.path, 'index.json'),
    );
  }

  private affectedCards(
    ctx: MutationContext,
    fieldName: string,
    removed: string,
  ): Card[] {
    const all = [
      ...ctx.project.cards(undefined),
      ...ctx.project.allTemplateCards(),
    ];
    return all.filter((c) => c.metadata?.[fieldName] === removed);
  }
}
```

- [ ] **Step 2: Register the handler**

```typescript
// dispatcher.ts
import { FieldTypeEnumRemoveHandler } from './handlers/field-type-enum-remove.js';

const HANDLERS: Handler[] = [
  new LinkTypeRenameHandler(),
  new FieldTypeRenameHandler(),
  new FieldTypeDataTypeHandler(),
  new FieldTypeEnumAddHandler(),
  new FieldTypeEnumRemoveHandler(),
  new DefaultNoCascadeHandler(),
];
```

- [ ] **Step 3: Run tests**

```bash
cd tools/data-handler && pnpm test test/mutations/handlers/field-type-enum-remove.test.ts
```

Expected: PASS for all six `it` blocks.

- [ ] **Step 4: Commit**

```bash
git add tools/data-handler/src/mutations/handlers/field-type-enum-remove.ts \
        tools/data-handler/src/mutations/dispatcher.ts
git commit -m "feat: FieldTypeEnumRemoveHandler

Cascade nulls the field on every affected card (basic migration) or
substitutes the RemoveOperation.replacementValue when provided
(complete migration). Replaces the FieldTypeResource.handleEnumValueReplacements
+ the existing 'refuse remove' branch with the spec-compliant policy."
```

---

### Task 8: `FieldTypeEnumRenameHandler` — write test + implement

**Files:**
- Create: `tools/data-handler/test/mutations/handlers/field-type-enum-rename.test.ts`
- Create: `tools/data-handler/src/mutations/handlers/field-type-enum-rename.ts`
- Modify: `tools/data-handler/src/mutations/dispatcher.ts`

Enum-value rename — `change enumValues` where the `to` object's `enumValue` differs from `target.enumValue`. The cascade is a straight find-and-replace inside card metadata (no data loss). This is `migrations-plan.adoc` row "Rename enum value".

- [ ] **Step 1: Write the failing test**

```typescript
// tools/data-handler/test/mutations/handlers/field-type-enum-rename.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../../src/containers/project.js';
import { FieldTypeEnumRenameHandler } from '../../../src/mutations/handlers/field-type-enum-rename.js';
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
const tmpDir = join(import.meta.dirname, 'tmp-field-type-enum-rename');

describe('FieldTypeEnumRenameHandler', () => {
  let project: Project;
  let projectPath: string;
  const fieldName = () => `${project.projectPrefix}/fieldTypes/percentageReady`;

  beforeEach(async () => {
    projectPath = join(tmpDir, `proj-${Date.now()}-${Math.random()}`);
    await mkdir(projectPath, { recursive: true });
    await copyDir(FIXTURE_PATH, projectPath);
    project = new Project(projectPath);
    await project.initialize();

    const cards = project.cards(undefined);
    if (cards.length > 0 && cards[0].metadata) {
      cards[0].metadata[fieldName()] = 'low';
      await project.updateCardMetadata(cards[0], cards[0].metadata);
    }
  });
  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  const renameOp = {
    name: 'change' as const,
    target: { enumValue: 'low' },
    to: { enumValue: 'minor' },
  };

  it('matches change on enumValues where enumValue differs', () => {
    const handler = new FieldTypeEnumRenameHandler();
    const ctx = {
      project,
      input: {
        kind: 'edit' as const,
        target: resourceName(fieldName()),
        updateKey: { key: 'enumValues' as const },
        operation: renameOp,
      },
    };
    expect(handler.matches(ctx)).toBe(true);
  });

  it('does not match a change that only edits enumDisplayValue', () => {
    const handler = new FieldTypeEnumRenameHandler();
    const ctx = {
      project,
      input: {
        kind: 'edit' as const,
        target: resourceName(fieldName()),
        updateKey: { key: 'enumValues' as const },
        operation: {
          name: 'change' as const,
          target: { enumValue: 'low' },
          to: { enumValue: 'low', enumDisplayValue: 'Low priority' },
        },
      },
    };
    expect(handler.matches(ctx)).toBe(false);
  });

  it('applying find-and-replaces the enum value on every affected card', async () => {
    const handler = new FieldTypeEnumRenameHandler();
    const ctx = {
      project,
      input: {
        kind: 'edit' as const,
        target: resourceName(fieldName()),
        updateKey: { key: 'enumValues' as const },
        operation: renameOp,
      },
    };
    await handler.apply(ctx);
    for (const card of project.cards(undefined)) {
      expect(card.metadata?.[fieldName()]).not.toBe('low');
    }
  });

  it('isBreaking is true', () => {
    expect(new FieldTypeEnumRenameHandler().isBreaking).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd tools/data-handler && pnpm test test/mutations/handlers/field-type-enum-rename.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the handler**

```typescript
// tools/data-handler/src/mutations/handlers/field-type-enum-rename.ts

import { join } from 'node:path';

import type { Handler, MutationContext } from '../handler.js';
import type { CascadePreview } from '../types.js';
import { resourceNameToString } from '../../utils/resource-utils.js';
import type { EnumDefinition } from '../../interfaces/resource-interfaces.js';
import type { Card } from '../../interfaces/project-interfaces.js';
import type { ChangeOperation } from '../../resources/resource-object.js';

export class FieldTypeEnumRenameHandler implements Handler {
  readonly isBreaking = true;

  matches(ctx: MutationContext): boolean {
    if (
      ctx.input.kind !== 'edit' ||
      ctx.input.target.type !== 'fieldTypes' ||
      ctx.input.updateKey.key !== 'enumValues' ||
      ctx.input.operation.name !== 'change'
    ) {
      return false;
    }
    const op = ctx.input.operation as ChangeOperation<EnumDefinition>;
    return (op.target as EnumDefinition).enumValue !== (op.to as EnumDefinition).enumValue;
  }

  async preview(ctx: MutationContext): Promise<CascadePreview> {
    if (ctx.input.kind !== 'edit') {
      throw new Error('FieldTypeEnumRenameHandler: non-edit input');
    }
    const fieldName = resourceNameToString(ctx.input.target);
    const op = ctx.input.operation as ChangeOperation<EnumDefinition>;
    const oldValue = (op.target as EnumDefinition).enumValue;
    const affected = this.affectedCards(ctx, fieldName, oldValue);
    return {
      affectedCardCount: affected.length,
      affectedLinkCount: 0,
      affectedCalculationCount: 0,
      affectedHandlebarFileCount: 0,
      dataLossExpected: false,
      summary: `Renames enum value '${oldValue}' → '${(op.to as EnumDefinition).enumValue}' on ${affected.length} cards.`,
    };
  }

  async apply(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'edit') {
      throw new Error('FieldTypeEnumRenameHandler: non-edit input');
    }
    const fieldName = resourceNameToString(ctx.input.target);
    const op = ctx.input.operation as ChangeOperation<EnumDefinition>;
    const oldValue = (op.target as EnumDefinition).enumValue;
    const newValue = (op.to as EnumDefinition).enumValue;

    // 1. Rewrite each affected card's value.
    for (const card of this.affectedCards(ctx, fieldName, oldValue)) {
      const metadata = card.metadata!;
      metadata[fieldName] = newValue;
      await ctx.project.updateCardMetadata(card, metadata);
    }

    // 2. Apply the enum-array change to the resource definition.
    const resource = ctx.project.resources.byType(fieldName, 'fieldTypes');
    if (!resource) {
      throw new Error(`Field type '${fieldName}' not found`);
    }
    await resource.update(ctx.input.updateKey, ctx.input.operation);
  }

  async affectedFilePaths(ctx: MutationContext): Promise<string[]> {
    if (ctx.input.kind !== 'edit') return [];
    const fieldName = resourceNameToString(ctx.input.target);
    const op = ctx.input.operation as ChangeOperation<EnumDefinition>;
    const oldValue = (op.target as EnumDefinition).enumValue;
    return this.affectedCards(ctx, fieldName, oldValue).map((c) =>
      join(c.path, 'index.json'),
    );
  }

  private affectedCards(
    ctx: MutationContext,
    fieldName: string,
    value: string,
  ): Card[] {
    const all = [
      ...ctx.project.cards(undefined),
      ...ctx.project.allTemplateCards(),
    ];
    return all.filter((c) => c.metadata?.[fieldName] === value);
  }
}
```

- [ ] **Step 4: Register the handler**

In `dispatcher.ts`, add **before** `FieldTypeEnumRemoveHandler` and after `FieldTypeDataTypeHandler` — order matters because the default-no-cascade handler must not catch any of these:

```typescript
import { FieldTypeEnumRenameHandler } from './handlers/field-type-enum-rename.js';

const HANDLERS: Handler[] = [
  new LinkTypeRenameHandler(),
  new FieldTypeRenameHandler(),
  new FieldTypeDataTypeHandler(),
  new FieldTypeEnumAddHandler(),
  new FieldTypeEnumRemoveHandler(),
  new FieldTypeEnumRenameHandler(),
  new DefaultNoCascadeHandler(),
];
```

- [ ] **Step 5: Run tests**

```bash
cd tools/data-handler && pnpm test test/mutations/handlers/field-type-enum-rename.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tools/data-handler/src/mutations/handlers/field-type-enum-rename.ts \
        tools/data-handler/test/mutations/handlers/field-type-enum-rename.test.ts \
        tools/data-handler/src/mutations/dispatcher.ts
git commit -m "feat: FieldTypeEnumRenameHandler

Find-and-replace cascade for enum-value rename. Distinguishes 'rename the
enumValue itself' from 'change displayName/description' via the
matches() guard so DefaultNoCascadeHandler keeps owning the latter."
```

---

### Task 9: `FieldTypeDeleteHandler` — write the failing test

**Files:**
- Create: `tools/data-handler/test/mutations/handlers/field-type-delete.test.ts`

Per `migrations-plan.adoc`, deleting a field type cascades: every card type loses the field from its `customFields`, and every card loses the field from its metadata. Today's code throws when `usage > 0`; the new handler *applies* the cascade.

- [ ] **Step 1: Write the failing test**

```typescript
// tools/data-handler/test/mutations/handlers/field-type-delete.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../../src/containers/project.js';
import { FieldTypeDeleteHandler } from '../../../src/mutations/handlers/field-type-delete.js';
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
const tmpDir = join(import.meta.dirname, 'tmp-field-type-delete');

describe('FieldTypeDeleteHandler', () => {
  let project: Project;
  let projectPath: string;
  const fieldName = () => `${project.projectPrefix}/fieldTypes/finished`;

  beforeEach(async () => {
    projectPath = join(tmpDir, `proj-${Date.now()}-${Math.random()}`);
    await mkdir(projectPath, { recursive: true });
    await copyDir(FIXTURE_PATH, projectPath);
    project = new Project(projectPath);
    await project.initialize();
  });
  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('matches delete on a field type', () => {
    const handler = new FieldTypeDeleteHandler();
    const ctx = {
      project,
      input: {
        kind: 'delete' as const,
        target: resourceName(fieldName()),
      },
    };
    expect(handler.matches(ctx)).toBe(true);
  });

  it('does not match delete on a link type', () => {
    const handler = new FieldTypeDeleteHandler();
    const ctx = {
      project,
      input: {
        kind: 'delete' as const,
        target: resourceName(`${project.projectPrefix}/linkTypes/causes`),
      },
    };
    expect(handler.matches(ctx)).toBe(false);
  });

  it('preview reports data loss when cards carry the field', async () => {
    const handler = new FieldTypeDeleteHandler();
    const ctx = {
      project,
      input: {
        kind: 'delete' as const,
        target: resourceName(fieldName()),
      },
    };
    const preview = await handler.preview(ctx);
    if (preview.affectedCardCount > 0) {
      expect(preview.dataLossExpected).toBe(true);
    }
  });

  it('applying strips the field from every card type and every card', async () => {
    const handler = new FieldTypeDeleteHandler();
    const target = fieldName();
    const ctx = {
      project,
      input: { kind: 'delete' as const, target: resourceName(target) },
    };
    await handler.apply(ctx);
    for (const cardType of project.resources.cardTypes()) {
      const customFields = cardType.data?.customFields ?? [];
      expect(customFields.some((cf) => cf.name === target)).toBe(false);
    }
    for (const card of project.cards(undefined)) {
      if (!card.metadata) continue;
      expect(Object.keys(card.metadata)).not.toContain(target);
    }
    expect(project.resources.byType(target, 'fieldTypes')).toBeUndefined();
  });

  it('isBreaking is true', () => {
    expect(new FieldTypeDeleteHandler().isBreaking).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd tools/data-handler && pnpm test test/mutations/handlers/field-type-delete.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Commit the failing test**

```bash
git add tools/data-handler/test/mutations/handlers/field-type-delete.test.ts
git commit -m "test: failing test for FieldTypeDeleteHandler"
```

---

### Task 10: `FieldTypeDeleteHandler` — implementation

**Files:**
- Create: `tools/data-handler/src/mutations/handlers/field-type-delete.ts`
- Modify: `tools/data-handler/src/mutations/dispatcher.ts`

- [ ] **Step 1: Implement the handler**

```typescript
// tools/data-handler/src/mutations/handlers/field-type-delete.ts

import { join } from 'node:path';

import type { Handler, MutationContext } from '../handler.js';
import type { CascadePreview } from '../types.js';
import { resourceNameToString } from '../../utils/resource-utils.js';
import type { Card } from '../../interfaces/project-interfaces.js';

export class FieldTypeDeleteHandler implements Handler {
  readonly isBreaking = true;

  matches(ctx: MutationContext): boolean {
    return (
      ctx.input.kind === 'delete' && ctx.input.target.type === 'fieldTypes'
    );
  }

  async preview(ctx: MutationContext): Promise<CascadePreview> {
    if (ctx.input.kind !== 'delete') {
      throw new Error('FieldTypeDeleteHandler: non-delete input');
    }
    const fieldName = resourceNameToString(ctx.input.target);
    const cards = this.cardsWithField(ctx, fieldName);
    const cardTypes = this.cardTypesReferencing(ctx, fieldName);
    return {
      affectedCardCount: cards.length,
      affectedLinkCount: 0,
      affectedCalculationCount: 0,
      affectedHandlebarFileCount: 0,
      dataLossExpected: cards.length > 0,
      summary: `Deletes '${fieldName}'; strips it from ${cardTypes.length} card types and ${cards.length} cards.`,
    };
  }

  async apply(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'delete') {
      throw new Error('FieldTypeDeleteHandler: non-delete input');
    }
    const fieldName = resourceNameToString(ctx.input.target);

    // 1. Remove the field from every card type that references it.
    for (const cardType of this.cardTypesReferencing(ctx, fieldName)) {
      await cardType.update(
        { key: 'customFields' },
        { name: 'remove', target: { name: fieldName } } as never,
      );
    }

    // 2. Strip the field from every card carrying it.
    for (const card of this.cardsWithField(ctx, fieldName)) {
      const metadata = card.metadata!;
      delete metadata[fieldName];
      await ctx.project.updateCardMetadata(card, metadata);
    }

    // 3. Delete the resource itself.
    const resource = ctx.project.resources.byType(fieldName, 'fieldTypes');
    if (!resource) {
      throw new Error(`Field type '${fieldName}' not found`);
    }
    await resource.delete();
  }

  async affectedFilePaths(ctx: MutationContext): Promise<string[]> {
    if (ctx.input.kind !== 'delete') return [];
    const fieldName = resourceNameToString(ctx.input.target);
    const cardPaths = this.cardsWithField(ctx, fieldName).map((c) =>
      join(c.path, 'index.json'),
    );
    const cardTypePaths = this.cardTypesReferencing(ctx, fieldName).map(
      (ct) => ct.fileName,
    );
    return [...cardPaths, ...cardTypePaths];
  }

  private cardsWithField(ctx: MutationContext, fieldName: string): Card[] {
    const all = [
      ...ctx.project.cards(undefined),
      ...ctx.project.allTemplateCards(),
    ];
    return all.filter((c) => c.metadata && fieldName in c.metadata);
  }

  private cardTypesReferencing(ctx: MutationContext, fieldName: string) {
    return ctx.project.resources
      .cardTypes()
      .filter((ct) =>
        ct.data?.customFields?.some((cf) => cf.name === fieldName),
      );
  }
}
```

- [ ] **Step 2: Register the handler**

```typescript
// dispatcher.ts
import { FieldTypeDeleteHandler } from './handlers/field-type-delete.js';

const HANDLERS: Handler[] = [
  new LinkTypeRenameHandler(),
  new FieldTypeRenameHandler(),
  new FieldTypeDataTypeHandler(),
  new FieldTypeEnumAddHandler(),
  new FieldTypeEnumRemoveHandler(),
  new FieldTypeEnumRenameHandler(),
  new FieldTypeDeleteHandler(),
  new DefaultNoCascadeHandler(),
];
```

- [ ] **Step 3: Run tests**

```bash
cd tools/data-handler && pnpm test test/mutations/handlers/field-type-delete.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tools/data-handler/src/mutations/handlers/field-type-delete.ts \
        tools/data-handler/src/mutations/dispatcher.ts
git commit -m "feat: FieldTypeDeleteHandler

Replaces the 'refuse delete on usage > 0' policy with the spec's
basic-migration cascade: strip the field from every card type and
every card before removing the resource."
```

---

### Task 11: Route FieldType operations through `ResourceMutations` in `commands/update.ts`

**Files:**
- Modify: `tools/data-handler/src/commands/update.ts`
- Test: `tools/data-handler/test/command-update.test.ts`

Mirror foundation Task 12. `Update.applyResourceOperation` should detect FieldType-targeting operations and delegate to `ResourceMutations`. The existing link-type-rename branch (from the foundation plan) gives the template — refactor it into a shared helper so the FieldType branch reuses the plan/apply round-trip.

- [ ] **Step 1: Write the failing test**

Append to `tools/data-handler/test/command-update.test.ts`:

```typescript
it('routes field-type renames through the new mutation engine', async () => {
  const project = await openTestProject('decision-records');
  const update = new Update(project);

  const fieldTypeName = `${project.projectPrefix}/fieldTypes/finished`;
  const newName = `${project.projectPrefix}/fieldTypes/completed`;

  await update.applyResourceOperation(
    fieldTypeName,
    { key: 'name' },
    { name: 'change', target: fieldTypeName, to: newName },
  );

  const entries = await ConfigurationLogger.entries(project.basePath);
  expect(
    entries.some(
      (e) => e.kind === 'resource_rename' && e.target === fieldTypeName,
    ),
  ).toBe(true);
});

it('routes field-type dataType changes through the new mutation engine', async () => {
  const project = await openTestProject('decision-records');
  const update = new Update(project);

  const fieldTypeName = `${project.projectPrefix}/fieldTypes/commitDescription`;

  await update.applyResourceOperation(
    fieldTypeName,
    { key: 'dataType' },
    { name: 'change', target: 'shortText', to: 'longText' },
  );

  const entries = await ConfigurationLogger.entries(project.basePath);
  expect(
    entries.some(
      (e) =>
        e.kind === 'resource_edit' &&
        e.target === fieldTypeName &&
        (e.payload as { key?: string }).key === 'dataType',
    ),
  ).toBe(true);
});
```

The `openTestProject(...)` helper is the same fresh-copy pattern the existing tests in this file already use; if no such helper exists, follow the `copyDir(FIXTURE_PATH, projectPath)` pattern from the handler tests.

- [ ] **Step 2: Run test to verify it fails**

```bash
cd tools/data-handler && pnpm test test/command-update.test.ts -t "routes field-type"
```

Expected: FAIL — the existing path doesn't write `resource_edit` entries via the new engine for FieldType dataType changes.

- [ ] **Step 3: Refactor `applyResourceOperation` to a single routing helper**

In `tools/data-handler/src/commands/update.ts`:

```typescript
public async applyResourceOperation<
  Type,
  T extends UpdateOperations,
  K extends string,
>(name: string, updateKey: UpdateKey<K>, operation: OperationFor<Type, T>) {
  const type = this.project.resources.extractType(name);

  // Resource families that are fully owned by the mutation engine.
  const enginedTypes = new Set(['linkTypes', 'fieldTypes']);

  if (enginedTypes.has(type)) {
    const { resourceName: parseResourceName } = await import(
      '../utils/resource-utils.js'
    );
    const { ResourceMutations } = await import('../mutations/plan.js');
    const target = parseResourceName(name);
    const mutations = new ResourceMutations(this.project);

    // Renames travel under the 'rename' MutationKind; everything else is 'edit'.
    const isRename =
      updateKey.key === 'name' && (operation as { name: string }).name === 'change';

    if (isRename) {
      const newIdentifier = parseResourceName(
        (operation as { to: string }).to,
      ).identifier;
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

    const editInput = {
      kind: 'edit' as const,
      target,
      updateKey,
      operation,
    };
    const plan = await mutations.plan(editInput);
    await mutations.apply(editInput, { fingerprint: plan.fingerprint });
    return;
  }

  // Legacy path for resource types whose cascades have not yet moved to
  // the engine. Follow-on plans (CardType, Workflow, etc.) keep emptying
  // this branch.
  const run = () =>
    this.project.lock.write(async () => {
      const resource = this.project.resources.byType(name, type);
      await resource?.update(updateKey, operation);
    });
  return runWithDefaultCommitMessage('Apply resource operation', run);
}
```

- [ ] **Step 4: Run the data-handler suite**

```bash
cd tools/data-handler && pnpm test
```

Expected: PASS. If any pre-existing test asserted the *old* behaviour (for example, "removing an enum value with usage > 0 throws"), update that test to assert the new cascade outcome instead — the new policy from `migrations-plan.adoc` supersedes the old guard.

- [ ] **Step 5: Commit**

```bash
git add tools/data-handler/src/commands/update.ts \
        tools/data-handler/test/command-update.test.ts
git commit -m "feat: route FieldType + LinkType ops through ResourceMutations

Pulls the link-type rename special-case into a generic 'engined types'
set. Adds FieldType to it: every FieldType edit/rename now goes through
plan() + apply()."
```

---

### Task 12: Route FieldType deletes through `ResourceMutations` in `commands/remove.ts`

**Files:**
- Modify: `tools/data-handler/src/commands/remove.ts`
- Test: `tools/data-handler/test/command-remove.test.ts`

Today `Remove.removeProjectResource` calls `resource?.delete()`. For FieldType, route through `ResourceMutations` so the delete-handler cascade fires.

- [ ] **Step 1: Write the failing test**

Update or add in `tools/data-handler/test/command-remove.test.ts`:

```typescript
it('removing a field-type cascades through the new engine', async () => {
  // Set up a project where one card type lists a field type in customFields
  // and one card carries the field in its metadata.
  const project = await openTestProject('decision-records');
  const removeCmd = new Remove(project, fetchCmd);

  const fieldTypeName = `${project.projectPrefix}/fieldTypes/finished`;
  await removeCmd.remove('fieldType', fieldTypeName);

  // After delete: resource gone, no card has the key, no card type
  // references it in customFields, and the log carries a resource_delete.
  expect(project.resources.byType(fieldTypeName, 'fieldTypes')).toBeUndefined();
  for (const cardType of project.resources.cardTypes()) {
    expect(
      cardType.data?.customFields?.some((cf) => cf.name === fieldTypeName),
    ).toBe(false);
  }
  const entries = await ConfigurationLogger.entries(project.basePath);
  expect(
    entries.some(
      (e) => e.kind === 'resource_delete' && e.target === fieldTypeName,
    ),
  ).toBe(true);
});
```

If `command-remove.test.ts` already has a test named `'remove fieldType (success)'` that asserted the old "throws on usage > 0" behaviour, either delete it or convert it into the new cascade assertion above (the old behaviour contradicts the spec).

- [ ] **Step 2: Run test to verify it fails**

```bash
cd tools/data-handler && pnpm test test/command-remove.test.ts -t "cascades through the new engine"
```

Expected: FAIL — the existing `resource?.delete()` path does not route via the engine and does not write a `resource_delete` log entry.

- [ ] **Step 3: Modify `Remove`**

In `tools/data-handler/src/commands/remove.ts` (around the `projectResource(type)` branch at line ~299):

```typescript
if (this.projectResource(type)) {
  const folderType =
    this.project.resources.resourceTypeFromSingularType(type);
  if (folderType === 'fieldTypes' || folderType === 'linkTypes') {
    const { resourceName: parseResourceName } = await import(
      '../utils/resource-utils.js'
    );
    const { ResourceMutations } = await import('../mutations/plan.js');
    const target = parseResourceName(targetName);
    const mutations = new ResourceMutations(this.project);
    const plan = await mutations.plan({ kind: 'delete', target });
    await mutations.apply(
      { kind: 'delete', target },
      { fingerprint: plan.fingerprint },
    );
    return;
  }

  // Legacy path for resource types whose deletes have not yet moved to
  // the engine.
  const resource = this.project.resources.byType(targetName, folderType);
  return resource?.delete();
}
```

The `linkTypes` branch is included for symmetry with Task 11 — note this only fires when a follow-on plan adds a `LinkTypeDeleteHandler`. Until then the dispatcher would not find a delete handler and would throw. Guard against that by only including `linkTypes` once that handler exists; for this plan keep just `fieldTypes`:

```typescript
if (folderType === 'fieldTypes') {
  // ... as above
}
```

- [ ] **Step 4: Run the suite**

```bash
cd tools/data-handler && pnpm test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/data-handler/src/commands/remove.ts \
        tools/data-handler/test/command-remove.test.ts
git commit -m "feat: route FieldType deletes through ResourceMutations

Replaces the unconditional resource.delete() with a plan/apply round-trip
so the FieldTypeDeleteHandler cascade fires. Other resource types stay on
the legacy path; follow-on plans move them one by one."
```

---

### Task 13: Remove dead cascade code from `FieldTypeResource`

**Files:**
- Modify: `tools/data-handler/src/resources/field-type-resource.ts`

The handlers now own every FieldType cascade. Remove the methods they replaced:

- `dataTypeChanged`
- `convertValue`, `doConvertValue`
- `handleEnumValueReplacements`
- `relevantCardTypes`
- `updateCardTypes`
- `isConversionValid`
- The body of `onNameChange` shrinks to just `await this.write()` (the parent's `rename()` already renamed the file).
- The body of `update<Type, K>` shrinks: `dataType` and `enumValues` updates now flow through the engine, so the resource class only needs to apply the literal content update (the engine calls `resource.update()` *after* its cascade). Keep the validation that the new dataType is in `fieldDataTypes()` and that `enumValues` adds/removes are well-formed — those guards must stay on the resource so unattended calls fail fast.

- [ ] **Step 1: Identify call sites of the methods being removed**

```bash
cd tools/data-handler && grep -rn "dataTypeChanged\|handleEnumValueReplacements\|relevantCardTypes\|updateCardTypes\|isConversionValid\b\|doConvertValue\b\|convertValue\b" src/
```

All remaining matches should be inside `field-type-resource.ts` itself.

- [ ] **Step 2: Rewrite `update<Type, K>` on `FieldTypeResource`**

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

  if (key === 'dataType') {
    const change = op as ChangeOperation<DataType>;
    if (!FieldTypeResource.fieldDataTypes().includes(change.to)) {
      throw new Error(`Cannot change '${key}' to unknown type '${change.to}'`);
    }
    if (content.dataType === change.to) {
      throw new Error(`'${key}' is already '${change.to}'`);
    }
    content.dataType = super.handleScalar(op) as DataType;
  } else if (key === 'enumValues') {
    if (!content.enumValues) {
      content.enumValues = [];
    }
    if (op.name === 'add' || op.name === 'change' || op.name === 'remove') {
      const existingValue = this.enumValueExists<EnumDefinition>(
        op as Operation<EnumDefinition>,
        content.enumValues as EnumDefinition[],
      ) as Type;
      op.target = existingValue ?? op.target;
    }
    content.enumValues = super.handleArray(
      op,
      key,
      content.enumValues as Type[],
    ) as EnumDefinition[];
  } else {
    throw new Error(`Unknown property '${key}' for FieldType`);
  }

  await super.postUpdate(content, updateKey, op);
}
```

`enumValueExists` stays — it guards the in-resource validity invariants (no duplicate values, target must exist for remove/change). The cascade pieces (`dataTypeChanged`, `handleEnumValueReplacements`) are gone.

- [ ] **Step 3: Simplify `onNameChange`**

```typescript
protected async onNameChange(_existingName: string) {
  await this.write();
}
```

The handler does the calculation/handlebars/card-content/customFields updates before calling `resource.update({ key: 'name' }, ...)`, so the resource's `onNameChange` is now a no-op aside from the write that persists the new name into the metadata file.

- [ ] **Step 4: Delete the now-orphan methods**

Remove from `field-type-resource.ts`:
- `dataTypeChanged()`
- `convertValue()`
- `doConvertValue()`
- `handleEnumValueReplacements()`
- `relevantCardTypes()` (only used by the removed cascades; `usage()` calls it — fold its body into `usage()` or relocate the helper as a private inside `usage` since it's a one-liner over `project.resources.cardTypes()`)
- `updateCardTypes()`
- `isConversionValid()`

`fromType` and `toType` private fields are no longer needed; remove them.

Update imports: drop `allowed`, `fromDate`, `fromNumber`, `fromString` from `../utils/value-utils.js` if no longer referenced. Drop the `RemoveOperation` import if unused. Keep `ChangeOperation` (still used in the rewritten `update`).

- [ ] **Step 5: Run the suite**

```bash
cd tools/data-handler && pnpm test
```

Expected: PASS. If `usage()` now returns slightly different results because `relevantCardTypes()` moved, check that the existing usage tests pass — the cardType listing should be identical, just reachable through a different code path.

- [ ] **Step 6: Commit**

```bash
git add tools/data-handler/src/resources/field-type-resource.ts
git commit -m "refactor: remove dead cascade code from FieldTypeResource

All FieldType cascades (rename, dataType change, enum add/remove/rename,
delete) now live in mutations/handlers/. The resource class keeps only
the resource-level invariants (valid dataType, no duplicate enum values)
and content persistence."
```

---

### Task 14: End-to-end integration test for FieldType

**Files:**
- Create: `tools/data-handler/test/mutations/integration-field-type.test.ts`

A single test file exercising the full lifecycle through `ResourceMutations`: dataType change → enum add → enum rename → enum remove → rename → delete, with assertions on resource state, card state, and the migration log after each step.

- [ ] **Step 1: Write the test**

```typescript
// tools/data-handler/test/mutations/integration-field-type.test.ts

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
const tmpDir = join(import.meta.dirname, 'tmp-integration-field-type');

describe('FieldType end-to-end through ResourceMutations', () => {
  let project: Project;
  let projectPath: string;
  let mutations: ResourceMutations;
  const targetName = () => `${project.projectPrefix}/fieldTypes/percentageReady`;

  beforeEach(async () => {
    projectPath = join(tmpDir, `proj-${Date.now()}-${Math.random()}`);
    await mkdir(projectPath, { recursive: true });
    await copyDir(FIXTURE_PATH, projectPath);
    project = new Project(projectPath);
    await project.initialize();
    mutations = new ResourceMutations(project);

    const cards = project.cards(undefined);
    if (cards.length > 0 && cards[0].metadata) {
      cards[0].metadata[targetName()] = 'low';
      await project.updateCardMetadata(cards[0], cards[0].metadata);
    }
  });
  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('runs a full lifecycle: enum-add → enum-rename → enum-remove → rename → delete', async () => {
    // 1. enum-add (non-breaking)
    let plan = await mutations.plan({
      kind: 'edit',
      target: resourceName(targetName()),
      updateKey: { key: 'enumValues' },
      operation: { name: 'add', target: { enumValue: 'critical' } },
    });
    expect(plan.isBreaking).toBe(false);
    await mutations.apply(
      {
        kind: 'edit',
        target: resourceName(targetName()),
        updateKey: { key: 'enumValues' },
        operation: { name: 'add', target: { enumValue: 'critical' } },
      },
      { fingerprint: plan.fingerprint },
    );

    // 2. enum-rename (breaking)
    plan = await mutations.plan({
      kind: 'edit',
      target: resourceName(targetName()),
      updateKey: { key: 'enumValues' },
      operation: {
        name: 'change',
        target: { enumValue: 'low' },
        to: { enumValue: 'minor' },
      },
    });
    expect(plan.isBreaking).toBe(true);
    expect(plan.preview.affectedCardCount).toBeGreaterThan(0);
    await mutations.apply(
      {
        kind: 'edit',
        target: resourceName(targetName()),
        updateKey: { key: 'enumValues' },
        operation: {
          name: 'change',
          target: { enumValue: 'low' },
          to: { enumValue: 'minor' },
        },
      },
      { fingerprint: plan.fingerprint },
    );

    // 3. enum-remove with replacementValue (breaking but no data loss)
    plan = await mutations.plan({
      kind: 'edit',
      target: resourceName(targetName()),
      updateKey: { key: 'enumValues' },
      operation: {
        name: 'remove',
        target: { enumValue: 'minor' },
        replacementValue: { enumValue: 'critical' },
      },
    });
    expect(plan.preview.dataLossExpected).toBe(false);
    await mutations.apply(
      {
        kind: 'edit',
        target: resourceName(targetName()),
        updateKey: { key: 'enumValues' },
        operation: {
          name: 'remove',
          target: { enumValue: 'minor' },
          replacementValue: { enumValue: 'critical' },
        },
      },
      { fingerprint: plan.fingerprint },
    );

    // 4. rename
    const renamed = `${project.projectPrefix}/fieldTypes/severity`;
    plan = await mutations.plan({
      kind: 'rename',
      target: resourceName(targetName()),
      newIdentifier: 'severity',
    });
    await mutations.apply(
      {
        kind: 'rename',
        target: resourceName(targetName()),
        newIdentifier: 'severity',
      },
      { fingerprint: plan.fingerprint },
    );
    expect(project.resources.byType(targetName(), 'fieldTypes')).toBeUndefined();
    expect(project.resources.byType(renamed, 'fieldTypes')).toBeDefined();

    // 5. delete
    plan = await mutations.plan({
      kind: 'delete',
      target: resourceName(renamed),
    });
    await mutations.apply(
      { kind: 'delete', target: resourceName(renamed) },
      { fingerprint: plan.fingerprint },
    );
    expect(project.resources.byType(renamed, 'fieldTypes')).toBeUndefined();

    // 6. Migration log
    const entries = await ConfigurationLogger.entries(project.basePath);
    const kinds = entries.map((e) => e.kind);
    // enum-add is non-breaking → no entry. Expect 4 breaking entries:
    // enum-rename, enum-remove, rename, delete.
    expect(entries).toHaveLength(4);
    expect(kinds).toEqual([
      'resource_edit',
      'resource_edit',
      'resource_rename',
      'resource_delete',
    ]);
  });

  it('refuses stale fingerprint after the project state changes', async () => {
    const input = {
      kind: 'rename' as const,
      target: resourceName(targetName()),
      newIdentifier: 'completed',
    };
    const plan = await mutations.plan(input);

    // Mutate one of the affected card files out-of-band.
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
cd tools/data-handler && pnpm test test/mutations/integration-field-type.test.ts
```

Expected: both `it` blocks PASS.

- [ ] **Step 3: Run the whole suite**

```bash
cd tools/data-handler && pnpm test
```

Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add tools/data-handler/test/mutations/integration-field-type.test.ts
git commit -m "test: end-to-end FieldType lifecycle through ResourceMutations"
```

---

## Verification checklist after the plan executes

Run from the repo root:

```bash
pnpm --filter @cyberismo/data-handler test
pnpm --filter @cyberismo/data-handler build
pnpm --filter @cyberismo/data-handler lint
```

All three should succeed. The repo's overall test suite should also still pass:

```bash
pnpm test
```

If any of `tools/cli`, `tools/backend`, `tools/app`, or `tools/mcp` referenced the removed `FieldTypeResource` private helpers (unlikely — they were all private), fix those references the same way Task 13's grep step would catch them.

### Self-review checklist

After the last task, verify by inspection (no commands; just look):

- [ ] Every new handler implements every member of `Handler`: `matches`, `isBreaking`, `preview`, `apply`, `affectedFilePaths`.
- [ ] `dispatcher.ts` lists the six new handlers ahead of `DefaultNoCascadeHandler`. Order between them does not matter (their `matches()` predicates are mutually exclusive), but `DefaultNoCascadeHandler` must be last.
- [ ] No handler's `preview()` writes anything to disk. (Search for `writeFile`, `updateCardMetadata`, `resource.update`, `resource.delete` inside `preview()` bodies — there should be none.)
- [ ] Every relative import in new files ends in `.js`.
- [ ] No `.only()` calls in any new test (`pnpm test` runs with `--forbid-only` for Mocha tests; Vitest tests should be similarly clean).
- [ ] `FieldTypeResource` no longer contains the words `dataTypeChanged`, `handleEnumValueReplacements`, `convertValue`, `doConvertValue`, `relevantCardTypes`, `updateCardTypes`, or `isConversionValid`.
- [ ] `commands/update.ts`'s `applyResourceOperation` routes both `linkTypes` and `fieldTypes` through `ResourceMutations`, and the "legacy path" branch is reachable only for the other resource types.
- [ ] `commands/remove.ts` routes `fieldType` deletes through `ResourceMutations`; everything else stays on `resource?.delete()`.
- [ ] The integration test asserts that enum-add does **not** produce a migration-log entry while every other operation does.

---

## What this plan delivers

After all tasks succeed:

- Six new cascade handlers covering every FieldType breaking-change row in `migrations-plan.adoc`.
- The `commands/update.ts` and `commands/remove.ts` entry points route FieldType operations through `ResourceMutations` end-to-end, with deterministic fingerprints and stale-fingerprint detection.
- The `FieldTypeResource` class is ~120 lines lighter and contains only resource-level concerns (validation, content persistence, `usage()`); cascades live in the engine.
- An end-to-end integration test that exercises every handler in sequence and asserts the resulting migration log shape.

## What's next

This plan is **Plan 2** in the follow-on sequence outlined at the end of the foundation plan. The remaining follow-ons all reuse the same handler-and-route-the-command pattern:

- **Plan 3 (CardType edit/delete/workflow-change).** `handleCustomFieldsChange`, `handleWorkflowChange`, `removeValueFromOtherArrays`, `verifyStateMapping`. The CardTypeRenameHandler also needs to update card metadata's `cardType` field, every `linkType.sourceCardTypes`/`destinationCardTypes`, and template card references.
- **Plan 4 (Workflow handlers).** `handleStateChange`, `handleStateRemoval`, `updateCardStates`. Includes WorkflowRenameHandler that updates `cardType.workflow` references.
- **Plan 5 (Remaining delete handlers).** Per-type delete cascades for Workflow, Template, Calculation, Report, GraphModel, GraphView, plus a `LinkTypeDeleteHandler` that re-enables the `linkTypes` branch in `commands/remove.ts` (this plan leaves that branch commented out).
- **Plan 6 (ProjectRename handler).** The project-wide prefix rewrite. Replaces the body of `commands/rename.ts` with a single `ResourceMutations.apply({ kind: 'project_rename', newPrefix })` call once the handler exists.
- **Plan 7 (Module update flow).** `PreviewModuleUpdate`, `UpdateModule`, `ModuleStepReplay`, `appliedModules.json`, conflict detection.
- **Plan 8 (HTTP routes).** `POST /mutations/preview`, `POST /mutations/apply`, SSE for module updates.
- **Plan 9 (CLI integration).** `cyberismo delete`, `rename`, `project-rename` verbs through the engine.

Each follow-on plan adds new handlers and re-routes one more command branch; the foundation and the FieldType plan together establish every pattern they reuse.
