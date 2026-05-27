# Replay = Consumer-Side Cascade Only, via a Machinery-Owned Handler Contract — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Replaying a module's sealed migration log against a consumer must (1) write **only** the consumer's own resources/cards — never the module's own resources (those arrive via `applyModules` install) — and (2) **not** re-run per-operation referential validation. The project content gate validates the *result*. Interactive edits validate as preconditions. **Crucially, the "what runs during replay vs interactive" policy lives in the machinery, not scattered across every handler.**

**Why the machinery owns it:** the previous approach put a `ctx.input.target.prefix === ctx.project.projectPrefix` skip inside every handler — 17 copies of one policy, forget-prone for new handlers (research weirdness #4). Instead we split the handler contract so the machinery sequences the parts and decides what to skip, in one place.

**Why it can't be zero-handler-change:** a handler's `apply` interleaves the **cascade** (rewrite the consumer's references) with the **resource-op** (write/rename/delete the target resource) and a **lookup** (`byType(oldName)` that throws `'not found'` when the target is foreign/renamed post-install). The machinery calls `apply` as a black box and can't skip just the resource-op/lookup. So handlers must *expose* their parts; then the machinery owns the policy.

---

## The new Handler contract

`mutations/handler.ts` — split the monolithic `apply` into named parts (transitional: legacy `apply` stays optional during migration, removed at the end):

```typescript
export interface Handler {
  matches(ctx: MutationContext): boolean;
  readonly isBreaking: boolean;
  preview(ctx: MutationContext): Promise<CascadePreview>;
  affectedFilePaths(ctx: MutationContext): Promise<string[]>;

  /** Precondition (referential checks). Run by plan(); NOT by apply(). */
  validate?(ctx: MutationContext): Promise<void>;

  /** Rewrite the consumer's LOCAL references. Always run by apply(). */
  applyCascade?(ctx: MutationContext): Promise<void>;
  /** Write/rename/delete the TARGET resource. Run by apply() only when the
   *  target is local (skipped on foreign-module replay — install did it). */
  applyResourceOp?(ctx: MutationContext): Promise<void>;

  /** @deprecated legacy single-method apply; migrate to the split above. */
  apply?(ctx: MutationContext): Promise<void>;
}
```

`mutations/plan.ts`:
- `plan()` — after `dispatch`, `await handler.validate?.(ctx);` then `preview` + fingerprint as today.
- `apply()` — replace the `handler.apply(ctx)` call (inside the existing lock + recordLogEntry block) with:
  ```typescript
  if (handler.applyCascade || handler.applyResourceOp) {
    await handler.applyCascade?.(ctx);
    if (ctx.input.target.prefix === ctx.project.projectPrefix) {
      await handler.applyResourceOp?.(ctx);
    }
  } else {
    await handler.apply!(ctx); // legacy, pre-migration
  }
  ```
  (`recordLogEntry` for breaking changes stays where it is.)

This makes interactive (`plan`→`apply`) validate + run both parts; replay (`apply`-only, foreign target) skips `validate` and `applyResourceOp`, running only `applyCascade`. **One place. No per-handler prefix checks, no ambient flag.**

**Tech Stack:** TypeScript, Node 22, ESM (`.js` imports), Vitest, `pnpm`. Reference for the cascade/resource-op split: `field-type-rename.ts` already separates cascade (steps 1–2) from the resource rename (step 3). Module-write guards: `resources/resource-object.ts:456/529/595/626`. Replay entry: `mutations/module-update/replay.ts:78`.

**Prerequisite:** Phase-1 gate merged (`d022aa69`).

---

## Tasks

### Task 1: Machinery + contract (foundational, no handler behaviour change)

**Files:** `mutations/handler.ts`, `mutations/plan.ts`; Test: `test/mutations/plan.test.ts`.

- [ ] Add `validate?`, `applyCascade?`, `applyResourceOp?` to `Handler` (keep `apply?` for now).
- [ ] Wire `plan()` (calls `validate?`) and `apply()` (cascade-always + resource-op-if-local, else legacy `apply`).
- [ ] **Failing test** with a fake handler: `applyCascade` runs on both local and foreign targets; `applyResourceOp` runs only when the target prefix equals the project prefix; `validate` runs in `plan()` and not in `apply()`. Implement, pass.
- [ ] Build/lint (all existing handlers still use legacy `apply` → unchanged). Commit (`feat: machinery-owned handler contract (validate/applyCascade/applyResourceOp)`).

### Tasks 2–5: Migrate each handler family to the split

Per handler: move reference-rewrites into `applyCascade` (scoped `ResourcesFrom.localOnly`; template cards via `templates(localOnly).flatMap(t => t.templateObject().cards())`, not `allTemplateCards()`), move the target write/rename/delete + its lookup into `applyResourceOp`, move any cross-resource **referential** precondition into `validate`, and delete the legacy `apply`. Add a foreign-replay test per handler (seed a foreign module post-install + a local reference; assert the local ref is rewritten, no throw, module file untouched) and keep the interactive test green.

- [ ] **Task 2 — card-type:** `card-type-rename` (consolidate the post-rename link-type rewrite into `applyCascade`), `card-type-add-custom-field` (validate: field type exists; cascade: add null on local cards; resource-op: add to card type), `card-type-remove-custom-field`, `card-type-workflow-change` (validate: new workflow exists; cascade: rewrite local cards' workflowState; resource-op: set workflow), `card-type-delete`.
- [ ] **Task 3 — field-type:** `field-type-enum-add`/`-remove`/`-rename`, `field-type-data-type`, `field-type-delete`. (`field-type-rename` already split-ish — migrate it to the named methods for consistency.)
- [ ] **Task 4 — workflow:** `workflow-rename`, `workflow-rename-state`, `workflow-add-state`, `workflow-remove-state`, `workflow-transition`, `workflow-delete`. Cascade rewrites local cards' `workflowState` + local card types' `workflow`.
- [ ] **Task 5 — link-type:** `link-type-rename`, `link-type-delete`; fix `mutations/cascades/rewrite-refs.ts` `rewriteCardContentRefs` to scan local templates only. `project-rename` is already local-only — migrate to the contract (its resource-ops are local by construction) + a confirming test.

### Task 6: Make resources pure of the lifted referential checks

**Files:** `resources/card-type-resource.ts` (+ any others Tasks 2–5 lifted from).

- [ ] Remove `validateFieldType`'s referential branch (`fieldTypeExists` + the interim either-endpoint fallback from `79f622b0`) now that it lives in the handlers' `validate`. Keep the visible-field `hasFieldType` self-check and schema validation in `postUpdate` (replay-safe, stay). Verify the only remaining callers are gone; tests green.

### Task 7: Link-type referential gap

- [ ] Add source/destination card-type existence validation as the link-type handlers' `validate` (currently checked *nowhere*), and add a link-type referential pass to `commands/validate.ts` so the project gate catches it.

### Task 8: Cleanup + dedup (optional) + verify

- [ ] Remove the legacy `apply?` from the `Handler` interface and make `applyCascade`/`applyResourceOp` required (all handlers migrated). Delete any dead resource-layer validation helpers.
- [ ] (Optional) Dedupe the "custom field → field type exists" rule between `validate` and `commands/validate.ts:validateCustomFields` via a shared referential primitive.
- [ ] `cd tools/data-handler && pnpm build && pnpm lint && pnpm vitest run` — clean (network-only live-git/import-base failures are environmental: `block timeout reached`). End-to-end: `setup-modules.sh` flow now works for a module that renames a card type / workflow / link type, not just field types.

---

## Self-review notes

- **Policy in one place.** `ResourceMutations.apply` decides "run `applyResourceOp` only for local targets"; `plan()` decides "run `validate`". No handler repeats it; new handlers get it for free by implementing the parts.
- **Foreign-skip + validation move unified.** Both fall out of the same contract — `applyResourceOp` (skipped on foreign replay) and `validate` (skipped on replay because replay never plans).
- **Transitional safety.** Legacy `apply` stays during migration so the families can be migrated and reviewed one at a time; Task 8 removes it once all are on the split.
- **What stays in resources:** schema validation + internal-consistency self-checks (enum no-dup, dataType guards, workflow shape, "one New-Card transition", delete-usage) — replay-safe, not hit once `applyResourceOp` is skipped for foreign targets.
- **Interactive unchanged:** the local-prefix condition is true for interactive edits, so they run both apply parts and `validate` exactly as before.
- **Ordering caveat:** handlers that interleave cascade→resource→cascade (e.g. card-type-rename's post-rename link-type rewrite) consolidate all cascade into `applyCascade` — a safe reorder, since cascades are string-reference rewrites independent of the resource op; verify per handler.
