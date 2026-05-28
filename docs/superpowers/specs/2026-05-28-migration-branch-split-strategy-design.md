# Migration Branch Split Strategy — Design

**Status:** Draft, awaiting user review
**Date:** 2026-05-28
**Source branch:** `migration-imp` (50 commits, 139 files, +27,742 / −1,686 vs `main`)

## Goal

Land the resource-migration work from `migration-imp` into `main` as a sequence of independently reviewable, individually revertable PRs — without sacrificing the clean end-state of each file.

## Constraints

- **Reviewer bandwidth.** A 27k-line PR is not reviewable in one sitting.
- **Risk isolation.** Each landed piece must leave `main` in a working state and be revertable in isolation.
- **Speed matters.** Not at the cost of the above, but a 6-month review chain is not acceptable.
- **End-state per file.** The existing commits on `migration-imp` include intermediate refactors that were superseded by later commits. Each new PR should reflect the *final* shape of the files it owns, not replay the noisy commit history.
- **All migration-imp-only docs dropped.** The `docs/superpowers/plans/2026-05-20-*.md` files, `docs/superpowers/migration-system-executor-prompt.md`, and the repo-root files `migration-system.allium`, `migration-system.md`, `migrations-plan.adoc`, `AGENT_CONTEXT.md` are all migration-imp additions and none land in main. The system is documented by the code itself plus this split-strategy spec.

## Approach: Option B — Foundation to main, rest via integration branch

PR1 (foundation + LinkType end-to-end) targets `main` directly. The foundation is self-contained: the new `mutations/` engine and one handler (LinkType) coexist with the unchanged in-resource cascade code for every other resource. After PR1, `migration-integration` is branched off `main` and becomes the merge target for PRs 2–10. A final merge takes `migration-integration` into `main`.

### Why not Option A (everything via integration)
Foundation can stand alone in `main`. Landing it early surfaces architecture concerns before nine more PRs are drafted, and shrinks the eventual integration→main diff.

### Why not Option C (sequential PRs to main, no integration)
Serializes review turnaround across 10+ PRs. Every in-flight PR has to keep rebasing on a moving `main`. The integration branch absorbs that churn instead.

## Branch topology

```
main
 │
 ├─► PR1: foundation + LinkType (against main)
 │       │
 │       ▼
 │   main moves up
 │       │
 ├─► migration-integration (branched off main after PR1 lands)
 │       │
 │       ├─► PR2  CardType handlers
 │       ├─► PR3  FieldType handlers
 │       ├─► PR4  Workflow handlers
 │       ├─► PR5  Leaf renames (Calc, Report, GraphModel, GraphView, Template)
 │       ├─► PR6  ProjectRename
 │       ├─► PR7  "Handlers own cascade" cleanup
 │       ├─► PR8  Module-update replay engine
 │       ├─► PR9  HTTP routes + SSE
 │       └─► PR10 Validation gate + local-only scoping
 │
 └─► Final PR: migration-integration → main (merge, not squash)
```

## PR scope

| # | Target | Title | Scope | Rough size |
|---|---|---|---|---|
| 1 | `main` | mutation engine foundation + LinkType | `mutations/{handler,dispatcher,fingerprint,plan,types}.ts`, `mutations/handlers/{default-no-cascade,link-type-rename,link-type-delete}.ts`, `mutations/cascades/rewrite-refs.ts`, `configuration-logger` `kind` discriminator, reroute LinkType through engine in `commands/{update,remove,rename}.ts`, full test suite for foundation + LinkType. | ~4–6k LOC |
| 2 | `integration` | CardType handlers | 5 handlers (rename, delete, add-custom-field, remove-custom-field, workflow-change) + tests + dispatcher entries + reroute CardType in `commands/*` | ~2.5–3.5k LOC |
| 3 | `integration` | FieldType handlers | 6 handlers (rename, delete, data-type, enum-add, enum-remove, enum-rename) + tests + dispatcher + commands reroute | ~2.5–3.5k LOC |
| 4 | `integration` | Workflow handlers | 6 handlers (rename, delete, add-state, remove-state, rename-state, transition) + tests + dispatcher + reroute | ~3–4k LOC |
| 5 | `integration` | Leaf renames | Calculation, Report, GraphModel, GraphView, Template + tests + dispatcher + reroute | ~1.5–2k LOC |
| 6 | `integration` | ProjectRename | First-class `kind: 'project_rename'` log entry, move cascade out of `commands/rename.ts` | ~1.5k LOC |
| 7 | `integration` | "Handlers own cascade" cleanup | Delete `onNameChange` hook from `ResourceObject`, drop `ResourceObject` cascade wrappers, delete `key='name'` branch from `FileResource`/`FolderResource.update`, inline `logTarget`, rename handlers call `resource.rename()` directly. Net-negative diff. | ~−1–2k LOC |
| 8 | `integration` | Module-update replay | `mutations/module-update/{replay,conflicts,plan,types}.ts`, drop `appliedModules.json`, replay through `ResourceMutations.apply`, `update-modules` command, `Import.updateModule` delegates to replay helper | ~2.5–3k LOC |
| 9 | `integration` | HTTP routes | `tools/backend/src/domain/{mutations,modules}/`, Zod schemas, SSE for module-update, typed error envelope with `code` discriminator | ~1.5–2k LOC |
| 10 | `integration` | Validation gate + local-only scoping | `ModuleValidationFailedError`, single update transaction with content-validation gate, foreign-prefix skip for rename handlers, `ResourcesFrom.localOnly` for cascades | ~1k LOC |
| Final | `main` | `migration-integration` → `main` | One merge event. Diff already reviewed piece-by-piece in PRs 2–10. | sum of 2–10 |

