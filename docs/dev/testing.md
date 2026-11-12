# Testing

How tests are organised and what a test must earn. Review checks are in
[review-rubric.md](review-rubric.md) C9–C13. Vitest everywhere; Playwright for app e2e.

## Levels

Each behaviour is tested at exactly one level: the highest one that runs real
code cheaply. Add a lower-level test only for logic the higher level can't
reach without a lot of setup.

| Level | What it calls | What it is for |
|---|---|---|
| **Unit** | A pure function or class directly | Pure code with its own edge cases (parsers, rank maths, diff and plan builders). No I/O, no project. |
| **API** | The public API: `Workspace`, `ws.<area>`, the directory | Domain behaviour: what an operation does to a project. Tests are **organised** by domain concept; the **surface** they call is the API. |
| **Adapter contract** | A backend route, MCP tool or CLI command | Mapping only: input parsing, the API call made, output format, status and exit codes, role checks. Domain rules are not re-tested here. |
| **E2E** | The running app in a browser | One test per user-facing scenario. Not for edge cases. |

Test folders per package: `tools/<pkg>/ARCHITECTURE.md`.

Rules for the levels:

- "Domain" names how tests are grouped, not a level. A test under
  `test/domain/` goes through `Workspace` unless the code it covers is pure.
  Calling a domain function directly with a hand-built checkout is not allowed
  for new tests.
- `state/` and `infra/` code gets unit tests only where the API level can't
  reach a case (lock ordering, git error mapping, path checks).
- App components get unit tests in `tools/app/__tests__/` for their own logic;
  flows go to e2e.
- A test that pins the same behaviour as a kept test at another level is
  deleted, not kept "for safety".

## What a test must earn

- **It catches a plausible bug no other kept test catches.** For each new
  test, the PR body names the mutation it catches in one line ("removing the
  prefix check in `resolveCard` fails this"). The reviewer may try it.
- **Bug fix ⇒ a test that fails without the fix.** Revert the fix locally,
  watch the test fail, restore it. State that you did in the PR body.
- **Scenarios are cited.** A test that covers an OpenSpec scenario is named
  `<capability>: <Scenario name>`:
  `it('card-rename: Rename onto an existing prefix is rejected', …)`.
- **Assertions state their requirement.** Derive expected values from a named
  fixture or a named invariant, not from running the code. Assert outcomes
  (files on disk, returned data, exit code), not which mock was called.
- **Mutation also deletes.** Every review answers "what should be deleted or
  merged?" A test that only catches implausible mutations goes.

## Shape

- Three or more cases of the same shape are one `it.each` table.
- Shared setup lives in a builder or a per-folder `fixture.ts`, not inline per test.
- No `.only` committed. No live network: module and git sources are local.
- **No race tests in the suite.** A race fix is verified by hand (remove the
  guard, run a concurrent workload, note the hit rate) and the result is stated
  briefly in the PR body. CI timing makes such tests flaky or blind.

## Protected expectations

These change only with a reason stated in the PR body, and the reviewer checks
each one:

- an existing assertion or expected value, in any test;
- snapshots and golden expectations;
- canonical fixture projects and the e2e project setup;
- CI workflow files and test configuration (timeouts, `maxWorkers`, exclusions).

Adding a new test is not protected. Regenerating a snapshot without reading the diff is a red flag (rubric,
anti-gaming).

## Fixtures

- A test builds the project it needs with the project builder, starting from a fresh copy every time. Static
  fixture projects are for whole-project cases the builder can't express, for example a deliberately invalid
  project.
- Fixtures are shared through a package, not by reaching into another package's `test/` folder.
- Shipped packages don't export test helpers.
