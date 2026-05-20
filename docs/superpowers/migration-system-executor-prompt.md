# Executor prompt — Migration system end-to-end (opencode + worktrees)

> Copy the section below the `---` into a fresh Claude Code session. It is self-contained.

---

## Mission

Execute the seven implementation plans for the Cyberismo migration system. Implementation work is delegated to **opencode** running `fireworks-ai/accounts/fireworks/models/kimi-k2p6`. You (the Claude orchestrator) own planning, worktree management, validation, review, and conflict resolution. Each plan runs in its own git worktree so failed work is trivially discarded and parallel plans don't trample each other.

## Context to read before starting

Working dir: `/var/home/samu/cyberismo/repo`. Read these in order, top to bottom:

1. `AGENT_CONTEXT.md` — the autonomy file opencode reads on every delegation. Confirm it exists and matches the codebase. If anything's stale, fix it before starting.
2. `migration-system.md` — short user-facing description of what you're building.
3. `migration-system.allium` — formal spec. Skim entity model and surface contracts.
4. `migrations-plan.adoc` — per-resource cascade table.

Plan files in `docs/superpowers/plans/`:

| # | File | Tasks |
|---|---|---|
| 1 | `2026-05-20-migration-system-foundation.md` | 14 |
| 2 | `2026-05-20-migration-fieldtype-handlers.md` | 14 |
| 3 | `2026-05-20-migration-cardtype-handlers.md` | 13 |
| 4 | `2026-05-20-migration-workflow-handlers.md` | 12 |
| 5 | `2026-05-20-migration-remaining-handlers.md` | 16 |
| 6 | `2026-05-20-migration-module-update.md` | 12 |
| 7 | `2026-05-20-migration-http-routes.md` | 10 |

Read each task immediately before delegating it; don't try to load all task contents up front.

## Execution model

- **One worktree per plan.** No exceptions. Implementation never happens on the user's main branch directly.
- **opencode runs the implementation** of every task. The Bash tool invokes it with `--dir <worktree>` and `--pure`.
- **You run the validation** (read diff, run tests/build, verify commit). You also handle conflict resolution when merging plan branches back.
- **One opencode invocation per task.** Tasks are TDD-shaped in the plans; opencode follows them step-by-step.
- **Always use `git worktree add` and `git worktree remove`** for worktree lifecycle — never `rm -rf` a worktree.

## Strategy choice

Tell the user which one you've picked and proceed:

- **Strict-serial (recommended for first run):** Plans 1 → 2 → 3 → 4 → 5 → 6 → 7, one worktree at a time. Each plan's worktree is merged back to the main work branch (and deleted) before the next plan starts. ~91 tasks, fully sequential.
- **Parallel-handlers:** Plan 1 first; then Plans 2, 3, 4, 5 run *concurrently* in separate worktrees (each branched from the post-Plan-1 commit); then Plans 6 and 7 sequentially. Faster but requires conflict resolution at `mutations/dispatcher.ts` when merging the four parallel branches.

You may switch from strict-serial to parallel-handlers if the user asks. Don't switch the other way without permission.

## Setup before any plan starts

```bash
cd /var/home/samu/cyberismo/repo

# 1. Confirm git state
git status                                  # should be clean or have only the spec/plan files modified
git rev-parse --abbrev-ref HEAD             # remember current branch as the "work branch"

# 2. Create or reuse the working branch (where merged plans accumulate)
WORK_BRANCH=$(git rev-parse --abbrev-ref HEAD)
echo "Work branch: $WORK_BRANCH"

# 3. Confirm opencode is installed
which opencode || echo "MISSING — install opencode before continuing"

# 4. Confirm AGENT_CONTEXT.md is present
test -f AGENT_CONTEXT.md && echo "AGENT_CONTEXT.md OK" || echo "MISSING — regenerate before delegating"

# 5. Confirm pnpm install has run on the main checkout
test -d node_modules && echo "node_modules OK" || pnpm install
```

If any check fails, stop and report to the user.

## Per-plan workflow

### Step P1 — Create the worktree

For plan N (N from 1 to 7), with file `docs/superpowers/plans/<plan-filename>`:

