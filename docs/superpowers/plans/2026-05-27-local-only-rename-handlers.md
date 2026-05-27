# Uniform Local-Only Scoping for Rename Handlers — Implementation Plan (Phase 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the card-type, workflow, link-type, and enum-value rename handlers obey `ReplayMutatesOnlyLocalState` — during replay against a consumer they rewrite only the consumer's own resources/cards and never touch (or fail on) module-owned ones.

**Architecture:** Two mechanical fixes, applied per handler, mirroring the pattern `FieldTypeRenameHandler` already implements. (1) **Foreign-skip:** guard the resource-level operation (`resource.rename` / `resource.update`) with `if (ctx.input.target.prefix === ctx.project.projectPrefix)` — for a foreign prefix the module's installed file is already at the post-rename state (placed by `applyModules`), so re-doing it both is wrong and throws (`'X not found'` / `Cannot update module resources`). The cross-resource cascade still runs, rewriting the consumer's references. (2) **Local-only cascade:** every cascade scan that *mutates* a resource or card uses `ResourcesFrom.localOnly` (or local templates), so the cascade never writes a module-owned resource/template.

**Tech Stack:** TypeScript, Node 22, ESM (`.js` imports), Vitest, `pnpm`. Reference implementation: `tools/data-handler/src/mutations/handlers/field-type-rename.ts` (foreign-skip at its step 3; `cardTypesReferencing` uses `ResourcesFrom.localOnly`). Tests mirror `tools/data-handler/test/mutations/handlers/field-type-rename.test.ts` ("skips module-owned…" / "rewrites a card type customField referencing a module-owned field…").

**Prerequisite:** Phase 1 (content-validation gate) merged. Independent of it at the code level, but the gate is what turns any residual local-only violation into a loud failure rather than silent corruption.

---

## Background: the reference pattern

`FieldTypeRenameHandler.apply` already does both fixes:

```typescript
    // 3. Perform the resource-level rename. Skip for foreign-prefixed
    //    targets: replay against a consumer only migrates consumer-side
    //    state; the module's installed file tree is the post-rename outcome
    //    already, placed by `applyModules`.
    if (ctx.input.target.prefix !== ctx.project.projectPrefix) {
      return;
    }
    const resource = ctx.project.resources.byType(oldName, 'fieldTypes');
    if (!resource) {
      throw new Error(`Field type '${oldName}' not found`);
    }
    await resource.rename(resourceName(newName));
```

and `cardTypesReferencing` scans `ctx.project.resources.cardTypes(ResourcesFrom.localOnly)`.

`field-type-rename` can early-`return` because the resource rename is its *last* step. Where a handler has cascade work *after* the resource op, wrap the op in an `if (local)` block instead of returning.

---

## File structure

**Modified source files:**
- `tools/data-handler/src/mutations/cascades/rewrite-refs.ts` — scope `rewriteCardContentRefs`'s template scan to local.
- `tools/data-handler/src/mutations/handlers/card-type-rename.ts` — foreign-skip the resource rename.
- `tools/data-handler/src/mutations/handlers/workflow-rename.ts` — foreign-skip the resource rename + `localOnly` `dependentCardTypes`.
- `tools/data-handler/src/mutations/handlers/link-type-rename.ts` — foreign-skip the resource rename + local-only template scan.
- `tools/data-handler/src/mutations/handlers/field-type-enum-rename.ts` — foreign-skip the resource update + local-only template scan.

**Modified test files (extend the existing per-handler test files):**
- `tools/data-handler/test/mutations/cascades/rewrite-refs.test.ts` (create if absent)
- `tools/data-handler/test/mutations/handlers/card-type-rename.test.ts`
- `tools/data-handler/test/mutations/handlers/workflow-rename.test.ts`
- `tools/data-handler/test/mutations/handlers/link-type-rename.test.ts`
- `tools/data-handler/test/mutations/handlers/field-type-enum-rename.test.ts`

---

## Tasks

### Task 1: `rewriteCardContentRefs` scans local cards only

**Files:**
- Modify: `tools/data-handler/src/mutations/cascades/rewrite-refs.ts`
- Test: `tools/data-handler/test/mutations/cascades/rewrite-refs.test.ts`

`rewriteCalculationRefs` and `rewriteHandlebarRefs` already use `ResourcesFrom.localOnly`. `rewriteCardContentRefs` does not — it scans `project.cards(undefined)` (local consumer cards, fine) plus `project.allTemplateCards()` (includes module-owned templates). During replay it would rewrite a module template card's content, violating read-only. Replace the module-inclusive template scan with local templates.

