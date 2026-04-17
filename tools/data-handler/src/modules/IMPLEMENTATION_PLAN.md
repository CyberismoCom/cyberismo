# Module system — implementation plan

**Authority:** `module-system.allium` (this folder). Phrases like "spec says" below refer to that file.
**Target home:** `tools/data-handler/src/modules/`.
**Goal:** bring the code into line with the spec. Delete the monolithic `ModuleManager`, move module behaviour into a layered implementation that mirrors the spec's rules and entities, and close the specific behavioural drifts identified in the audit.

---

## Non-negotiable behavioural outcomes

Every phase below serves these outcomes. Each is a point where code currently diverges from spec.

1. `ImportModule` is **upsert**. Re-importing an already-declared module updates its range. Only a source-location mismatch errors (`DeclarationAndInstallationAgreeOnSource`).
2. `RemoveModule` cascades `CleanOrphans` to a **fixed point**, not one level.
3. `CleanOrphans` runs after **every** mutation (`ImportModule`, `UpdateModules`, `RemoveModule`). The invariant `NoOrphanInstallations` holds post-operation.
4. Version resolution is **per-declaration, first-encounter-wins** on transitive dedup. Cross-graph constraint intersection is deleted; it is deferred to a future ASP pass.
5. Transitive range mismatches surface as `DiamondVersionConflict` (warn + structured event), not as a hard throw.
6. `CheckUpdates` is tolerant: an unreachable remote yields `status: source_unreachable`, not a silent "no update" row.
7. `CheckUpdates` produces the spec's `status` enum (`up_to_date`, `update_available`, `range_blocks_update`, `range_unsatisfiable`, `source_unreachable`, `drifted`).
8. `ReplaceInstallation` is two-phase: all fetches first (network), then local apply. A mid-install failure does not leave the project with partial installations.

If a PR claims to complete a phase but the corresponding outcome is not covered by a test, the phase is not done.

---

## Target file layout

```
tools/data-handler/src/modules/
  module-system.allium      (spec, authoritative)
  IMPLEMENTATION_PLAN.md    (this file)
  types.ts                  Phase 1
  version.ts                Phase 2
  source.ts                 Phase 3
  inventory.ts              Phase 4
  resolver.ts               Phase 5
  installer.ts              Phase 6
  orphans.ts                Phase 7
  index.ts                  barrel
```

No file in this folder imports from `src/commands/`. The command files orchestrate these layers; the layers do not reach back into the commands.

---

## Phases

Each phase is one PR. Each compiles, lints, and passes `pnpm test` on its own.

### Phase 0 — remove `SPEC.md`

`tools/data-handler/src/modules/SPEC.md` is older than the Allium spec and contradicts it (graph-wide intersection, different data model, pre-`ReplaceInstallation`). No code references it.

- Delete `SPEC.md`.
- That leaves `module-system.allium` and this plan as the two source documents in the folder.

### Phase 1 — types (`modules/types.ts`)

Introduce TypeScript mirrors of the spec's entities and value types. No behaviour change yet.

- `Source { location: string; private?: boolean }`
- `Version { value: string }` — or keep as a branded string alias; pick one and stay consistent.
- `VersionRange { range: string }` — ditto.
- `RemoteQueryOutcome { reachable: boolean; latest?: Version; latestSatisfying?: Version }`
- `ModuleDeclaration { project, name, source, versionRange?, parent?: InstallationRef }` — `parent` is populated for transitive declarations.
- `ModuleInstallation { project, name, source, version?, path }`
- `ModuleCheckReport { project, declaration, installation?, latestVersion?, latestSatisfying?, status: CheckStatus }`
- `CheckStatus` = `'up_to_date' | 'update_available' | 'range_blocks_update' | 'range_unsatisfiable' | 'source_unreachable' | 'drifted'`
- `DiamondVersionConflict { project, name, installedVersion, rejectingRange, rejectingParent }`

Backwards compatibility:

- Keep `ModuleSetting` in `interfaces/project-interfaces.ts` as a type alias for `ModuleDeclaration` for one release. External consumers (CLI / MCP / web) continue to compile unchanged.

### Phase 2 — pure helpers (`modules/version.ts`)