```bash
PLAN=<plan-filename>     # e.g. 2026-05-20-migration-system-foundation.md
PLAN_ID=<short>          # e.g. foundation, fieldtype, cardtype, workflow, remaining, module-update, http
WORKTREE=/var/home/samu/cyberismo/repo/.worktrees/migration-${PLAN_ID}
BRANCH=migration/${PLAN_ID}

# Create the worktree, branching from the current work branch (or from
# the post-Plan-1 commit for parallel handlers — be explicit).
git worktree add "$WORKTREE" -b "$BRANCH" "$WORK_BRANCH"

# Ensure pnpm-managed node_modules in the worktree.
(cd "$WORKTREE" && pnpm install)
```

If the worktree already exists (resuming an interrupted run), don't recreate; just confirm the branch and `pnpm install` state.

### Step P2 — Create per-plan tracking

Use `TaskCreate` once per plan with a description that lists every task in the plan as `[ ] Task N: <title>`. Update it inline as tasks complete. The user reads this to see live progress.

### Step P3 — Loop over tasks

For each `### Task N: <title>` in the plan file, in order:

#### T1 — Read the task

Read just the task section: from the `### Task N:` heading up to the next `### Task` (or end of file). Don't load the rest.

#### T2 — Delegate to opencode

```bash
opencode run --pure \
  -m fireworks-ai/accounts/fireworks/models/kimi-k2p6 \
  --dir "$WORKTREE" \
  "$(cat <<'PROMPT'
You are implementing a single task from an implementation plan for the Cyberismo migration system.

Read `AGENT_CONTEXT.md` (in the repo root) first for project conventions and validation commands. Then read the plan file at:

`docs/superpowers/plans/<plan-filename>`

Locate `### Task N: <title>` and execute every step in the listed order. The task uses TDD: write the failing test → run it → confirm it fails → write the minimal implementation → run it → confirm it passes → commit. Each task ends with a commit step with an exact commit message.

Rules:
- Use the exact file paths, code, test commands, and commit messages the task specifies.
- Do not skip steps or add steps.
- Use ESM imports with `.js` extensions on every relative import.
- pnpm only — never npm or yarn.
- If a fixture path doesn't exist, fall back to `tools/data-handler/test/test-data/decision-records` (or its `valid/` variant) and note the substitution in the commit body.
- Do not modify files outside what the task lists.
- Do not run `--no-verify`, `git reset --hard`, `git checkout --`, `git clean -f`, or `git push`.
- Run the task's specified test command to verify the test passes, then run the package's full test suite (`pnpm --filter @cyberismo/<package> test`) as a sanity check.
- Commit per the task's commit step with the exact message specified in the plan.

When finished, output a completion report in this exact format:

## COMPLETION REPORT

### Status
[DONE | PARTIAL | BLOCKED]

### Changes
Created:
- path/to/file.ts — purpose

Modified:
- path/to/file.ts — what changed

Deleted:
- path/to/file.ts — why

### Validation
Tests (task-specific): [PASS | FAIL | NOT_RUN] — command used
Tests (package suite): [PASS | FAIL | NOT_RUN]
Type check / build:    [PASS | FAIL | NOT_RUN]
Lint:                  [PASS | FAIL | NOT_RUN]
Details: (if any failed, include the error summary)

### Commit
SHA: <git log -1 --format=%H>
Message: <git log -1 --format=%s>

### Assumptions
(decisions made where the plan was ambiguous)

### Deviations
(places you intentionally diverged from the plan and why)

### Issues
(blockers, concerns, anything needing follow-up)
PROMPT
)"
```

Replace `<plan-filename>` and `N` in the prompt body with the actual values. The opencode CLI accepts the heredoc as a single argument.

Run this with `Bash` (foreground). Expect 30 seconds to several minutes per task.

#### T3 — Parse the completion report

When opencode finishes, read its stdout for the `## COMPLETION REPORT` block. Extract:
- Status (DONE / PARTIAL / BLOCKED)
- Commit SHA
- Validation lines
- Deviations and Issues

Any status other than DONE = failure (see T6).

#### T4 — Verify the work (you do this directly)

```bash
# Inspect what changed
git -C "$WORKTREE" log -1 --format='%h %s'
git -C "$WORKTREE" show HEAD --stat

# Re-run the task's tests yourself
(cd "$WORKTREE" && pnpm --filter @cyberismo/<package> test test/path/to/<task>.test.ts)

# Sanity-check the package's full test suite
(cd "$WORKTREE" && pnpm --filter @cyberismo/<package> test)
```

Verify:
- Files touched match the plan's "Files:" block (allow for the fixture-fallback substitution).
- Commit message matches the plan's commit step exactly.
- Tests pass.
- No files outside the plan's scope are dirty: `git -C "$WORKTREE" status --short` should be clean.