- [ ] **Step 1: Write the failing test**

Create/extend `tools/data-handler/test/mutations/cascades/rewrite-refs.test.ts` with a test that seeds a module-owned template card whose content references the old name and asserts the cascade leaves it untouched while rewriting a local card. Model the project/module seeding on `test/mutations/handlers/field-type-rename.test.ts` (the "skips the resource-file step when target is module-owned" test): copy the `decision-records` fixture, synthesize `.cards/modules/ext/` with a template containing a card whose content includes `ext/oldRef`, and a local card (under `cardRoot/`) whose content includes `ext/oldRef`. After `rewriteCardContentRefs(project, 'ext/oldRef', 'ext/newRef')`, assert the local card content is rewritten and the module template card content is unchanged.

> The exact seeding mirrors the module-fixture construction in `field-type-rename.test.ts`. If a local template helper does not exist, scope via `project.resources.templates(ResourcesFrom.localOnly).flatMap((t) => t.templateObject().cards())` exactly as `card-type-rename.ts` does.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd tools/data-handler && pnpm vitest run test/mutations/cascades/rewrite-refs.test.ts`
Expected: FAIL — the module template card's content is rewritten (the cascade currently includes it).

- [ ] **Step 3: Scope the template scan to local**

In `tools/data-handler/src/mutations/cascades/rewrite-refs.ts`, the file already imports `ResourcesFrom`. Replace the `allCards` construction in `rewriteCardContentRefs`:

```typescript
  const allCards = [
    ...project.cards(undefined),
    ...project.resources
      .templates(ResourcesFrom.localOnly)
      .flatMap((t) => t.templateObject().cards()),
  ];
```

(`project.cards(undefined)` are the consumer's own cards and stay; only the module-inclusive `allTemplateCards()` is replaced with local templates.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd tools/data-handler && pnpm vitest run test/mutations/cascades/rewrite-refs.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/data-handler/src/mutations/cascades/rewrite-refs.ts tools/data-handler/test/mutations/cascades/rewrite-refs.test.ts
git commit -m "$(cat <<'EOF'
fix: card-content cascade rewrites only local cards/templates

rewriteCardContentRefs scanned allTemplateCards (module-inclusive); during
replay that silently rewrote module-owned template cards. Scope to local
templates, matching rewriteCalculationRefs/rewriteHandlebarRefs.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `card-type-rename` foreign-skip

**Files:**
- Modify: `tools/data-handler/src/mutations/handlers/card-type-rename.ts`
- Test: `tools/data-handler/test/mutations/handlers/card-type-rename.test.ts`

Cascade scans are already `localOnly` (templates, link types). The only gap is step 3 (`card-type-rename.ts:64-71`): the resource rename runs unconditionally and throws `'CardType not found'` for a foreign prefix. Step 4 (link-type rewrite) must still run, so wrap step 3 in an `if (local)` block rather than returning.

- [ ] **Step 1: Write the failing test**

In `test/mutations/handlers/card-type-rename.test.ts`, add a foreign-replay test modelled on `field-type-rename.test.ts`'s module-owned test: seed a module `ext` whose install is already post-rename (`.cards/modules/ext/cardTypes/renamed.json` present, `old.json` absent), and a **local** card under `cardRoot/` whose `metadata.cardType` is `ext/cardTypes/old`. Run:

```typescript
const handler = new CardTypeRenameHandler();
await handler.apply({
  project: dedicatedProject,
  input: {
    kind: 'rename' as const,
    target: resourceName('ext/cardTypes/old'),
    newIdentifier: 'renamed',
  },
});
```

Assert: the local card's `metadata.cardType` is now `ext/cardTypes/renamed`, the call does **not** throw, and the module file `ext/cardTypes/renamed.json` is untouched (and `old.json` still absent).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd tools/data-handler && pnpm vitest run test/mutations/handlers/card-type-rename.test.ts`
Expected: FAIL with `CardType 'ext/cardTypes/old' not found` (step 3 looks up the old name on the already-renamed module install).

- [ ] **Step 3: Wrap the resource rename in a local-prefix guard**

In `tools/data-handler/src/mutations/handlers/card-type-rename.ts`, replace step 3 (`card-type-rename.ts:64-71`):