Move tag helpers and shrink the existing resolver down to what the spec permits.

- Port `versionToTag`, `tagToVersion` from `utils/git-manager.ts` into `modules/version.ts`. Re-export from `git-manager.ts` for one release to avoid a wide import churn.
- Implement `pickVersion(available: string[], range?: string): string | undefined` — a thin `semver.maxSatisfying` wrapper.
- Implement `satisfies(version: string, range: string): boolean`.
- Keep `validateVersionAgainstConstraints` — it validates a single version against multiple declared ranges, which the `update <name> <exact-version>` path still needs. It does **not** intersect.
- **Delete** `resolveModuleVersions` and the `VersionConstraint` type from `utils/version-resolver.ts`. This is the graph-wide intersection the spec defers to ASP. All current call sites (one: `ModuleManager.resolveVersions`) disappear in Phase 5.

No other behaviour changes in this phase — only file moves and the deletion.

### Phase 3 — source layer (`modules/source.ts`)

Extract git/file I/O out of `ModuleManager`. No version or module concepts here.

- `SourceLayer.fetch(target, destRoot, nameHint): Promise<string>`
  - Shallow clone for git URLs (`--depth 1`, `--branch <ref>` when provided).
  - No-op for `file:` URLs (return the resolved path).
- `SourceLayer.listRemoteVersions(location, remoteUrl?): Promise<string[]>`
  - Wraps `GitManager.listRemoteVersionTags`. Empty array for file sources.
- `SourceLayer.queryRemote(source, credentials?): Promise<RemoteQueryOutcome>`
  - Spec's `query_remote`. Catches transient failures (network error, auth failure, missing remote) and returns `{reachable: false}` rather than throwing. Real programmer errors (bad URL format) still throw.

Credential URL injection (`buildRemoteUrl`) **does not live here** — it lives in the resolver (Phase 5), and the resolver passes a ready `remoteUrl` into the source layer. This keeps the source layer credential-agnostic and testable without fixtures.

### Phase 4 — inventory (`modules/inventory.ts`)

Read-only. Closes the "CheckUpdates peeks at ModuleManager internals" drift.

- `declared(project): ModuleDeclaration[]` — maps `project.configuration.modules`, setting `parent = undefined` for every entry (all persisted declarations are top-level by definition).
- `installed(project): Promise<ModuleInstallation[]>` — walks `.cards/modules/*`, reads each module's own `cardsConfig.json` for the installed `version`.

`ModuleManager.readModuleVersion` becomes a one-line delegation to `inventory.installed(...).find(...)`. All call sites switch. Then delete `readModuleVersion` in Phase 9.

### Phase 5 — resolver (`modules/resolver.ts`)

This is the biggest behavioural change. Implements the spec's `ReconcileTransitives` semantics directly.

- `Resolver.resolve(roots: ModuleDeclaration[], options): Promise<ResolvedModule[]>`
- Algorithm: BFS over declarations.
  - For each declaration, if name is unseen:
    - Pick version via `pickVersion(await source.listRemoteVersions(location), versionRange)`.
    - Fetch at that tag. Read its `cardsConfig.json`. Enqueue its declared deps (with `parent` set).
    - Record the resolution, keyed by name.
  - For each subsequent encounter of the same name:
    - If the existing resolution's version satisfies the new declaration's range, reuse.
    - Otherwise, emit `DiamondVersionConflict`, keep the first resolution. **Do not throw.**
- Options:
  - `overrides?: Map<name, version>` — used by `updateModule(name, exactVersion)`. Returned verbatim. Resolver does not revalidate against the declared range; that's the caller's job (via `validateVersionAgainstConstraints`).
  - `credentials?: Credentials`.
  - `tempDir: string` — shared with installer in Phase 6.
- Credential injection happens in the resolver before each `source.listRemoteVersions` / `source.fetch` call.

Throws only on:

- Conflicting `location` or `private` for the same name (invariant `DeclarationAndInstallationAgreeOnSource`).
- No remote version satisfies a declared range, and no override was provided.

Not in this phase: constraint intersection. That logic lived in `utils/version-resolver.ts` and was deleted in Phase 2. Do not reintroduce it.

