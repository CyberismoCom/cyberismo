# Review rubric

What every review of a Cyberismo PR covers, whether a person or an agent does it. The team owns it; change it
by PR.

CI runs everything on every PR and must be green before review. This rubric covers only what CI can't check.
It has two parts that do different jobs:

- **Checks** compare the diff with a written rule. Anyone can run them. The review agent runs them first and
  reports findings, and the human reviewer verifies those findings.
- **Bring to a human** lists the decisions a check can't make. The agent surfaces each one with its context and
  never settles it. A person decides and records the reason in the PR.

A check is here only if it encodes a Cyberismo decision or a risk specific to how Cyberismo works. General good
practice that any competent reviewer or model already applies is left out on purpose.

Related: [testing.md](testing.md), [definition-of-done.md](definition-of-done.md), `tools/<pkg>/ARCHITECTURE.md`,
[`SECURE_DEVELOPMENT.md`](../../SECURE_DEVELOPMENT.md) (security rules, applied by C5).

## Change class

The author labels the PR, and the class decides what proof is expected.

| Class | Meaning | Proof |
|---|---|---|
| **M** mechanical | Moves, renames, codemod output | Tests unchanged except imports. A large M PR is reproduced by a committed script. |
| **R** refactor | Structure changes, behaviour doesn't | Existing tests pass unchanged. Any edited assertion is named with its reason. |
| **B** behaviour | Behaviour changes | Every change vs `main` listed, an OpenSpec change, tests citing its scenarios. |

*Why:* a large mechanical or refactor diff can't be read line by line. Proof that fits the class replaces
pretending to read it.

## Checks

| # | Check | Why |
|---|---|---|
| C1 | The class is true, and every behaviour change vs `main` is listed. A change counts as listed only if the PR names it, including its observable consequences; an understated change is unlisted. Every changed or deleted assertion is named with its reason. | An unlisted behaviour change is the costliest miss; reviewers can only judge what they're told about. |
| C2 | Every public read or write on a workspace runs under the lock. No network I/O while holding it; nothing published to subscribers inside it. | Concurrent users and agents share one workspace; a missed lock corrupts it or stalls everyone. |
| C3 | One user operation is one transaction. Adapters don't compose writes. | A user operation must succeed or fail as a whole. |
| C4 | A failure halfway through leaves a known state: rolled back, retry-safe, or reported. | A half-applied change leaves a project nobody can reason about. |
| C5 | The change follows [`SECURE_DEVELOPMENT.md`](../../SECURE_DEVELOPMENT.md). Its rules are checked here, and findings use this rubric's format and severities. | Security rules live in one owned document, not repeated here. |
| C6 | Failure is never reported as success. Errors are typed, and nothing branches on message text. | Scripts, CI and users act on the result. |
| C7 | The change follows the package's `ARCHITECTURE.md`. A change that alters the architecture updates it in the same PR. | Architecture is described there, not here; the doc stays true only if changes keep it so. |
| C8 | No speculative generality: every option, flag or seam has a consumer in this PR or a named next one. | Unused flexibility is code to read, test and keep working with no benefit. |
| C9 | A bug fix comes with a test that fails without the fix. | Without it nothing shows the fix works or stops the bug returning. |
| C10 | One behaviour is tested at one level. Tests go through the public API and don't reach internals. Each review also answers "what should be deleted or merged?" | Duplicate tests cost review and maintenance and catch nothing extra; tests through internals break on every refactor. |
| C11 | Each new test catches a plausible bug no other test catches, and asserts outcomes, not mocks. | A test that can't fail for a real bug gives false confidence. |
| C12 | For a B change, every spec scenario has a test that cites it, and no test cites a scenario that doesn't exist. | Ties code to the agreed behaviour. |
| C13 | No test-only exports or seams on a shipped package. Tests need no live network. | Shipped packages stay clean; network-dependent tests are flaky. |
| C14 | Comments state a constraint the code can't show. They don't narrate the change or reference tickets. | History belongs in git and the PR; comments outlive both. |
| C15 | A user-facing change updates the docs project (`docs/cardRoot`). | The docs project is what users read; it drifts unless changes update it. |
| C16 | New per-card or per-request work on a hot path comes with a before/after measurement on more than one project. | A speed-up measured on one project can be a slowdown on another. |
| C17 | Mechanical and behaviour changes are in separate commits or PRs. No scratch files or private plans are committed. | Mixed diffs hide behaviour changes; scratch files and plans are not team material. |
| C18 | New third-party GitHub Actions are pinned by SHA. | A tag can be moved to point at different code; a SHA can't. |
| C19 | Existing helpers, patterns and rules are reused; a rule or piece of logic lives in one place, not in a new parallel copy. | Code drifts fastest when several people and agents each add their own version. |
| C20 | Exports, parameters and wrappers the change made unused are removed. | Leftovers look like live API and mislead the next reader; agents often leave them. |

