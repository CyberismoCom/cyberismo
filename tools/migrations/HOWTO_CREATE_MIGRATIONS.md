# Schema Migrations

This directory contains schema migrations for the Cyberismo tool.

## Directory Structure

Each migration is stored in a numbered subdirectory corresponding to the target schema version:

```
migrations/
├── 2/
│   └── index.ts    (migration from v1 to v2)
└── 3/
    └── index.ts    (migration from v2 to v3)
...
```

## Migration execution order

Migrations are executed sequentially in ascending order.
For example, migrating from version 1 to version 3 would:

1. Execute migration in `2/index.ts` (v1 → v2)
2. Update project schemaVersion to 2
3. Execute migration in `3/index.ts` (v2 → v3)
4. Update project schemaVersion to 3

## Creating a new migration

### 1. Generate migration scaffolding

From the project root directory, run:

```
pnpm create-migration
```

This command will:

- Automatically determine the next migration number
- Create a new directory under `tools/migrations/src`
- Generate an `index.ts` file with complete scaffolding and inline documentation

### 2. Implement migration logic

Open the generated `index.ts` file and implement your migration logic.

#### `migrate(context)` - Perform migration (required)

**Purpose**: Execute the actual migration

**What to include**:

- Modify files in `cardRoot` and `.cards` directories as needed, using direct filesystem access.
- Use the paths provided in the `MigrationContext` (such as `cardRootPath`, `cardsConfigPath`, etc.) to locate and update resources (cardTypes, workflows, etc.).
- There is currently no Project API or `project` field in the context; access and update files directly as required by your migration.
- Log progress for visibility during migration
- Handle errors with descriptive messages
- Be idempotent: migration should handle being run multiple times safely

### 3. Migration Context

The `MigrationContext` object passed to each migration function provides:

- `cardRootPath`: Absolute path to the project's cardRoot directory
- `cardsConfigPath`: Absolute path to the .cards directory
- `fromVersion`: Current schema version before migration
- `toVersion`: Target schema version after migration

## Working with Project Resources

Migrations interact with project resources directly via the filesystem. Use the paths provided in `MigrationContext` (such as `cardRootPath` and `cardsConfigPath`) along with Node.js modules like `fs` and `path` to read, modify, or write files as needed during migration. There is no Project API instance available during migration execution.

## Best Practices

1. **Be idempotent**: Migrations should handle being run multiple times safely
2. **Log progress**: Use `console.log()` or a logger to provide feedback during migration
3. **Handle errors**: Return proper error messages and Error objects
4. **Test thoroughly**: Test migrations on sample projects before deploying
5. **Document changes**: Add comments explaining what the migration does
6. **One migration, one change**: Better to make small migrations that make one change than merge multiple changes to one big migration.

## Troubleshooting

### Migration fails to load

- Ensure `index.ts` exports a default object
- Check that the migration implements at least the `migrate()` function
- Verify imports are correct

### Migration fails during execution

- Check the error message in the result
- Projects are git-tracked, so use `git restore .` to revert changes if needed

### Schema version not updating

- Ensure migration returns `{ success: true }`
- Check that `ProjectConfiguration.save()` is being called
- Verify file permissions on cardsConfig.json