### Phase 6 — installer (`modules/installer.ts`)

Spec's `ReplaceInstallation`, with the two-phase `@guidance` applied.

- `Installer.install(project, resolved: ResolvedModule[], options): Promise<void>`
- Network phase: for each resolved module that isn't in `options.skip`, fetch it into `tempDir`. If any fetch fails, abort before touching `.cards/modules/`.
- Apply phase: for each staged module, atomically replace `.cards/modules/<name>/` (rename-based or rm-then-copy, pick one and stick with it).
- Persist declarations in the project's config. **Only the range is persisted**, not the resolved tag. This matches current behaviour; do not regress.
- Temp-dir cleanup on success. Spec open question #4: leave on failure for debugging — match current behaviour.

### Phase 7 — orphan cleanup (`modules/orphans.ts`)

Spec's `CleanOrphans`. Pure computation + filesystem deletes.

- `cleanOrphans(project): Promise<void>`
- Loop until stable:
  1. `referenced = new Set<name>()`
  2. For every top-level declaration: add its name.
  3. For every installation: read its own `cardsConfig.json`, add every declared dep's name to `referenced`.
  4. For every installation whose name is not in `referenced`: remove its `.cards/modules/<name>/` folder.
  5. If any installation was removed, repeat.

`pnpm test` must prove the loop terminates on a finite graph. Add a hard iteration cap (e.g. `installations.length + 1`) as a safety net — if hit, throw with a graph dump.

### Phase 8 — rewire commands

Rewrite the three command files against the new layers. Each method becomes ~10–20 lines.

`commands/import.ts`:

```
importModule(source, destination?, options?):
  decl = makeRootDeclaration(source, options)
  declared = inventory.declared(project)
  resolved = resolver.resolve([decl, ...declared], { credentials, tempDir, overrides })
  installer.install(project, resolved, { credentials, tempDir })
  configuration.upsertModule(decl)          // upsert, not add
  cleanOrphans(project)
```

Add `configuration.upsertModule` alongside `addModule`; keep `addModule` for now but deprecate.

`commands/update.ts` (or keep in `import.ts` for one release):

```
updateModule(name, credentials?, exactVersion?):
  declared = inventory.declared(project)
  overrides = exactVersion ? new Map([[name, exactVersion]]) : undefined
  if (exactVersion) validateVersionAgainstConstraints(name, exactVersion, constraintsFor(name))
  resolved = resolver.resolve(declared, { credentials, overrides, tempDir })
  installer.install(project, resolved, { credentials, tempDir })
  cleanOrphans(project)

updateAllModules(credentials?):
  declared = inventory.declared(project)
  resolved = resolver.resolve(declared, { credentials, tempDir })
  installer.install(project, resolved, { credentials, tempDir })
  cleanOrphans(project)
```

`commands/check-updates.ts`:

```
checkUpdates(name?, credentials?):
  declared = inventory.declared(project).filter(byName(name))
  installed = await inventory.installed(project)
  return Promise.all(declared.map(d => buildReport(d, installed, source.queryRemote(d.source, credentials))))
```

`buildReport` maps `{decl, installation, outcome}` to a `ModuleCheckReport` with the spec's status enum (`check_status_of` in the spec).

Shape change: `ModuleUpdateStatus` → `ModuleCheckReport`. Handle in one of two ways:

- Option A (recommended): return both shapes from `checkUpdates` for one release — `status` enum is the source of truth, booleans are derived for compat. Update CLI / MCP / web in a follow-up PR per surface.
- Option B: flip everything in the same PR. Larger blast radius; only if the CLI / MCP / web consumers are easy to update at the same time.

`commands/remove.ts`:

```
removeModule(name):
  decl = declared.find(d => d.name === name)
  if (!decl) throw (handles "transitive-only" case)
  deleteInstallationFiles(name)
  configuration.removeModule(name)
  cleanOrphans(project)            // fixed-point cascade
```

### Phase 9 — delete `ModuleManager`

By this point every public method of `ModuleManager` has been reimplemented:

