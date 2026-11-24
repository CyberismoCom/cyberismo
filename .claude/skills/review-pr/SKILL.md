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
- Branch, or nothing for the current branch: `git fetch origin main <branch>`,
  then use `origin/<branch>` unless the branch only exists locally:
  `git diff $(git merge-base origin/main <ref>)...<ref>` and
  `git log origin/main..<ref> --oneline`. Look up its PR with
  `gh pr list --head <branch> --state all --json number,title,body`; the PR
  body is intent.
- With a PR, note the CI state (`gh pr checks <n>`): failed or still pending
  checks go in the header line.

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
  plus concrete bugs.
- `test-reviewer`, when a test file is added, changed, moved or deleted, or
  when production code changes with no test change. In the second case, tell
  it so: it then reports only behaviour the change introduces with no test.

Give every reviewer the same brief. Questions that matter for one kind of
change belong in the agent files, not in a one-off prompt.

## 3. Check serious findings

Merge duplicate findings, keeping the higher severity. For each Blocker,
Major and Decision, read the cited lines yourself with enough context to judge
it. Drop one that does not hold and list it under Dropped with the reason; move
one the diff did not introduce to Follow-ups. Drop any finding without
file:line and evidence.

Severities, for the report:

- **Blocker / Major**: wrong behaviour (see the agent files).
- **Decision**: a product, UX or design question that must be answered before
  merge, e.g. two controls with the same label that do different things.
- **Fix**: no wrong behaviour, but should be fixed in this PR: narrating
  comments, a re-implemented helper, a stale version, docs or `AGENTS.md` not
  brought along, a test that can't catch its bug. Changes here are mostly
  written by agents, so a cheap cleanup is not optional.
- **Minor**: worth a line, fine to leave.

You may raise a finding's severity when the reviewer's label understates it (a
Minor that is really a Decision); say so in the finding. Do not lower one
without checking it.

Reviewers are read-only by default. When the user asks for a deeper review
and a ready worktree of the head commit exists (or they say to make one), pass
its path to `test-reviewer`; it may then run targeted tests there.

## 4. Report

Keep it short; the reader is a busy reviewer. Omit empty sections.

1. One header line: branch or PR, head commit, intent source, class (from
   the behaviour reviewer), packages touched, anything not reviewed.
2. **What it changes**: the behaviour reviewer's list, one line each.
3. **Findings**, most severe first: Blocker, Major, Decision, Fix.
4. **Questions**: the reviewers' "for a person" items and what was not brought
   along, merged and de-duplicated, one line each. Never answer one.
5. **Follow-ups**: Minors and pre-existing problems, one line each. Never file
   tickets.
6. **Dropped**: findings that did not hold, one line each.

A clean change gets a header line, the change list and "No findings".

## 5. Compare with other reviews

With a PR, after your report, read the review comments already on it (`gh api
repos/{owner}/{repo}/pulls/<n>/comments` and `.../reviews`). Never read them
before the reviewers run: they anchor the review. For each point another
reviewer (a person or a bot) raised that you missed, check it like a Blocker and
add it to the report, marked with its source. Skip points you already have.

## 6. Post (only when asked)

Posting is a separate request from the user, given per PR. Never approve or
request changes on the user's behalf.

Post one GitHub review with `event: COMMENT` on the head commit you reviewed:
`gh api repos/{owner}/{repo}/pulls/<n>/reviews --input <file>.json`, with
`commit_id`, `body` and `comments` (`path`, `line`, `side: RIGHT`, `body`).

- One inline comment per finding, on the cited line. Lead with the severity
  and the problem in bold, then the failure and the fix, with a code sketch
  when it is short.
- An inline comment can only sit on a line in the diff. A finding about a file
  the diff does not touch goes on the changed line that causes it, or in the
  body.
- The body: one or two lines of verdict, the questions, and the findings that
  have no line in the diff. Not the change list.
- The body always starts with a line marking it as an agent's review posted
  on the user's behalf, e.g. "Automated review (Claude Code, review-pr skill),
  posted on behalf of <GitHub login>." Any note the user asks for goes after
  it.