If anything's off, treat as a task failure (T6).

#### T5 — Spot-check design (optional, batched)

Per-task design review is expensive and usually unneeded — the plans are detailed enough that opencode follows them faithfully. **Run a Claude design review every 5 tasks** (and always at plan boundaries). Use a `general-purpose` subagent with this prompt:

```
You are spot-checking the last 5 commits in the worktree at <WORKTREE> against the implementation plan at <plan-path>.

Run:
  git -C <WORKTREE> log -5 --format='%h %s'
  git -C <WORKTREE> show <each SHA>

For each commit, verify it matches the corresponding task in the plan (commit message, file list, code shape). Flag:
- Any commit whose diff doesn't implement what the task said.
- Any obviously bad code (swallowed errors, off-by-one, missing null-checks at API boundaries).
- Any deviation that wasn't recorded in the commit body.

Reply with "APPROVED" if all 5 are good, or list issues by commit SHA with severity (must-fix / should-fix / nit).
```

If must-fix surfaces, treat the offending commit as a task failure (T6) — `git revert` it and re-run that task.

#### T6 — Handle failure

If a task fails (opencode report ≠ DONE, validation fails, or design review flags must-fix):

1. **First retry.** Re-invoke opencode with the original prompt plus an appended line:

   ```
   PREVIOUS ATTEMPT FAILED.

   Reason: <one-paragraph summary of what was wrong>
   Last commit SHA (already reverted if applicable): <SHA>

   Read the failure summary above carefully, then redo the task from scratch. Pay particular attention to the issue identified.
   ```

   Before retrying, if opencode left a bad commit, revert it: `git -C "$WORKTREE" revert --no-edit HEAD`. Don't `reset --hard`.

2. **Second retry.** Same shape, but include a snippet of the failing test output or the specific lines that were wrong in the diff. Be concrete.

3. **Escalate.** If the second retry also fails, stop. Tell the user: which plan, which task, what failed, what you tried, and what state the worktree is in. Do not proceed without explicit user input.

#### T7 — Mark complete

Update the per-plan tracking task: flip `[ ] Task N` to `[x] Task N`.

### Step P4 — Plan verification

After every task in the plan shows `[x]`:

```bash
# Run the plan's "Verification checklist" verbatim from inside the worktree.
(cd "$WORKTREE" && pnpm --filter @cyberismo/data-handler test)
(cd "$WORKTREE" && pnpm --filter @cyberismo/data-handler build)
(cd "$WORKTREE" && pnpm --filter @cyberismo/data-handler lint)
(cd "$WORKTREE" && pnpm test)            # whole monorepo, occasional regressions
```

All four must pass. If any fail, treat as a plan-level failure: identify the culprit task, escalate to the user.

Run one final Claude design review across all tasks in the plan (use the T5 prompt with a wider commit range).

### Step P5 — Merge back to the work branch

```bash
cd /var/home/samu/cyberismo/repo
git checkout "$WORK_BRANCH"

# Fast-forward if possible; otherwise merge with --no-ff to preserve plan structure.
git merge --no-ff "$BRANCH" -m "Merge plan: $PLAN_ID

Implements the migration system <plan-id> plan.
See docs/superpowers/plans/$PLAN for the task breakdown."
```

If the merge conflicts (most likely in `tools/data-handler/src/mutations/dispatcher.ts` under parallel-handlers strategy):

- **For `dispatcher.ts` HANDLERS array:** union the additions. Every handler from every plan must stay registered. Read both versions, write the union, `git add`, `git commit`.
- **For any other conflict:** stop, report to the user, do not auto-resolve.

After merging:

```bash
# Confirm the merged state still passes
pnpm --filter @cyberismo/data-handler test
pnpm test                                      # full monorepo
```

If anything broke after merging (a regression revealed by the union of changes), revert the merge (`git revert -m 1 HEAD`) and escalate.

### Step P6 — Tear down the worktree

```bash
git worktree remove "$WORKTREE"
git branch -d "$BRANCH"                        # safe delete; refuses if unmerged
```

The branch is preserved by the merge commit. The worktree directory is gone.

### Step P7 — Status post

Post a one-paragraph status update to the user:

> "Plan <N> (<id>) merged. <X> commits. Tests + build + lint pass on the work branch. Next: Plan <N+1> (<id>)."

Then move to the next plan.

## Parallel-handlers specifics

