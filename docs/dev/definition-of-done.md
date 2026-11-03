# Definition of done

A change is done when every item below that applies is true. How each item is checked is the review's job
([review-rubric.md](review-rubric.md)); this list only says what must be true. Based on the docs project's
"Definition of Done" page.

## Every change

- CI is green.
- The review verdict is PASS: no Blocker, no open Major, and every "For the human" item answered in the PR.
- The PR is labelled M, R or B, and every behaviour change vs `main` is listed.

## Behaviour changes (class B)

- The OpenSpec change (`openspec/changes/<name>/`) is agreed, and every scenario is met and tested
  ([testing.md](testing.md)).
- **New features work in the app, the static site export and the PDF export.** A feature that intentionally
  doesn't apply to one of them says so in the PR.
- The CLI, backend and MCP expose the feature where it applies.
- User documentation in the docs project (`docs/cardRoot`) is updated, or the PR lists it as a follow-up.
- Performance, installation and security impact are considered, and any impact is noted in the PR.
- On-disk format changes bump the schema version and come with a migration in `tools/migrations`.

## Special cases

**New npm dependency:** maintained. Native builds and install
scripts are inspected and noted in the PR.

**New non-npm dependency (tool, binary, service):** strictly necessary. It installs on Linux, macOS and Windows,
and the monorepo and docs builds are updated so they still succeed.

**New resource type:** create, show, remove and rename work through the API and the CLI. It has a JSON schema in
`@cyberismo/assets`, appears in the app wherever resources are listed, and is available to calculations where
feasible.