```typescript
    // 3. Rename the resource itself. Skip for foreign-prefixed targets:
    //    the module's installed file is already at the new name
    //    (applyModules placed it); only the consumer-side cascade applies.
    //    CardTypeResource.rename handles self-only prefix rewrites for
    //    customFields / alwaysVisibleFields / optionallyVisibleFields /
    //    workflow.
    if (ctx.input.target.prefix === ctx.project.projectPrefix) {
      const resource = ctx.project.resources.byType(oldName, 'cardTypes');
      if (!resource) {
        throw new Error(`CardType '${oldName}' not found`);
      }
      await resource.rename(resourceName(newName));
    }
```

(Step 4, the link-type rewrite, remains after this block and still runs.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd tools/data-handler && pnpm vitest run test/mutations/handlers/card-type-rename.test.ts`
Expected: PASS (existing tests + the new foreign-replay test).

- [ ] **Step 5: Commit**

```bash
git add tools/data-handler/src/mutations/handlers/card-type-rename.ts tools/data-handler/test/mutations/handlers/card-type-rename.test.ts
git commit -m "$(cat <<'EOF'
fix: card-type rename replay skips the resource op for foreign prefixes

Foreign-module card-type renames during replay no longer throw
'CardType not found' — the module's installed file is already renamed by
applyModules; only the consumer-side cascade runs.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `workflow-rename` foreign-skip + local-only card types

**Files:**
- Modify: `tools/data-handler/src/mutations/handlers/workflow-rename.ts`
- Test: `tools/data-handler/test/mutations/handlers/workflow-rename.test.ts`

Two gaps: (a) `dependentCardTypes` (`workflow-rename.ts:97-101`) scans `cardTypes()` (all) — updating a module-owned card type's `workflow` field would throw `Cannot update module resources`; scope to `localOnly`. (b) The resource lookup + rename (`workflow-rename.ts:56-59` and `:82`) run unconditionally and throw `'Workflow not found'` for a foreign prefix; move the lookup down next to the rename and guard both with `if (local)`.

- [ ] **Step 1: Write the failing test**

In `test/mutations/handlers/workflow-rename.test.ts`, add a foreign-replay test: seed module `ext` post-rename (`.cards/modules/ext/workflows/renamed.json` present, `old.json` absent) and a **local** card type whose `workflow` is `ext/workflows/old`. Run:

```typescript
const handler = new WorkflowRenameHandler();
await handler.apply({
  project: dedicatedProject,
  input: {
    kind: 'rename' as const,
    target: resourceName('ext/workflows/old'),
    newIdentifier: 'renamed',
  },
});
```

Assert: the local card type's `workflow` is now `ext/workflows/renamed`, no throw, and the module file is untouched. Add a second test seeding a **module-owned** card type referencing `ext/workflows/old` and assert the cascade leaves it unchanged (proving `localOnly` scoping).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd tools/data-handler && pnpm vitest run test/mutations/handlers/workflow-rename.test.ts`
Expected: FAIL — `Workflow 'ext/workflows/old' not found` (the early resource lookup), and/or `Cannot update module resources` when a module card type is in scope.

- [ ] **Step 3: Scope `dependentCardTypes` to local**

In `tools/data-handler/src/mutations/handlers/workflow-rename.ts`, add the import:

```typescript
import { ResourcesFrom } from '../../containers/project/resources-from.js';
```

Change `dependentCardTypes` (`workflow-rename.ts:97-101`):

```typescript
  private dependentCardTypes(ctx: MutationContext, workflowName: string) {
    return ctx.project.resources
      .cardTypes(ResourcesFrom.localOnly)
      .filter((ct) => ct.data?.workflow === workflowName);
  }
```

- [ ] **Step 4: Foreign-skip the resource rename**

In `apply` (`workflow-rename.ts:49-83`): remove the early lookup at `:56-59`, and replace the step-3 rename at `:79-82` with a guarded lookup+rename:

```typescript
    // 3. Rename the resource itself — skip for foreign prefixes (the
    //    module's installed file is already at the new name). The base
    //    class only moves the file and updates in-memory state; the
    //    cascade above already rewrote every consumer-side reference.
    if (ctx.input.target.prefix === ctx.project.projectPrefix) {
      const resource = ctx.project.resources.byType(oldName, 'workflows');
      if (!resource) {
        throw new Error(`Workflow '${oldName}' not found`);
      }
      await resource.rename(resourceName(newName));
    }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd tools/data-handler && pnpm vitest run test/mutations/handlers/workflow-rename.test.ts`
Expected: PASS (existing + the two new tests).

- [ ] **Step 6: Commit**

```bash
git add tools/data-handler/src/mutations/handlers/workflow-rename.ts tools/data-handler/test/mutations/handlers/workflow-rename.test.ts
git commit -m "$(cat <<'EOF'
fix: workflow rename replay is local-only

Foreign-prefix workflow renames skip the resource op (the install is
already renamed), and dependentCardTypes scans local card types only so
replay never tries to write a module-owned card type's workflow field.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `link-type-rename` foreign-skip + local-only template scan

**Files:**
- Modify: `tools/data-handler/src/mutations/handlers/link-type-rename.ts`
- Test: `tools/data-handler/test/mutations/handlers/link-type-rename.test.ts`

Gaps: (a) `affectedCards` (`link-type-rename.ts:86-94`) uses `allTemplateCards()` (module-inclusive); scope template cards to local. (b) step 3 resource rename (`:71-75`) runs unconditionally; wrap in `if (local)`.

- [ ] **Step 1: Write the failing test**

In `test/mutations/handlers/link-type-rename.test.ts`, add a foreign-replay test: seed module `ext` post-rename (`.cards/modules/ext/linkTypes/renamed.json` present, `old.json` absent) and a **local** card under `cardRoot/` whose `metadata.links` contains a link with `linkType: 'ext/linkTypes/old'`. Run `handler.apply({ project, input: { kind: 'rename', target: resourceName('ext/linkTypes/old'), newIdentifier: 'renamed' } })`. Assert the local card's link `linkType` is rewritten to `ext/linkTypes/renamed`, no throw, module file untouched.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd tools/data-handler && pnpm vitest run test/mutations/handlers/link-type-rename.test.ts`
Expected: FAIL with `Link type 'ext/linkTypes/old' not found`.

- [ ] **Step 3: Scope the template scan to local and import `ResourcesFrom`**

In `tools/data-handler/src/mutations/handlers/link-type-rename.ts`, add:

```typescript
import { ResourcesFrom } from '../../containers/project/resources-from.js';
```

Change `affectedCards` (`link-type-rename.ts:86-94`):

```typescript
  private affectedCards(ctx: MutationContext, oldName: string): Card[] {
    const all = [
      ...ctx.project.cards(undefined),
      ...ctx.project.resources
        .templates(ResourcesFrom.localOnly)
        .flatMap((t) => t.templateObject().cards()),
    ];
    return all.filter((c) =>
      c.metadata?.links?.some((l) => l.linkType === oldName),
    );
  }
```

- [ ] **Step 4: Foreign-skip the resource rename**

Replace step 3 (`link-type-rename.ts:68-75`):

```typescript
    // 3. Rename the resource itself — skip for foreign prefixes (the
    //    module's installed file is already at the new name). LinkTypeResource
    //    .rename handles self-only sourceCardTypes / destinationCardTypes
    //    rewrites.
    if (ctx.input.target.prefix === ctx.project.projectPrefix) {
      const resource = ctx.project.resources.byType(oldName, 'linkTypes');
      if (!resource) {
        throw new Error(`Link type '${oldName}' not found`);
      }
      await resource.rename(resourceName(newName));
    }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd tools/data-handler && pnpm vitest run test/mutations/handlers/link-type-rename.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tools/data-handler/src/mutations/handlers/link-type-rename.ts tools/data-handler/test/mutations/handlers/link-type-rename.test.ts
git commit -m "$(cat <<'EOF'
fix: link-type rename replay is local-only

Foreign-prefix link-type renames skip the resource op; the card scan uses
local templates only so replay never rewrites module-owned template cards.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: `field-type-enum-rename` foreign-skip + local-only template scan

**Files:**
- Modify: `tools/data-handler/src/mutations/handlers/field-type-enum-rename.ts`
- Test: `tools/data-handler/test/mutations/handlers/field-type-enum-rename.test.ts`

This handler renames an *enum value* within a field type (`kind: 'edit'`, key `enumValues`, change op). Gaps: (a) `affectedCards` (`field-type-enum-rename.ts:80-90`) uses `allTemplateCards()`; scope to local templates. (b) step 2 (`:62-67`) applies the enum-array change to the resource via `resource.update` — for a foreign field type this throws `Cannot update module resources` (the install already has the new enum array); wrap in `if (local)`.

- [ ] **Step 1: Write the failing test**

In `test/mutations/handlers/field-type-enum-rename.test.ts`, add a foreign-replay test. Seed module `ext` with a field type `ext/fieldTypes/state` whose install already carries the **renamed** enum value (e.g. enumValues `[{ enumValue: 'done' }]`, the old `closed` absent), and a **local** card whose `metadata['ext/fieldTypes/state']` is `'closed'`. Build the edit input mirroring `field-type-enum-rename.ts`'s `matches`:

```typescript
const handler = new FieldTypeEnumRenameHandler();
await handler.apply({
  project: dedicatedProject,
  input: {
    kind: 'edit' as const,
    target: resourceName('ext/fieldTypes/state'),
    updateKey: { key: 'enumValues' },
    operation: {
      name: 'change',
      target: { enumValue: 'closed' },
      to: { enumValue: 'done' },
    },
  },
});
```

Assert: the local card's `metadata['ext/fieldTypes/state']` is now `'done'`, no throw, and the module field type file is untouched.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd tools/data-handler && pnpm vitest run test/mutations/handlers/field-type-enum-rename.test.ts`
Expected: FAIL with `Cannot update module resources` (step 2 calls `resource.update` on the module-owned field type).

- [ ] **Step 3: Scope the template scan to local and import `ResourcesFrom`**

In `tools/data-handler/src/mutations/handlers/field-type-enum-rename.ts`, add:

```typescript
import { ResourcesFrom } from '../../containers/project/resources-from.js';
```

Change `affectedCards` (`field-type-enum-rename.ts:80-90`):

```typescript
  private affectedCards(
    ctx: MutationContext,
    fieldName: string,
    value: string,
  ): Card[] {
    const all = [
      ...ctx.project.cards(undefined),
      ...ctx.project.resources
        .templates(ResourcesFrom.localOnly)
        .flatMap((t) => t.templateObject().cards()),
    ];
    return all.filter((c) => c.metadata?.[fieldName] === value);
  }
```

- [ ] **Step 4: Foreign-skip the resource update**

Replace step 2 (`field-type-enum-rename.ts:62-67`):

```typescript
    // 2. Apply the enum-array change to the resource definition — skip for
    //    foreign prefixes (the module's installed field type already carries
    //    the renamed enum value, placed by applyModules). Only the
    //    consumer-side card values (step 1) need rewriting on replay.
    if (ctx.input.target.prefix === ctx.project.projectPrefix) {
      const resource = ctx.project.resources.byType(fieldName, 'fieldTypes');
      if (!resource) {
        throw new Error(`Field type '${fieldName}' not found`);
      }
      await resource.update(ctx.input.updateKey, ctx.input.operation);
    }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd tools/data-handler && pnpm vitest run test/mutations/handlers/field-type-enum-rename.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tools/data-handler/src/mutations/handlers/field-type-enum-rename.ts tools/data-handler/test/mutations/handlers/field-type-enum-rename.test.ts
git commit -m "$(cat <<'EOF'
fix: enum-value rename replay is local-only

Foreign-prefix enum-value renames skip the resource update (the install
already carries the renamed value); the card scan uses local templates
only so replay never rewrites module-owned template cards.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Build, lint, full suite**

Run: `cd tools/data-handler && pnpm build && pnpm lint && pnpm vitest run`
Expected: build clean, lint clean, all tests PASS. Confirms the four handlers + shared cascade now uphold `ReplayMutatesOnlyLocalState` and no existing behaviour regressed (interactive local renames still perform the resource op, since their prefix equals the project prefix).

---

## Self-review notes

- **Spec coverage:** Implements `ReplayMutatesOnlyLocalState` for the remaining rename handlers (Phase 1's gate covers the failure surfacing; `field-type-rename` was already compliant). Each handler keeps interactive local-rename behaviour intact — the guard's condition (`target.prefix === project.projectPrefix`) is true for local edits, so the resource op runs exactly as before.
- **Consistency:** every cascade scan that *writes* (`cardTypes`, templates, calculations, handlebars, card content) now resolves through `ResourcesFrom.localOnly`. `project.cards(undefined)` is left as-is — those are the consumer's own cards and are the legitimate target of replay.
- **Pattern parity:** all four handlers now match `field-type-rename`'s shape (cascade rewrites consumer references; resource op guarded by prefix). `field-type-rename` early-returns because its resource op is last; the others wrap in `if (local)` because cascade work follows.

## Open questions / boundary

- `project.updateCardMetadata` / `updateCardContent` on a module-owned card do not currently throw (cards aren't `ResourceObject`s with the module-write guard), so the template-scan fixes prevent *silent* module mutation rather than a crash. The crash-causing gap is the resource-level op (Tasks 2–5 step "foreign-skip"). If a future change adds a module-write guard to cards, these scans are already correctly scoped.
- This plan does not touch `ProjectRenameHandler` (prefix rename). A consumer never replays a foreign module's project-rename as a local op in the current model; if that changes, it needs the same treatment.