Only if the user chose parallel-handlers, and only after Plan 1 has been merged.

```bash
# After Plan 1 merge, snapshot the work branch SHA — every parallel plan branches from here.
PARALLEL_BASE=$(git rev-parse "$WORK_BRANCH")

# Create four worktrees, one per parallel plan.
for ID in fieldtype cardtype workflow remaining; do
  git worktree add "/var/home/samu/cyberismo/repo/.worktrees/migration-${ID}" \
                   -b "migration/${ID}" "$PARALLEL_BASE"
  (cd "/var/home/samu/cyberismo/repo/.worktrees/migration-${ID}" && pnpm install)
done
```

Run each plan's task loop in turn — but you may interleave by running one task in one worktree while another task is dispatched in another worktree (opencode invocations don't share state). Don't try to run two tasks *simultaneously* against the same worktree.

Merging the four parallel branches back is sequential:

1. Merge `migration/fieldtype` first → verify suite passes.
2. Merge `migration/cardtype` → expect a conflict in `dispatcher.ts`; union and continue.
3. Merge `migration/workflow` → same conflict shape, union.
4. Merge `migration/remaining` → same conflict shape, union.

After each merge, run the verification checklist before the next merge. Stop if anything breaks; never proceed with regressions stacking up.

Plans 6 and 7 run sequentially after the four parallel plans are all merged.

## Final verification (after Plan 7 merges)

```bash
cd /var/home/samu/cyberismo/repo
git checkout "$WORK_BRANCH"

# Clean install to catch any node_modules drift
rm -rf node_modules tools/*/node_modules
pnpm install

# Full validation
pnpm build
pnpm test
pnpm lint
pnpm prettier-check
```

All five must pass. Then:

- Re-read `migration-system.md` and walk through every claim in "What this does" / "What this does not do" against the implementation. Note any gaps in your status report.
- Smoke-test the CLI on a temp project:
  ```bash
  mkdir /tmp/cyberismo-smoke && cd /tmp/cyberismo-smoke
  # follow the README's intro-flow steps
  ```
- Smoke-test the HTTP routes per `tools/backend/README.md` (added by Plan 7 Task 10).

Final report to user:

> "All seven plans implemented and merged. <N> commits across <P> plan-merge commits. Tests + build + lint + prettier pass. Smoke tests pass on CLI and HTTP. Branches preserved as `migration/<id>`. Ready for review."

## Things you must not do

- **No work directly on `$WORK_BRANCH`.** Every change comes via a plan worktree.
- **No `--no-verify` on commits.** Pre-commit hooks are part of the contract.
- **No `git reset --hard`, `git checkout --`, `git clean -f`, `git push`.** Use `git revert` if you need to undo a commit. Use `git worktree remove` to clean up worktrees.
- **No skipping tests** that fail. If a task's test fails, that's a failure; don't add `it.skip` to mask it.
- **No editing the plan files.** They're the source of truth. If you find a plan error, stop and tell the user.
- **No concurrent opencode invocations against the same worktree.** One task at a time per worktree.
- **No bypassing the per-task commit step.** Each task ends in a commit; if opencode forgot, you commit per the plan's exact message before moving on.

## Things you should do

- **Run plan-level verification religiously.** A broken merge is much cheaper to revert than a broken release.
- **Keep the user informed.** Status post at every plan boundary; mid-plan only on failures.
- **Trust opencode but verify.** The completion report is opencode's word; your diff inspection and test runs are ground truth.
- **Note deviations.** If opencode substituted a fixture path or made a defensible micro-decision, that's fine — make sure it ends up in the commit body and in your tracking.
- **Spot-check designs every 5 tasks.** Cheap insurance against silent drift.

## Open questions the plans defer

The following are deliberately out of scope for these plans. Don't try to fix them during execution — they're tracked in `migration-system.md` "Open questions worth deciding":

- Clean-working-tree precondition on breaking edits.
- Major-bump warning frequency / release-notes URL in CLI.
- `cardsConfig.json` drop ordering after module removal.
- Cross-major hotfix DAG analysis for `migration_path_unreachable` (Plan 6 ships a v1 heuristic only).
- MCP integration of the new routes.
- React frontend wiring of the new HTTP routes.

If you encounter one during execution, note it in your status post and proceed with the closest reasonable behaviour per the plan.

## Begin

1. Run the setup checks (above).
2. Announce your chosen strategy.
3. Create the worktree for Plan 1.
4. Start with Task 1 of Plan 1.