## The "scaffolding stays" invariant

For PRs 1–6, the old in-resource cascade code (`onNameChange` hooks, in-class private methods like `handleCustomFieldsChange`, `ResourceObject` cascade wrappers, the `key='name'` branch in `FileResource.update`) **stays alive** until PR7. Each handler PR adds the new engine path for its resource but **does not delete the old path**.

Concretely:

- The dispatcher routes resources with a registered handler through `ResourceMutations.plan/apply`. Resources without a handler fall through to the old path.
- `commands/{update,remove,rename}.ts` get one `if` branch per migrated resource that diverts to `ResourceMutations`; the old code path remains as the `else`.
- Resource classes keep their `onNameChange`, in-class cascade methods, etc. They become dead code as their handler lands, but they are not deleted.

PR7 is then a pure deletion sweep once every resource is migrated. The smallest PR to review by far: big red diff, no logic to verify, tests already pass because the old path was already dead.

This invariant is what makes each handler PR **independently revertable**. Revert PR3 (FieldType) and FieldType operations fall back to the old `onNameChange` path. Revert PR7 and the dual-path scaffolding is restored. Nothing in the chain has a "we cannot go back" point until the final integration→main merge.

## Mechanical extraction recipe

### For PR2+ (against integration), straightforward:

```bash
git checkout migration-integration
git pull
git checkout -b pr-<N>-<topic>

git checkout migration-imp -- \
  tools/data-handler/src/mutations/handlers/<this-pr>-*.ts \
  tools/data-handler/test/mutations/handlers/<this-pr>-*.test.ts \
  tools/data-handler/test/mutations/integration-<this-pr>.test.ts

# Edit dispatcher.ts to add only this PR's handler entries
# Edit commands/{update,remove,rename}.ts to reroute only this PR's resource paths

pnpm build && pnpm test --filter=@cyberismo/data-handler
git commit -m "feat(mutations): <topic>"
git push -u origin pr-<N>-<topic>
gh pr create --base migration-integration ...
```

### For PR1 (against main), harder:

The end-state of `migration-imp` has already deleted the dual-path scaffolding (the `onNameChange` hook, `ResourceObject` cascade wrappers, etc.) that other resources still need until their handler PR lands. So PR1 must:

1. Pull only the foundation files (engine + LinkType handlers + their tests) from `migration-imp`.
2. Write `dispatcher.ts` containing **only** LinkType entries — either by hand-trimming the end-state version or by taking an early-commit version.
3. Reroute **only** LinkType paths in `commands/*`; leave CardType/FieldType/Workflow paths on their old `onNameChange`-style code.
4. Keep the `onNameChange` hook and `ResourceObject` cascade wrappers in place — still load-bearing for everything that isn't LinkType.

The dispatcher trim is the only real hand-work in PR1.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Dispatcher trim is error-prone — easy to forget an entry or accidentally include a handler that doesn't exist yet | `pnpm build` catches missing imports; `pnpm test --filter=@cyberismo/data-handler` catches missing dispatcher rows. |
| Foundation PR1 reviewers push back on architecture | Exactly why PR1 goes to `main` first — surfaces architectural concerns before sinking effort into 9 more PRs. |
| `migration-imp` drifts as `main` moves | Rebase `migration-integration` onto `main` whenever main moves. PR branches rebase onto integration. |
| PR7 cleanup conflicts with someone's `main`-branch change to a resource class | Acceptable: PR7 is small and the conflicts are visible. Worst case PR7 splits. |
| Bug found in PR3 (e.g. FieldType) after merge to integration | Fix on integration directly; no need to re-stack PRs. |
| Final integration → main is still a big merge | Diff is the sum of PRs 2–10; reviewers already reviewed each piece. Final merge is a sanity check, not a re-review. |
| Forgotten test files | After all PRs land, `git diff integration..migration-imp` should be empty (modulo plan-doc deletions). Anything remaining was missed. |

## Integration → main strategy

Final PR is **merge, not squash**. Reviewers can see "this commit was the foundation PR, these commits were CardType handlers" etc. Squashing throws away the reviewability the whole exercise produced.

Two prep steps before opening the final PR:

1. `git diff integration..migration-imp` should be empty (modulo plan-doc deletions). If anything remains, route it to the right PR and add it.
2. Rebase `integration` onto current `main` one last time. Run full CI on the rebased branch.

The final PR description lists all 10 sub-PRs and links to each. Approval is procedural; the diff has already been reviewed.

## Open decisions (defer until execution)

- **LinkType-delete in PR1 or later?** Currently scoped into PR1 (foundation handles LinkType end-to-end). The foundation plan suggested both rename + delete go together; verify against the actual `migration-imp` shape when extracting.
- **PR5 split further?** If `TemplateDeleteHandler` cache management ends up coupled to other handlers, Template may want its own PR.
- **This spec's own fate.** It's a working document for the split process. After the final integration→main merge, decide whether to keep it as historical record or drop it alongside the original plan docs.

## Anti-goals

- Replaying the existing `migration-imp` commit history. The commits are not in dependency order and include intermediate refactors superseded by later commits. Each new PR reflects the final shape of files it owns.
- Squashing everything into one final commit. Defeats the reviewability the split produces.
- Preserving `appliedModules.json` or any other transitional artifact already removed in `migration-imp`. The end state is what lands.
