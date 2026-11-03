---
name: review-pr
description: Review a Cyberismo change (current branch vs origin/main, or a PR number) in two stages, OpenSpec compliance then quality, using the repo's review rubric. Read-only; never edits code. Use when asked to review a branch, diff or PR.
argument-hint: '[PR number | branch | empty for current branch]'
disable-model-invocation: true
allowed-tools: Read Grep Glob Agent Bash(git fetch *) Bash(git diff *) Bash(git log *) Bash(git show *) Bash(git merge-base *) Bash(git status *) Bash(gh pr view *) Bash(gh pr diff *) Bash(gh pr checks *)
---

# Review a change

Read-only review. Never edit, stage, commit, push or check out anything.
(`allowed-tools` only pre-approves the listed tools; it does not remove
others, so this is an instruction, not a sandbox.) The rules live in the repo;
this skill only orchestrates. Do not restate rules from memory, read them.

Rule files (read the ones that exist; say which are missing and review against
what is there):

- `docs/dev/review-rubric.md` - change classes M/R/B, checks C1-C20, bring-to-a-human items H1-H9, severities, finding format, verdicts
- `SECURE_DEVELOPMENT.md` - security rules, applied by check C5
- `docs/dev/testing.md`
- `docs/dev/definition-of-done.md`
- `openspec/config.yaml`, the change's `openspec/changes/<name>/` (proposal, spec deltas, design) and `openspec/specs/`
- `tools/<pkg>/ARCHITECTURE.md` for every package the diff touches
- `AGENTS.md`

## 1. Get the diff

Argument is a PR number: `gh pr view <n> --json title,body,baseRefName,headRefName,files` and `gh pr diff <n>`.
Otherwise: `git fetch origin main`, then `git diff $(git merge-base origin/main HEAD)...HEAD`, plus `git log origin/main..HEAD --oneline`.
Uncommitted changes are not part of the review unless the user says so; mention them if present.

If the diff is large, list files with `--stat` first and give each reviewer the
file list plus how to obtain the diff, not a pasted copy.

## 2. Classify

Read the change-class definitions in the rubric (M/R/B) and pick one per the
rubric's own criteria. A diff mixing classes is reported as mixed and each part
is reviewed under its class; mixing is itself a finding if the rubric says so.
State the class and the one-line reason before continuing; if the PR body
names a class, check it is true (C1). Find the OpenSpec change: the PR body links
`openspec/changes/<name>/`, or the diff adds it. A class B change needs one
with scenarios; if there is none, that is the first finding.

## 3. Stage 1 - spec compliance

Delegate to the `spec-reviewer` subagent (fresh context). Give it: the diff
source (command or PR number), the change class, the OpenSpec change name (or "none"), the
PR description text, and the list of touched packages. It returns findings in
the rubric format covering: each scenario in the spec deltas mapped to a test citing it
(`<capability>: <Scenario name>`) that would fail without the change, and no
test citing a nonexistent scenario; the PR's "behaviour vs main" claim checked against the diff; scope
creep and unrequested behaviour; conformance to each touched
`ARCHITECTURE.md`.

If stage 1 has blocking findings, still run stage 2 but tell the user stage 1
failed; quality review of code that is the wrong change is lower value.

## 4. Stage 2 - quality

Delegate to the `quality-reviewer` subagent (fresh context, separate from
stage 1 so it is not anchored on it). Give it: the diff source, the change
class (it reads the rubric itself; do not paraphrase checks). Do not pass it stage 1's
conclusions.

Run the two stages in parallel when the diff source is the same and no stage
depends on the other; the order matters only for what you report.

## 5. Merge and report

Do not soften or re-rank subagent findings. You may drop exact duplicates and
you must drop any finding without file:line and evidence. Verify the two or
three highest-severity findings yourself by reading the cited lines; if one
does not hold, drop it and say so.

Output, in the rubric's three sections plus a header:

1. Header: change class, OpenSpec change, packages touched, PR/branch, what was not
   reviewable (missing rule files, skipped CI evidence).
2. **Findings**, most severe first, in the rubric's finding format
   (`[Blocker|Major|Minor] C<n> <file>:<line> — <defect>`, then Failure, Fix, Evidence),
   including any anti-gaming items found.
3. **For the human**: each H item the change touches, with its context and the question to answer.
   Never answer one yourself.
4. **Follow-ups**: Minors not fixed and pre-existing problems found along the way. Never file tickets.
5. Verdict, using the rubric's verdicts: `PASS`, `FAIL` or `STOP`, with the findings that decide it.
   PASS requires every "For the human" item answered, so before a person answers them the verdict is at
   best "PASS pending the human items". A verdict is advice for the human reviewer.
6. CI: `gh pr checks <n>` summary when a PR number was given. Passing CI is
   not evidence for a finding either way.

## 6. Posting

Only when the user explicitly asks to post, and only as a single review
(`gh pr review <n> --comment --body-file <file>`, or `--request-changes` if they
say so). Show the text first and wait for confirmation. This skill's
`allowed-tools` does not include `gh pr review`, so the user will be prompted.
Never approve on the user's behalf.
