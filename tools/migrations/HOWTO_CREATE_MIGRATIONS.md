# Schema Migrations

This package contains schema migrations for the Cyberismo tool: the
migration contract (`src/migration-interfaces.ts`), the version registry
(`src/registry.ts`), and the in-process chain runner (`src/run-chain.ts`).

## Directory structure

Each migration is a numbered subdirectory named after the target schema
version:

```
src/
├── 2/
│   └── index.ts    (migration from v1 to v2)
├── 3/
│   └── index.ts    (migration from v2 to v3)
...
```

## Migration execution order

Migrations run sequentially in ascending order. For example, migrating
from version 1 to version 3:

1. Run `2/index.ts` (v1 → v2), then stamp schemaVersion 2
2. Run `3/index.ts` (v2 → v3), then stamp schemaVersion 3

The chain must be contiguous: the runner refuses to run if any
intermediate migration is missing.

## Migration scope

A migration owns the **entire** `.cards` tree it is given:

- `.cards/local/` — the project's own resources.
- `.cards/modules/<prefix>/` — every installed module. Installed module
  content is always at the same schema level as the project, and
  `cyberismo migrate` is the only thing that moves it forward, so a
  structural change must be applied to installed module trees too.

The same migration also runs against _staged module checkouts_ during
`cyberismo import module` / `cyberismo update modules`: a module released
at an older schema version is migrated in the staging directory before its
resources are copied into the project. Therefore:

- Do not assume the tree is the host project.
- Tolerate a missing `cardRoot` — staged file-source modules stage only
  the resources folder.
- Migrations must be structural and idempotent: they transform file
  layout and format, never project-specific content.

## Creating a new migration

A migration is a single async function that transforms the tree in place
and throws on failure:

```typescript
import type { Migration } from '../migration-interfaces.js';

const migration: Migration = async (context) => {
  console.log(
    `Migrating from schema version ${context.fromVersion} to ${context.toVersion}`,
  );
  // transform files under context.cardsConfigPath / context.cardRootPath
};

export default migration;
```

1. Copy the newest `src/<N>/index.ts` to `src/<N+1>/index.ts` and edit it.
2. Register it in `src/registry.ts` (import + map entry). `SCHEMA_VERSION`
   is derived from the registry, so it updates automatically.
3. Add tests under `test/`.

The `MigrationContext` provides `cardRootPath`, `cardsConfigPath`,
`fromVersion` and `toVersion`. Access files directly with `node:fs` —
there is no Project API during migration.

## Best practices

1. **Be idempotent**: a migration must handle being run multiple times
   safely.
2. **Log progress**: `console.log()` what changed.
3. **Throw on failure** with a descriptive message. The runner stamps
   `schemaVersion` only after a step succeeds, so a failed run leaves a
   consistent, resumable tree; version control is the recovery mechanism.
4. **One migration, one change**: prefer small migrations over one big
   one.
