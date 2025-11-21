import * as esbuild from 'esbuild';
import { join } from 'node:path';
import { readdir } from 'node:fs/promises';

const migrationsDir = 'src/schema/migrations';
const outDir = 'dist/schema/migrations';

// First, build the migration-interfaces file that migrations depend on
await esbuild.build({
  entryPoints: [join(migrationsDir, 'migration-interfaces.ts')],
  bundle: false,
  outfile: join(outDir, 'migration-interfaces.js'),
  format: 'esm',
  platform: 'node',
  target: 'es2023',
});

// Find all migration directories. Each migration folder name is just a number
const entries = await readdir(migrationsDir, { withFileTypes: true });
const migrationVersions = entries
  .filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name))
  .map((entry) => entry.name);

for (const version of migrationVersions) {
  await esbuild.build({
    entryPoints: [join(migrationsDir, version, 'index.ts')],
    bundle: false,
    outfile: join(outDir, version, 'index.js'),
    format: 'esm',
    platform: 'node',
    target: 'es2023',
  });
}

console.log(
  `Built migration-interfaces.js and ${migrationVersions.length} migration(s)`,
);
