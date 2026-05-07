---
name: release-notes
description: Draft the next CHANGELOG.md section for a Cyberismo CLI release by reading merged PRs since the previous tag. Use when cutting a release of @cyberismo/cli.
disable-model-invocation: true
---

# Draft release notes

Run this skill to produce the new `## [VERSION]` section for `CHANGELOG.md` ahead
of the version-bump PR. Reads only — never commits, never bumps `package.json`,
never touches the live GitHub Release.

## 1. Inputs

The version comes from `tools/cli/package.json` — read it directly. The
canonical entry point is `node scripts/release.mjs <bump-type>`, which bumps
the working-tree `package.json` files first, then prompts the maintainer to
run this skill, so by the time you're invoked the file already holds the
intended new version.

If the user passes an explicit version as an argument and it differs from the
value in `tools/cli/package.json`, stop and surface the mismatch — don't guess
which is right.

## 2. Determine the previous tag

```bash
git fetch --tags --force
git describe --tags --match 'cyberismo-*' --abbrev=0
```

If no tag exists yet, use the first commit on `main` as the range start.

## 3. List merged PRs since the previous tag

Prefer the GitHub API view (gives labels, author, body) over `git log`:

```bash
PREV_DATE=$(git log -1 --format=%cI <prev-tag>)
gh pr list --base main --state merged --limit 200 \
  --search "merged:>=${PREV_DATE}" \
  --json number,title,labels,author,url
```

For PRs whose title alone is opaque, fetch the body on demand:

```bash
gh pr view <num> --json title,body,labels,files
```

Don't fetch every PR — only the ones where the title doesn't make the user-facing
intent clear.

## 4. Categorise

Six buckets, in this order:

- **Highlights** — one or two sentences a user scanning the release tab will read.
  Lead with the most user-visible change. This is the part that matters; spend
  effort here.
- **Breaking changes** — anything that requires the user to change code, config,
  or invocation. Each entry must include a migration hint.
- **Features** — new user-visible capabilities.
- **Fixes** — bug fixes the user would notice.
- **Dependencies** — Dependabot and other dependency bumps. Collapse to a single
  summary line if there are more than 5 (e.g. `- 12 dependency updates`).
- **Internal** — refactors, tests, CI, build, docs that don't affect users.

Routing rules:

- **Dependabot:** author login `dependabot` (or `dependabot[bot]`) or PR title
  starting with `bump ` / `Bump ` → **Dependencies**.
- **CI / build / docker / workflow / dockerfile** in the title or `ci` /
  `build` label → **Internal** unless the change is user-visible (e.g. a
  published image getting a new arch).
- Strip the `INTDEV-\d+\s*` prefix from PR titles when rendering — internal
  ticket IDs don't belong in user-facing notes.

When unsure between Features and Internal, peek at the PR body and the files
changed (`gh pr view --json files`). If only `tools/<pkg>/test/`, `.github/`,
or pure refactor paths are touched, it's Internal.

## 5. Write the new section

Prepend the new section to `CHANGELOG.md` (create the file if it doesn't exist).
Use this exact shape:

```markdown
## [VERSION] — YYYY-MM-DD

### Highlights

<one or two sentences — replace before merging>

<!-- REVIEW: edit Highlights and skim every section before merging -->

### Breaking changes

- ...

### Features

- ...

### Fixes

- ...

### Dependencies

- ...

### Internal

- ...
```

Notes on shape:

- Skip empty sections rather than emitting `_None_`.
- The `<!-- REVIEW: -->` marker is required. The release workflow refuses to
  publish while it's still in the file, so a forgotten edit can't ship.
- Use today's date in `YYYY-MM-DD`. Don't guess the future release date.
- Each entry should be one line, user-facing language, with a `(#NNN)` PR
  reference. No commit hashes.

## 6. Sanity-check and stop

After writing, print a short summary:

- Number of PRs found per bucket.
- Anything ambiguous the human should re-classify.
- Any merged PR since the previous tag that didn't make it into the draft (an
  explicit count of PRs you fetched vs. PRs you placed). This catches the case
  where the search query missed something.

Do **not**:

- Commit anything (`git commit`, `git push`, `git tag`).
- Bump `tools/cli/package.json` — semver is the human's call.
- Run any mutating `gh` command (`gh release create`, `gh release edit`,
  `gh pr edit`, `gh pr comment`).
- Open a PR.
