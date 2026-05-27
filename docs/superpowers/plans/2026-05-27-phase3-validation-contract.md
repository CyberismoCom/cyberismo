# Two-Mode Validation Contract — Plan (Phase 3)

> **For agentic workers:** This phase is **spec-only**. There is no production code to write — the existing behaviour already implements the contract; Phase 3 documents it so the two modes stop getting conflated.

**Goal:** Make explicit, in `migration-system.allium`, that validation has two modes — a *precondition* for own-project edits and a *result gate* for module updates — so future work doesn't drift back toward operation-time validation of replay (the source of the bugs this whole effort chased).

**Why no code:** Investigation during planning (see history) established that the per-operation referential check is already correct, including the "interim" either-endpoint check, which is in fact the right precondition for a reference-rename in flight (the resource file is renamed *after* the reference cascade for a local rename, so the old name is the valid endpoint then; for a foreign replay `applyModules` has placed the new name, so that's the valid endpoint). "Validate the destination only" was tried and rejected because it breaks local renames. So there is nothing to strip, no replay-skip flag, and no preview-content recomputation. The Phase 1 gate already supplies the module-update result check.

---

## The contract (as written into the spec)

**Own-project edits → precondition.** The operation is validated before it applies; a bad edit (e.g. a custom field referencing a non-existent field type) is rejected and nothing is written. `payload_valid` = well-formedness; the referential precondition = "the reference this operation introduces resolves." A rename is a reference-in-flight: exactly one endpoint is on disk depending on the path, so the precondition accepts either endpoint and only "neither present" is an error.

**Module-update replay → result gate.** Replay applies a trusted, author-sealed sequence and does not enforce per-step validity (intermediate states are legitimately inconsistent mid-cascade). The single `project_content_valid` gate after the whole replay decides success; failure recovers via autocommit rollback or `git restore`. The strict dependency-ordered alternative was rejected: its edge cases (transient mid-cascade states, hybrid direct+transitive modules, multi-project ordering) make per-step validity unreliable to guarantee. This is also why the topo-sort was dropped.

---

## Tasks

### Task 1: Record the two-mode contract in the spec

**Files:**
- Modify: `migration-system.allium` (Deferred Specifications section)

- [ ] **Step 1: Replace the over-absolute "validate the result, never the operation" note** with the two-mode contract above (done in this branch — verify the Deferred Specifications section reads as the contract, covering both the author-edit precondition incl. the in-flight-rename either-endpoint rule, and the module-update result gate).

- [ ] **Step 2: Verify against the language reference** (`allium check` if the CLI is available; otherwise re-read). Comments-only change; no structural impact.

- [ ] **Step 3: Commit**

```bash
git add migration-system.allium
git commit -m "$(cat <<'EOF'
docs(spec): two-mode validation contract for migration-system

Own-project edits validate as a precondition (incl. the in-flight-rename
either-endpoint rule); module updates validate the result via the
project_content_valid gate. Replaces the over-absolute "never validate
the operation" note. No code change — existing behaviour already
implements this.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Out of scope / tracked elsewhere

- **`validateFieldType` interim check** stays as-is — it is the correct in-flight-rename precondition, not a hack to remove. No revert.
- **Report `.schema` loss** (gate surfaced it on `show imported report`): a *separate* pre-existing bug — the `defaultReport` asset has the `.schema` and `createReport` copies it, so the loss is in the import/copy path or shared-test state, not in `create`. Needs its own focused diagnosis; do not bundle it here.
