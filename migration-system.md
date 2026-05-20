# Migration system — how it works

> Plain-English companion to `migration-system.allium`. Read this first to check the design is what you want; the `.allium` file is the formal spec.

## What it is

A way to record breaking changes that a Cyberismo module's maintainer makes to their own resources, so that consumers of the module can apply the same changes to their own project data when they upgrade. Two flows, one log per project.

## The core idea

When you edit your module's resources in a way that would invalidate someone else's existing cards, the system writes one line to a per-project log (`migrationLog.jsonl`). When you release a new version, the log is sealed as `migrationLog_<version>.jsonl`. When a consumer updates to that version, the engine replays each entry against their cards, calculations and links.

That's it. Three layers: **edit**, **release**, **update**.

---

## The three layers

### 1. Edit

The author makes a change to their module. Four kinds of change are first-class:

- **Edit a property** — add/change/rank/remove on a sub-property of a resource (an enum value, a transition, a custom field, a workflow state).
- **Delete a resource** — remove a whole card type, workflow, field type, etc.
- **Rename a resource** — change a resource's identifier.
- **Rename the project** — change the module's prefix; rewrites every reference in the project.

A fifth thing — **remove an imported module** — isn't a primitive. It's a high-level command that decomposes into a bunch of property-edit / delete / rename entries.

Two important properties:

- **Non-breaking edits never produce a log entry.** Display name changes, adding an enum value, adding a workflow transition, adding a new resource — all silently update the resource and that's it. Consumers will pick the change up just by reading the new resource file.
- **Every breaking edit shows a preview first.** The maintainer sees what would be affected (X cards, Y links, Z calculation files, data loss expected: yes/no) and confirms before anything is applied.

### 2. Release (version bump)

`cyberismo module bump <new-version>` seals the current log as `migrationLog_<new-version>.jsonl` and starts a fresh empty current log.

Versioning convention (recommended, not enforced):

| Bump | Log content | Meaning |
|------|-------------|---------|
| **Patch** (1.5.0 → 1.5.1) | Empty (no log file) | No breaking changes. Safe to upgrade. |
| **Minor** (1.5 → 1.6) | One or more breaking entries | Normal migration unit. Cascade applies cleanly. |
| **Major** (1.x → 2.x) | May have entries | "Restructuring" — release notes carry the upgrade story; cascade is best-effort. |

The CLI warns (and refuses) if you try to bump as a patch while the log is non-empty.

### 3. Update (consumer pulls a new version)

`cyberismo module update <module> <target-version>`:

1. The resolver computes the set of modules whose versions move (the target plus any transitive dependencies). It returns them in dependency order.
2. For each module in the plan, the engine collects every sealed log between the consumer's current version and the target, in version order.
3. The engine shows a single combined preview: "Updating shared/security 1.5.0 → 1.7.0 will: rename 2 field types in 47 cards, delete 1 card type and 3 cards. Continue?"
4. On confirmation, the engine pulls the new files for each module and replays each log's entries in order. Either every step succeeds, or the operation fails and you `git restore`.

Consumers can't pull files without replay, and they can't run replay without pulling files — `module update` is one atomic operation.

---

## CLI flows

### Editing a module's resources

```bash
# Edit (sub-property change)
cyberismo update foo/cardTypes/bar --change customFields --remove priority
# >> Will remove the priority field from 12 cards. Continue? [y/N]

# Delete a resource
cyberismo delete foo/fieldTypes/obsolete
# >> Will clear this field on 47 cards (data loss). Continue? [y/N]

# Rename a resource
cyberismo rename foo/cardTypes/old-name new-name
# >> Will update 89 references (cards, link types, templates, calculations). Continue? [y/N]

# Rename the project
cyberismo project-rename foo foo-renamed
# >> Will rewrite every prefix-qualified reference in the project (~300 places). Continue? [y/N]
```

All four commands accept `--dry-run` (show the preview and stop) and `--yes` (skip the prompt).

### Releasing

```bash
cyberismo module bump 1.6.0
# >> Sealed migrationLog_1.6.0.jsonl with 3 entries.

cyberismo module bump 1.6.1   # but the log is non-empty
# >> Cannot bump as a patch: current log has 2 breaking entries.
# >> Bump as a minor (1.7.0) instead, or revert the breaking edits.

cyberismo module bump 1.6.1   # log is empty (only non-breaking changes since 1.6.0)
# >> Sealed empty patch release 1.6.1.
```

