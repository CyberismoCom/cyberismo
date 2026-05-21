import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import {
  readAppliedModules,
  writeAppliedModules,
  recordModuleApplied,
} from '../../../src/mutations/module-update/applied-modules.js';

const testDir = join(import.meta.dirname, 'tmp-applied-modules');

describe('appliedModules.json', () => {
  let projectPath: string;

  beforeAll(async () => {
    projectPath = join(testDir, `proj-${Date.now()}`);
    await mkdir(join(projectPath, '.cards', 'local'), { recursive: true });
  });
  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('readAppliedModules returns empty array when file absent', async () => {
    expect(await readAppliedModules(projectPath)).toEqual([]);
  });

  it('writes and reads round-trip', async () => {
    await writeAppliedModules(projectPath, [
      {
        prefix: 'shared/security',
        installedVersion: '1.5.0',
        appliedVersion: '1.5.0',
      },
    ]);
    const result = await readAppliedModules(projectPath);
    expect(result).toHaveLength(1);
    expect(result[0].prefix).toBe('shared/security');
  });

  it('recordModuleApplied updates an existing entry', async () => {
    await writeAppliedModules(projectPath, [
      {
        prefix: 'shared/security',
        installedVersion: '1.5.0',
        appliedVersion: '1.5.0',
      },
    ]);
    await recordModuleApplied(projectPath, 'shared/security', '1.6.0');
    const result = await readAppliedModules(projectPath);
    expect(result[0].installedVersion).toBe('1.6.0');
    expect(result[0].appliedVersion).toBe('1.6.0');
  });

  it('recordModuleApplied adds a new entry when not present', async () => {
    await writeAppliedModules(projectPath, []);
    await recordModuleApplied(projectPath, 'shared/crypto', '1.0.0');
    const result = await readAppliedModules(projectPath);
    expect(result.find((m) => m.prefix === 'shared/crypto')).toBeDefined();
  });
});