## Bring to a human

The agent lists each of these that the PR touches, with the context needed to decide. A person answers it in the
PR: accept, change, or reject.

| # | Decision | Why a person |
|---|---|---|
| H1 | Each behaviour change vs `main`, and any difference from the spec or ticket | Whether the product should behave this way |
| H2 | On-disk format or schema changes | Users' projects and migrations depend on them |
| H3 | Architecture changes: an `ARCHITECTURE.md` diff, a new package or folder, a new cross-package dependency | Long-lived structure the team shares |
| H4 | New dependencies | Maintenance, licence and supply-chain risk |
| H5 | New routes, role changes, and anything touching auth or the OSS/SaaS boundary | Security and product scope |
| H6 | Accepting a Major finding instead of fixing it | Someone has to own the risk |
| H7 | Product, UX and design trade-offs | No rule to check against |
| H8 | Designing around an existing mechanism (flag, lease, timer) without knowing why it exists | It may be the mechanism that should go |
| H9 | A deliberate deviation from `SECURE_DEVELOPMENT.md`. If accepted, the person records it as the guide requires: a call-site comment and a defect. | Accepted security risk needs an owner and a record |

## Findings

One per defect, most severe first:

```
[Blocker|Major|Minor] C<n> <file>:<line> — <one-sentence defect>
  Failure: <concrete input or state → wrong output, crash, leak>
  Fix: <minimal change>
  Evidence: <command run, mutation tried, test or diff line>
```

Severity comes from the failure scenario, not from which check found it. Ask what happens to a user, or to the
next person changing the code, if this merges:

| Severity | The failure scenario shows… | Handling |
|---|---|---|
| **Blocker** | Harm on a normal path: a user's project corrupted or changed unasked, a security hole, a failure reported as success, an unlisted behaviour change, or a test that hides a real failure | Fixed before merge |
| **Major** | Wrong behaviour on a realistic but less common path (error, concurrency, unusual input), a test that can't catch the bug it exists for, or a broken architecture rule that will cause the next bug | Fixed, or a person accepts it (H6) |
| **Minor** | No wrong behaviour today; the cost is extra work later (duplication, a misleading name or comment, a missing test for an unlikely case) | Fixed if cheap, otherwise listed under **Follow-ups** for a person to ticket |

When unsure between two levels, pick the higher one and say why; the human reviewer can lower it. A finding
without a concrete failure scenario is at most Minor. Taste that no check covers is a question, not a finding.

## Review output and verdict

The review has three sections: **Findings**, **For the human** (the H items, each with its question), and
**Follow-ups** (Minors not fixed, and pre-existing problems found along the way). The agent never files
tickets; a person turns follow-ups into tickets.

- **PASS:** no Blocker, no open Major, and every H item answered.
- **FAIL:** a Blocker, or a Major that is neither fixed nor accepted.
- **STOP:** an unlisted behaviour change, or a finding that invalidates the spec or design. Work pauses until a
  person decides.

## Anti-gaming

Each of these is at least Major, and a Blocker when it hides a failure. They are the moves an agent under
pressure to get green makes:

- an assertion loosened, a snapshot regenerated, or an expected value obtained by running the code;
- a test skipped, deleted or weakened without a reason;
- a threshold, timeout or CI scope loosened;
- a parameter, export or seam added only so a test can reach it;
- urgency given as the reason for any of the above.