### Updating

```bash
# Normal minor update
cyberismo module update shared/security 1.6.0
# >> Updating shared/security 1.5.0 → 1.6.0 will apply 3 breaking changes
# >>   (rename priority → urgency, drop severity field, ...).
# >> No conflicts. Continue? [y/N]

# Major boundary
cyberismo module update shared/security 2.0.0
# >> WARNING: 2.0.0 crosses a major version boundary.
# >> Major versions are by convention reserved for structural changes
# >> the cascade may not fully express. Read the release notes before
# >> applying; for purely mechanical majors the cascade may be complete.
# >> Continue? [y/N]

# Diverged minor hotfix (consumer on 1.6.0 — a minor backport
# released AFTER 2.0.0 — wants 2.0.0)
cyberismo module update shared/security 2.0.0
# >> Cannot update from 1.6.0 to 2.0.0: these versions are on diverged branches.
# >> (1.6.0 carries breaking changes that 2.0.0 wasn't built against.)
# >> Move to common ancestor 1.5.0 first, or pick a newer 2.x that includes the 1.6.0 fix.

# Patches are always safe to be on either side of an update:
# a consumer at 1.5.2 (a patch on top of 1.5.0) can update to 2.0.0
# normally, because patches carry no migration entries.

# See what's pending across all imports
cyberismo module update    # no args: show available updates
```

### Recovery from a failed update

```bash
cyberismo module update shared/security 2.0.0
# >> [1/2] shared/security 1.6 → 2.0 ... failed at entry 7:
# >>       Cannot rename security/control → security/safeguard: destination already exists.
# >> Project is in a partial state.
# >> Run `git restore .` to revert, or resolve the conflict and re-run the update.
```

On failure, the engine deliberately does **not** advance the `applied_version` recorded for any module. The on-disk module files may have been partially written (`git restore` recovers them), but the per-project record of what's been applied stays at the pre-update version, so re-running the update after `git restore` is safe and idempotent.

### How the fingerprint works (CLI vs web)

Every breaking edit produces a fingerprint at preview time — a deterministic hash over the proposed change plus the current state of every artefact the cascade would touch. The apply step requires that same fingerprint back.

In the **CLI**, preview and apply happen in one process; the CLI passes the fingerprint internally and the user never sees it. In the **web app**, preview and apply are two HTTP requests, so the client holds the fingerprint between them. If anything changes in the project between the two requests (e.g. another user edited something), the apply returns `409 Conflict` with a fresh preview, the UI re-renders the modal with the updated counts, and the user re-confirms.

The same mechanism gives module-update conflicts (like the diverged-branch case above) a structured shape — they're `ReplayConflict` values with optional `suggested_target_version` and `suggested_intermediate_versions`, so the web UI can render them as clickable recovery actions instead of free-text messages.

---

## Web app flows

The web app exposes the same operations as REST endpoints; the user experience just turns the prompts into modal dialogs.

### Author editing a resource

1. User opens the workflow editor and removes a state.
2. The UI calls `POST /mutations/preview` with the proposed change.
3. Response includes `{ isBreaking: true, preview: { affectedCardCount: 12, dataLossExpected: true, summary: "..." }, fingerprint }`.
4. UI shows a confirmation modal: *"Removing the 'draft' state will reset 12 cards. Continue?"*
5. On confirm, UI calls `POST /mutations/apply` with the proposed change **and** the fingerprint from step 3.
6. If the project state has drifted (another user edited something), the backend returns `409 Conflict` with a fresh preview; the UI re-shows the modal with the updated counts.
7. On success, the UI invalidates the relevant SWR cache and refetches.

### Author releasing a version

A "Release" panel in the UI shows the current log's entries (read-only) and a "Bump version" form. The form has three buttons (Patch / Minor / Major), greyed out as appropriate — patch is disabled if the log is non-empty.

### Consumer updating a module

