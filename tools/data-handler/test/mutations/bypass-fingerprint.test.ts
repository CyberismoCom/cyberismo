// tools/data-handler/test/mutations/bypass-fingerprint.test.ts

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../src/containers/project.js';
import { ResourceMutations } from '../../src/mutations/plan.js';
import { resourceName } from '../../src/utils/resource-utils.js';
import { copyDir, deleteDir } from '../../src/utils/file-utils.js';

const testDir = join(import.meta.dirname, 'tmp-bypass-fingerprint');
const fixturePath = join(testDir, 'valid', 'decision-records');

/**
 * `bypassFingerprint: true` is the escape hatch the module-update replay
 * uses to apply someone else's breaking change against the consumer without
 * insisting on a fingerprint round-trip. Before the fix, the replay would
 * throw 'fingerprint required' and silently fail.
 */
describe('ResourceMutations.apply with bypassFingerprint', () => {
  let project: Project;

  beforeAll(async () => {
    await mkdir(testDir, { recursive: true });
    await copyDir('test/test-data/', testDir);
    project = new Project(fixturePath);
    await project.populateCaches();
  });
  afterAll(async () => {
    await deleteDir(testDir);
  });

  it('rejects a cascade-affecting rename without fingerprint by default', async () => {
    const mutations = new ResourceMutations(project);
    const input = {
      kind: 'rename' as const,
      target: resourceName('decision/fieldTypes/finished'),
      newIdentifier: 'completed',
    };
    await expect(mutations.apply(input)).rejects.toThrow(
      /fingerprint required/,
    );
  });

  it('applies the same rename when bypassFingerprint is set', async () => {
    const mutations = new ResourceMutations(project);
    const input = {
      kind: 'rename' as const,
      target: resourceName('decision/fieldTypes/finished'),
      newIdentifier: 'completed',
    };
    const result = await mutations.apply(input, { bypassFingerprint: true });
    expect(result).toEqual({ success: true });
    // After rename, the new resource exists and the old does not.
    expect(
      project.resources.byType('decision/fieldTypes/completed', 'fieldTypes'),
    ).toBeDefined();
  });
});
