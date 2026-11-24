---
name: review-pr
description: Review a Cyberismo change (current branch vs origin/main, a branch, or a PR number) with the repo's review agents - behaviour, fit and tests in parallel, then a check of each serious finding. Read-only; never edits code. Use when asked to review a branch, diff or PR.
argument-hint: '[PR number | branch | empty for current branch]'
disable-model-invocation: true
---

# Review a change

Read-only review: never edit, stage, commit, push or check out anything. What each reviewer looks
for lives in its agent file under `.claude/agents/`; this skill only
orchestrates.

## 1. Get the diff

- PR number: `gh pr view <n> --json title,body,baseRefName,headRefName,headRefOid,files` and `gh pr diff <n>`.
- Branch, or nothing for the current branch: `git fetch origin main`, then
  `git diff $(git merge-base origin/main <branch>)...<branch>` and
  `git log origin/main..<branch> --oneline`.

Uncommitted changes are not part of the review unless the user says so;
mention them if present. Record the head commit you review.

Note the touched packages, whether any test file is added, changed, moved or
deleted, and what the author said about the change (PR body, commit messages).

Intent, if any: look for an `INTDEV-<n>` key in the branch name, commits or PR
title. If a Jira tool is available, fetch the ticket's summary and description;
if not, use ticket text the user gave, or go without. Missing intent is normal
here and never a finding. If the
diff is large, give reviewers the `--stat` file list and how to get the diff,
not a pasted copy.

## 2. Review

Start these in parallel, each in a fresh context, giving each the diff source
and the touched packages. Do not pass one reviewer's conclusions to another.

- `behaviour-reviewer`, also given the intent you found (ticket text, PR body,
  commit messages) or "none".
- `fit-reviewer`: whether the added code is needed and fits the codebase,
  plus concrete bugs. Its Suggestions are not merge blockers; report them as
  such.
- `test-reviewer`, only when a test file is added, changed, moved or
  deleted.

## 3. Check serious findings

Merge duplicate findings, keeping the higher severity. For each Blocker and
Major, read the cited lines yourself with enough context to judge it. Drop one
that does not hold and list it under Dropped with the reason; move one the diff
did not introduce to Follow-ups. Do not otherwise re-rank findings. Minors are
not checked. Drop any finding without file:line and evidence.

Reviewers are read-only by default. When the user asks for a deeper review
and a ready worktree of the head commit exists (or they say to make one), pass
its path to `test-reviewer`; it may then run targeted tests there.

## 4. Report

Keep it short; the reader is a busy reviewer. Omit empty sections.

1. One header line: branch or PR, head commit, intent source, class (from
   the behaviour reviewer), packages touched, anything not reviewed.
2. **What it changes**: the behaviour reviewer's list, one line each.
3. **Findings**, most severe first, in the reviewers' format.
4. **Questions**: what was not brought along, and the reviewers' "for a
   person" items, merged and de-duplicated, one line each. Never answer one.
5. **Follow-ups**: Minors and pre-existing problems, one line each. Never file
   tickets.
6. **Dropped**: findings that did not hold, one line each.

A clean change gets a header line, the change list and "No findings".

Posting anywhere is a separate request from the user. Never approve on the
user's behalf.