1. User opens the "Imported modules" panel. SWR-fetched list shows each module's installed and applied versions, plus available updates.
2. User picks "Update shared/security to 1.6.0". UI calls `POST /modules/update/preview`.
3. Response includes the resolved steps, the combined cascade preview, and any `ReplayConflict` items.
4. If there are conflicts, the UI shows them and disables the "Update" button. The user reads what's wrong and resolves it locally (e.g. removes a hardcoded reference from a calculation file).
5. If no conflicts, UI shows a confirmation modal with the cascade summary. For major-boundary updates, the modal carries an extra warning banner.
6. On confirm, UI subscribes to a Server-Sent Event stream at `GET /modules/update/stream/:updateId` and shows a progress bar as each step transitions through `pending → applying → succeeded`.
7. On failure, the panel shows the failed step, the failure summary, and a "Discard partial changes (git restore)" button.

### Two users editing the same project at once

1. User A previews a destructive edit at 10:00. User B previews and applies a different destructive edit at 10:01. User A clicks Confirm at 10:02.
2. The backend recomputes A's fingerprint. It doesn't match (because B's change shifted things). The backend returns `409 Conflict` with a fresh preview.
3. A's UI re-shows the modal with the updated counts. A reviews, confirms again. This time the fingerprint matches and the apply runs.

---

## What this does **not** do

- **Rollback.** Recovery from a failed mid-cascade or failed update is always `git restore`. The migration system has no undo operation.
- **Atomic across processes.** The engine assumes a single writer process per project. Two CLI invocations or two backend instances against the same project at the same time are undefined behaviour. The existing in-process lock handles intra-process concurrency; nothing more.
- **Crash-safe log appends.** A power loss during a log append may drop the last entry. Git is the source of truth.
- **Out-of-band file change detection.** If a maintainer hand-edits an installed module's files, the engine has no way to notice. Don't do that.
- **Resolution of structural redesigns.** Major version upgrades that rewrite templates and calculations need maintainer-written prose guidance; the migration log can only carry mechanical cascades.
- **Reverse migrations / downgrades.** No mechanism for going from a newer version to an older one. Use git.
- **MCP tool surface.** Out of scope for this spec; CLI and web only.

---

## Where it fits in the codebase

| Concept | File / location |
|---|---|
| Migration log file (current) | `.cards/migrationLog.jsonl` |
| Migration log files (sealed) | `.cards/.../migrationLog_<version>.jsonl` |
| Append / seal | `tools/data-handler/src/utils/configuration-logger.ts` (existing) |
| Engine entry point | `tools/data-handler/src/mutations/plan.ts` (new) |
| Dispatcher | `tools/data-handler/src/mutations/dispatcher.ts` (new) |
| Per-cascade handlers | `tools/data-handler/src/mutations/handlers/*.ts` (new — replaces cascade code currently inside `tools/data-handler/src/resources/*.ts`) |
| Replay engine | `tools/data-handler/src/mutations/replay.ts` (new) |
| Module update command | `tools/data-handler/src/commands/module-update.ts` (new) |
| Module resolver (transitive deps, diverged-branch detection) | `tools/data-handler/src/modules/resolver.ts` (existing) |
| CLI commands | `tools/cli/src/index.ts` (additions) |
| HTTP routes | `tools/backend/` (additions: `/mutations/preview`, `/mutations/apply`, `/modules/update/*`) |

Existing resource subclasses (`field-type-resource.ts`, `card-type-resource.ts`, `workflow-resource.ts`, `link-type-resource.ts`) shrink as their cascade logic moves into per-handler files. The on-disk format of the migration log doesn't change.

---

## Open questions worth deciding

1. **Should breaking edits refuse if the git working tree is dirty?** Otherwise `git restore` after a failed cascade also discards the user's uncommitted work. Small change to require `gitManager.hasUncommittedChanges() === false` as a precondition.
2. **Major-bump warning frequency.** Show once per update (current intent) or once per crossed boundary (matters only if a single update crosses two majors, which is unusual)?
3. **Cross-major UX in the CLI.** Right now you'd need release notes to be linked from the CLI message. Should `cyberismo module update` print a URL pulled from the module's metadata?
4. **What goes in `cardsConfig.json` after a module is removed.** The CLI command for "remove imported module" emits primitive log entries and then drops the import. Should the drop be atomic with the entries, or sequenced after?

---

## TL;DR for the impatient

- Author edits → preview shown → confirmed → applied + logged.
- Patches have empty logs. Minors carry breaking changes. Majors require release notes.
- Consumer updates pull files and replay logs in one atomic step. Failure = `git restore`.
- No MCP. No automatic rollback. Single-process assumption. Git is the safety net.
