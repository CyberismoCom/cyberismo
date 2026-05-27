# Replay = Consumer-Side Cascade Only — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.
>
> **Supersedes** `2026-05-27-local-only-rename-handlers.md` (Phase 2 — only covered 4 rename handlers) and `2026-05-27-phase3-validation-contract.md` (Phase 3 — validation move). Those were scoped too narrowly; this plan absorbs both with the full handler set the survey found.

**Goal:** Replaying a module's sealed migration log against a consumer must (1) write **only the consumer's own resources and cards** — never the module's own resources (those arrive via `applyModules` install) — and (2) **not re-run per-operation referential validation**. The project content gate (`commands/validate.ts`, wired as the Phase-1 `ModuleValidationFailedError` gate) validates the replay *result*. Interactive edits keep validating as preconditions.

**Why this is needed (survey findings):**
- Replay currently works end-to-end **only for field-type renames** — `field-type-rename.ts` is the *only* handler with the foreign-prefix skip (commit `79f622b0`). Every other handler (the other 3 renames + ~13 edit/delete handlers) calls `resource.update/.rename/.delete` unconditionally, so replaying any non-field-type module migration hits `Cannot update module resources` / `Cannot rename module resources` (`resources/resource-object.ts:529/456/595/626`). Importing/updating a module with workflows, card types, link types, reports, etc. breaks on the replay pass.
- `CardTypeResource.validateFieldType` (referential: "custom field → field type exists", `card-type-resource.ts:119-154`) fires during the *consumer-side* cascade on **local** card types that reference a module's renamed field, against the post-install (renamed) state — the bug this whole effort chased. It is the one cross-resource referential check that fires problematically during replay.
- Both are facets of one model: **replay runs only the consumer-side cascade.**

**The model:** every mutation handler's `apply` is two parts — **(R)** the resource-level op on the *target* resource (write/rename/delete/update), and **(C)** the consumer-side cascade that rewrites *references* to that resource across the project. On replay, the target is module-owned (foreign prefix); part **(R)** is skipped (the install already produced the new resource) and only part **(C)** runs, scoped to **local** resources/cards. Per-operation referential validation is a **precondition in `plan()`** (interactive), never in `apply` (replay).

**Tech Stack:** TypeScript, Node 22, ESM (`.js` imports), Vitest, `pnpm`. Reference implementation for the skip pattern: `tools/data-handler/src/mutations/handlers/field-type-rename.ts`. Module-write guards: `resources/resource-object.ts:456` (rename), `:529` (update), `:595` (write/postUpdate), `:626` (delete). Replay entry: `mutations/module-update/replay.ts:78` → `ResourceMutations.apply(input, {bypassFingerprint:true})` → `mutations/plan.ts` → `handler.apply(ctx)`.

**Prerequisite:** Phase 1 (the content-validation gate) merged — `d022aa69`.

---

## Canonical foreign-skip pattern

From `field-type-rename.ts` — the shape to replicate. Part (C) (cascade) runs first and unconditionally on local state; part (R) (the resource op) is guarded by the prefix check:

```typescript
// (C) cascade: rewrite consumer references — LOCAL only.
//   ...rewrite local cards' metadata / local card types' customFields /
//      local link types' card-type lists, all via ResourcesFrom.localOnly...

// (R) resource op: skip for foreign-prefixed targets — the module's own
//   file is already at the post-migration state (placed by applyModules);
//   replaying against a consumer only migrates consumer-side state.
if (ctx.input.target.prefix === ctx.project.projectPrefix) {
  const resource = ctx.project.resources.byType(oldName, '<type>');
  if (!resource) throw new Error(`<Type> '${oldName}' not found`);
  await resource.rename(/* or .update / .delete */ ...);
}
```

Where the resource op is the handler's **last** statement, an early `return` for foreign prefixes (as field-type-rename does) is equivalent. Where cascade work follows it, wrap in the `if` block so the cascade still runs.

