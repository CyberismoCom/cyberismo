import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { cleanOrphans } from '../../src/modules/orphans.js';
import { makeProjectStub } from '../helpers/module-fixtures.js';
import type {
  ModuleSetting,
  ModuleSettingOptions,
} from '../../src/interfaces/project-interfaces.js';
import type { ModuleInstallation } from '../../src/modules/types.js';

interface ChildDep {
  name: string;
  location?: string;
  version?: string;
}

function makeProject(basePath: string, modules: ModuleSetting[]) {
  return makeProjectStub({ basePath, modules });
}

async function installModule(
  basePath: string,
  name: string,
  children: ChildDep[],
  extra: Partial<ModuleSettingOptions> = {},
) {
  const dir = join(basePath, '.cards', 'modules', name);
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, 'cardsConfig.json'),
    JSON.stringify({
      cardKeyPrefix: name,
      name,
      version: extra.version ?? '1.0.0',
      modules: children.map((c) => ({
        name: c.name,
        location: c.location ?? `https://example.com/${c.name}.git`,
        ...(c.version ? { version: c.version } : {}),
      })),
    }),
  );
}

describe('modules/orphans', () => {
  let projectDir: string;

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), 'modules-orphans-test-'));
    await mkdir(join(projectDir, '.cards', 'local'), { recursive: true });
  });

  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true });
  });

  it('returns 0 and touches nothing when every installation is referenced', async () => {
    await installModule(projectDir, 'A', [{ name: 'B' }]);
    await installModule(projectDir, 'B', [{ name: 'C' }]);
    await installModule(projectDir, 'C', []);

    const { project, refreshAfterModuleChange } = makeProject(projectDir, [
      { name: 'A', location: 'https://example.com/A.git' },
    ]);

    const removed = await cleanOrphans(project);
    expect(removed).toBe(0);
    expect(existsSync(join(projectDir, '.cards', 'modules', 'A'))).toBe(true);
    expect(existsSync(join(projectDir, '.cards', 'modules', 'B'))).toBe(true);
    expect(existsSync(join(projectDir, '.cards', 'modules', 'C'))).toBe(true);
    // No deletions => no cache invalidation.
    expect(refreshAfterModuleChange).not.toHaveBeenCalled();
  });

  it('cascades A → B → C removal when A is no longer declared', async () => {
    await installModule(projectDir, 'A', [{ name: 'B' }]);
    await installModule(projectDir, 'B', [{ name: 'C' }]);
    await installModule(projectDir, 'C', []);

    const { project, refreshAfterModuleChange } = makeProject(projectDir, []);

    const removed = await cleanOrphans(project);
    expect(removed).toBe(3);
    expect(existsSync(join(projectDir, '.cards', 'modules', 'A'))).toBe(false);
    expect(existsSync(join(projectDir, '.cards', 'modules', 'B'))).toBe(false);
    expect(existsSync(join(projectDir, '.cards', 'modules', 'C'))).toBe(false);
    expect(refreshAfterModuleChange).toHaveBeenCalledTimes(1);
  });

  it('removes untracked installations nobody references', async () => {
    // Project only declares A. A declares no children. B and C exist
    // but nothing reaches them — they are orphaned.
    await installModule(projectDir, 'A', []);
    await installModule(projectDir, 'B', []);
    await installModule(projectDir, 'C', []);

    const { project } = makeProject(projectDir, [
      { name: 'A', location: 'https://example.com/A.git' },
    ]);

    const removed = await cleanOrphans(project);
    expect(removed).toBe(2);
    expect(existsSync(join(projectDir, '.cards', 'modules', 'A'))).toBe(true);
    expect(existsSync(join(projectDir, '.cards', 'modules', 'B'))).toBe(false);
    expect(existsSync(join(projectDir, '.cards', 'modules', 'C'))).toBe(false);
  });

  it('throws with a graph dump when maxIterations is too small for the cascade', async () => {
    // A → B → C → D cascade needs 3 full passes. Cap at 1.
    await installModule(projectDir, 'A', [{ name: 'B' }]);
    await installModule(projectDir, 'B', [{ name: 'C' }]);
    await installModule(projectDir, 'C', []);

    const { project } = makeProject(projectDir, []);

    await expect(cleanOrphans(project, { maxIterations: 1 })).rejects.toThrow(
      /cleanOrphans exceeded maxIterations/,
    );
  });

  it('invokes onRemove exactly once per removed installation', async () => {
    await installModule(projectDir, 'A', [{ name: 'B' }]);
    await installModule(projectDir, 'B', []);

    const { project } = makeProject(projectDir, []);
    const removed: ModuleInstallation[] = [];

    const count = await cleanOrphans(project, {
      onRemove: (installation) => removed.push(installation),
    });

    expect(count).toBe(2);
    expect(removed.map((i) => i.name).sort()).toEqual(['A', 'B']);
  });

  it('does not mutate the persisted top-level declarations', async () => {
    // CleanOrphans is file-system-only; configuration.modules stays
    // exactly what the caller passed in.
    await installModule(projectDir, 'A', []);
    await installModule(projectDir, 'Ghost', []);

    const declarations: ModuleSetting[] = [
      { name: 'A', location: 'https://example.com/A.git' },
    ];
    const { project } = makeProject(projectDir, declarations);

    const removed = await cleanOrphans(project);
    expect(removed).toBe(1);
    expect(declarations).toEqual([
      { name: 'A', location: 'https://example.com/A.git' },
    ]);
  });
});