| `ModuleManager` method                                  | Replaced by                              |
| ------------------------------------------------------- | ---------------------------------------- |
| `importGitModule` / `importFileModule`                  | `resolver.resolve` + `installer.install` |
| `updateModule` / `updateModules` / `updateDependencies` | `resolver.resolve` + `installer.install` |
| `removeModule`                                          | `commands/remove.ts` + `cleanOrphans`    |
| `listAvailableVersions`                                 | `source.listRemoteVersions`              |
| `readModuleVersion`                                     | `inventory.installed`                    |

Delete:

- `src/module-manager.ts`
- All `new ModuleManager(project)` call sites
- `ModuleManager.prototype` spies in tests (they should already be gone after the per-layer tests land)

Keep `ModuleSetting` as a type alias for `ModuleDeclaration` until the next major release.

### Phase 10 — tests

Structure tests per layer. No more `ModuleManager.prototype` spying.

New tests:

- `modules/version.test.ts` — `pickVersion`, `satisfies`, tag helpers. Pure.
- `modules/source.test.ts` — against the fake-remote fixture from `test/module-manager.test.ts`. Cases: fetch-at-tag, fetch-default-branch, list-tags, missing-remote, file passthrough, `queryRemote` returns `{reachable: false}` on transient failure.
- `modules/resolver.test.ts` — hand-written in-memory `SourceLayer` fake. Cases: simple root; deep tree; dedup with compatible ranges (no warning); dedup with incompatible ranges (warn, keep first, emit `DiamondVersionConflict`); override of one module's version; file + git mix; no-version-satisfies-range throws.
- `modules/installer.test.ts` — in-memory `SourceLayer` fake returning prebuilt module trees. Hand-crafted `ResolvedModule[]` as input. Asserts files land in `.cards/modules/` and persisted declarations retain the range.
- `modules/inventory.test.ts` — real filesystem, small fixtures.
- `modules/orphans.test.ts` — hand-crafted `.cards/modules/` trees. Cases: nothing orphaned; single orphan; cascading orphans (A → B → C, remove A, C eventually goes away); fixed-point termination.

Integration tests (one per command):

- `command-import.test.ts` — re-import with a new range upserts (does not throw).
- `command-import.test.ts` — re-import with a different source location throws (`DeclarationAndInstallationAgreeOnSource`).
- `command-update.test.ts` — diamond with compatible ranges resolves cleanly. With incompatible ranges, resolves with a warning (not a throw).
- `command-update.test.ts` — after update, no `.cards/modules/<name>/` exists for modules no longer referenced anywhere.
- `command-check-updates.test.ts` — unreachable remote produces `status: source_unreachable`, not a thrown error.
- `command-check-updates.test.ts` — installed version outside declared range produces `status: drifted`.
- `command-remove.test.ts` — removing a root with a deep transitive chain removes everything that becomes orphaned.
- `command-remove.test.ts` — removing a transitive-only module errors.

---

## Risks and call-outs

1. **Relaxing cross-graph intersection.** Projects that currently fail fast on true constraint conflicts will instead see a `DiamondVersionConflict` warning and the first-encountered version. Per spec this is intentional. Flag in release notes.
2. **`ModuleCheckReport` is a shape change.** CLI / MCP / web all consume `ModuleUpdateStatus`. Prefer Option A above (dual-shape for one release).
3. **Two-phase install changes temp-dir lifecycle.** Keep the "leave on failure, clean on success" behaviour of the current code (spec open question #4).
4. **Source-mismatch on re-import is now an error, but re-import with the same source is now allowed.** Document: "re-importing a module with a different URL is rejected; re-importing to change the version range is the supported upgrade path."
5. **No config-file migration.** `cardsConfig.json` schema is unchanged; transitive declarations are virtual.

---

## Definition of done

- `tools/data-handler/src/module-manager.ts` and `tools/data-handler/src/utils/version-resolver.ts` no longer exist.
- All module behaviour lives under `tools/data-handler/src/modules/`.
- Every rule in `module-system.allium` has a clearly identifiable entry point in one of `resolver.ts`, `installer.ts`, `orphans.ts`, or the command files.
- Every invariant in `module-system.allium` is covered by at least one test.
- `pnpm test`, `pnpm lint`, `pnpm build` all green.