**Per-handler test shape** (mirror `field-type-rename.test.ts`'s "module-owned" tests): seed a foreign module `ext` whose install is already post-migration; seed a **local** resource/card that references the changed `ext` resource; run `handler.apply` with a foreign-prefixed target; assert the local reference is rewritten, **no throw**, and the module's own file is untouched.

---

## Group 1 — Foreign-skip across all handlers (foundational)

Each task: apply the canonical pattern to the family's handlers (guard part R, scope part C to `localOnly`), with a foreign-replay test per handler. Survey file:line in parentheses are the unconditional resource-op call sites to guard.

### Task 1.1: card-type handlers

**Files:** `mutations/handlers/card-type-rename.ts` (resource op `:71`; link-type cascade `:74` already `localOnly`), `card-type-add-custom-field.ts` (`:44`), `card-type-remove-custom-field.ts` (`:49/:61/:67`), `card-type-workflow-change.ts` (`:55`), `card-type-delete.ts` (`:54` delete, `:85` link-type update). Tests: each handler's test file.

- [ ] For each: identify part (R) (the `resource.update/.rename/.delete` on the *target* card type) and part (C) (rewrites of cards' `cardType`, link types' `sourceCardTypes/destinationCardTypes`, templates). Guard (R) with the prefix check; ensure (C) scans use `ResourcesFrom.localOnly`.
- [ ] `card-type-delete`: the delete is part (R) (skip for foreign); the consumer cascade (clear/drop cards of that type, fix link types) is part (C) (local). Note: a module deleting its own card type, replayed at a consumer, must clear *consumer* cards/links referencing it but not touch the module's files.
- [ ] Failing test per handler (canonical shape), implement, pass, commit per handler or per small batch.

### Task 1.2: field-type handlers

**Files:** `field-type-enum-add.ts` (`:39`), `field-type-enum-remove.ts` (`:70`), `field-type-enum-rename.ts` (`:67`), `field-type-data-type.ts` (`:99`), `field-type-delete.ts` (`:44/:62`). (`field-type-rename.ts` already done.)

- [ ] Same pattern. For the enum handlers, part (R) is the `resource.update` of the field type's `enumValues`; part (C) is rewriting affected *local* cards' stored enum values (enum-rename) — already scoped local in Phase-2-draft Task 5; fold it in here. `field-type-delete`: skip the resource delete for foreign; clear the field from *local* cards/card types.
- [ ] Failing test per handler, implement, pass, commit.

### Task 1.3: workflow handlers

**Files:** `workflow-rename.ts` (`:69/:82`), `workflow-rename-state.ts` (`:67/:82`), `workflow-add-state.ts` (`:39`), `workflow-remove-state.ts` (`:94`), `workflow-transition.ts` (`:35`), `workflow-delete.ts` (`:80`, + inner card-type-delete).

- [ ] Same pattern. Part (R) is the workflow `resource.update/.rename/.delete`; part (C) is rewriting *local* card types' `workflow` field, *local* cards' `workflowState`, and calculation/handlebar refs (use the `localOnly` cascade helpers — note `rewriteCardContentRefs` itself needs the `localOnly` template fix from the old Phase-2 plan; include it here).
- [ ] `workflow-remove-state` / `workflow-rename-state`: the per-state changes are part (R) on the module's workflow → skip for foreign; the consumer cascade rewrites *local* cards' `workflowState` for affected states.
- [ ] Failing test per handler, implement, pass, commit.

### Task 1.4: link-type handlers + shared cascade helper

**Files:** `link-type-rename.ts` (`:75`), `link-type-delete.ts` (`:61`), `mutations/cascades/rewrite-refs.ts` (`rewriteCardContentRefs` template scan → `localOnly`).

- [ ] Apply the pattern to the two link-type handlers. Fix `rewriteCardContentRefs` to scan local templates only (it currently uses `allTemplateCards()`; the other two rewrite helpers already use `localOnly`).
- [ ] `project-rename.ts` — **already safe** (iterates `localOnly` and skips non-matching prefixes, `:99`); add a confirming test, no change.
- [ ] Failing tests, implement, pass, commit.

---

## Group 2 — Validation move (precondition in plan, not in apply)

### Task 2.1: `Handler.validate` hook + `plan()` invokes it

**Files:** `mutations/handler.ts`, `mutations/plan.ts`; Test: `test/mutations/plan.test.ts`.

- [ ] Add `validate?(ctx: MutationContext): Promise<void>` to the `Handler` interface (after `preview`). In `ResourceMutations.plan()`, after `const handler = dispatch(ctx);`, add `await handler.validate?.(ctx);`. Leave `apply()` untouched (it must not call `validate`). Land with Task 2.2 (the hook is only observable once a handler implements it).

### Task 2.2: Lift `validateFieldType` to handlers; make `update` pure

**Files:** `mutations/handlers/card-type-add-custom-field.ts`, `field-type-rename.ts`, `resources/card-type-resource.ts`; Tests: the respective handler test files.

- [ ] **Failing test:** (a) `plan()` of an add-customField referencing a nonexistent field type rejects with `/does not exist/`; (b) `apply({bypassFingerprint:true})` of the same applies without rejecting (replay path).
- [ ] `CardTypeAddCustomFieldHandler.validate(ctx)`:

```typescript
  async validate(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'edit') return;
    const fieldName = this.fieldName(
      ctx.input.operation as AddOperation<CustomField | string>,
    );
    if (!ctx.project.resources.exists(fieldName)) {
      throw new Error(`Field type '${fieldName}' does not exist in the project`);
    }
  }
```

- [ ] `FieldTypeRenameHandler.validate(ctx)`: for an interactive (local-prefix) rename, assert the old field type exists. (For foreign prefix it's a replay — return; Group 1 already skips the resource op.)
- [ ] Remove the referential branch (`fieldTypeExists` + the interim `change`-op either-endpoint fallback from `79f622b0`) from `CardTypeResource.validateFieldType`/`update`. Keep the visible-field `hasFieldType` self-check and the schema validation in `postUpdate` (both replay-safe; they stay).
- [ ] Tests pass; commit.

### Task 2.3 (optional, consistency): lift workflow-exists referential checks

**Files:** `mutations/handlers/card-type-workflow-change.ts`, `resources/card-type-resource.ts` (`createCardType`).

- [ ] Move the "workflow exists" referential check (create-time `createCardType:162-180`; the workflow-change handler `:59-64` and its state-mapping ref checks `verifyStateMapping:110-150`) into the relevant `validate`. These are interactive/create-time (no replay problem), so this is a *consistency* move — all cross-resource referential validation in the handler layer — not a correctness fix. Skip if minimising scope.

---

## Group 3 — Link-type referential gap (currently unchecked anywhere)

**Files:** `mutations/handlers/link-type-*` (a `validate`), and optionally `commands/validate.ts`.

- [ ] `LinkTypeResource.update` does **not** validate that `sourceCardTypes`/`destinationCardTypes` reference existing card types, and `commands/validate.ts` has **no** link-type validation at all. Add the existence check as a `validate` precondition on the link-type edit handler(s), and (recommended) add a link-type referential pass to `commands/validate.ts` so the project gate catches it on replay/import. This closes a real hole the survey found.

---

## Group 4 — Deduplicate the referential rule (optional follow-up)

**Files:** `resources/`, `commands/validate.ts`.

- [ ] The "custom field → field type exists" rule is implemented twice: the new `CardTypeAddCustomFieldHandler.validate` and `commands/validate.ts:validateCustomFields:760-774` / `validateArrayOfFields:374-403`. Extract one shared referential primitive both call (handler at op scope, gate at project scope) so they can't drift. Defer if minimising scope — it's a cleanup, not a correctness fix.

---

## Group 5 — Verification

- [ ] `cd tools/data-handler && pnpm build && pnpm lint && pnpm vitest run` — clean. **Note:** the live-git and import-a-git-`base` tests require network; in a sandbox without it they fail with `block timeout reached` / clone errors — those are environmental, not regressions. Confirm any failures are only those.
- [ ] End-to-end: the `setup-modules.sh` flow should now work for a module that renames a **card type / workflow / link type** (not just a field type) — the whole point of Group 1.

---

## Self-review notes

- **Two mechanisms, one model.** Group 1 (foreign-skip everywhere) makes replay write only consumer state; Group 2 (validation move) makes replay not re-validate per-op. Both follow from "replay runs only the consumer-side cascade."
- **No ambient flag.** Foreign-skip keys off `ctx.input.target.prefix`; the validation precondition lives in `plan()` (interactive) and is skipped by `apply()`-only replay. Both are structural.
- **What stays in resources:** schema validation and internal-consistency self-checks (enum no-dup, dataType guards, workflow shape, "one New-Card transition", delete-usage) — they validate the resource's own content, are replay-safe, and are not hit on replay once part (R) is foreign-skipped.
- **Scope honesty:** Group 1 is the bulk (~17 handlers, mechanical pattern) and is *foundational* (replay is broken without it). Group 2 is small and surgical. Group 3 closes a genuine gap. Group 4 is optional cleanup. Land Group 1 first.
- **Interactive unaffected:** every change keys off foreign-prefix / plan-phase, so local interactive edits behave exactly as before (their prefix equals the project's; they run `plan()`).
