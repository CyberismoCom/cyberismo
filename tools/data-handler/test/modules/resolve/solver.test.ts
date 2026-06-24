import { expect, it, describe, beforeAll, afterAll, beforeEach } from 'vitest';

import { mkdir, writeFile } from 'node:fs/promises';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { copyDir } from '../../../src/utils/file-utils.js';
import { getTestProject } from '../../helpers/test-utils.js';
import { InMemorySource } from '../in-memory-source.js';
import { resolve } from '../../../src/modules/resolve/solver.js';
import type { ModuleSetting } from '../../../src/interfaces/project-interfaces.js';

const baseDir = import.meta.dirname;
const testDir = join(baseDir, 'tmp-resolve-solver-tests');
const minimalPath = join(testDir, 'valid/minimal');

function buildProjectWithModules(modules: ModuleSetting[]) {
  const project = getTestProject(minimalPath);
  project.configuration.modules.splice(
    0,
    project.configuration.modules.length,
    ...modules,
  );
  return project;
}

async function installModule(
  project: ReturnType<typeof getTestProject>,
  m: {
    name: string;
    version: string;
    modules?: Array<{ name: string; location: string; version?: string }>;
    seals?: Array<[string, string]>;
  },
) {
  const dir = join(project.paths.modulesFolder, m.name);
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, 'cardsConfig.json'),
    JSON.stringify({
      name: m.name,
      cardKeyPrefix: m.name,
      version: m.version,
      modules: m.modules ?? [],
    }),
  );
  if (m.seals?.length) {
    await mkdir(join(dir, 'migrations'), { recursive: true });
    for (const [f, t] of m.seals) {
      await writeFile(
        join(dir, 'migrations', `migrationLog_${f}_${t}.jsonl`),
        '',
      );
    }
  }
}

describe('resolve solver', () => {
  beforeAll(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir(join(baseDir, '../../test-data'), testDir);
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    rmSync(minimalPath, { recursive: true, force: true });
    await copyDir(join(baseDir, '../../test-data/valid/minimal'), minimalPath);
  });

  it('verify: no changes when the installed set is coherent', async () => {
    const project = buildProjectWithModules([
      {
        name: 'A',
        location: 'https://x/A.git',
        version: '^1.0.0',
        private: false,
      },
    ]);
    await installModule(project, {
      name: 'A',
      version: '1.6.0',
      modules: [{ name: 'B', location: 'https://x/B.git', version: '>=1.3.0' }],
    });
    await installModule(project, { name: 'B', version: '1.3.0' });

    const source = new InMemorySource(new Map(), new Map());
    const result = await resolve(
      project,
      { kind: 'verify' },
      { sourceLayer: source, tempDir: testDir },
    );

    expect(result).toEqual({ ok: true, changes: [] });
  });
});
