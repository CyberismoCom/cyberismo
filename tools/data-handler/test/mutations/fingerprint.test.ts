import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { computeFingerprint } from '../../src/mutations/fingerprint.js';
import { deleteDir } from '../../src/utils/file-utils.js';
import { resourceName } from '../../src/utils/resource-utils.js';

const testDir = join(import.meta.dirname, 'tmp-fingerprint');

describe('computeFingerprint', () => {
  beforeAll(async () => {
    await mkdir(testDir, { recursive: true });
    await writeFile(join(testDir, 'a.json'), '{"x":1}');
    await writeFile(join(testDir, 'b.json'), '{"y":2}');
  });
  afterAll(async () => {
    await deleteDir(testDir);
  });

  const input = {
    kind: 'edit' as const,
    target: resourceName('test/cardTypes/foo'),
    updateKey: { key: 'displayName' },
    operation: { name: 'change' as const, target: 'A', to: 'B' },
  };

  it('produces the same digest for identical inputs and file state', async () => {
    const fp1 = await computeFingerprint(input, [
      join(testDir, 'a.json'),
      join(testDir, 'b.json'),
    ]);
    const fp2 = await computeFingerprint(input, [
      join(testDir, 'a.json'),
      join(testDir, 'b.json'),
    ]);
    expect(fp1.digest).toEqual(fp2.digest);
  });

  it('produces a different digest when a touched file changes', async () => {
    const before = await computeFingerprint(input, [join(testDir, 'a.json')]);
    await writeFile(join(testDir, 'a.json'), '{"x":2}');
    const after = await computeFingerprint(input, [join(testDir, 'a.json')]);
    expect(before.digest).not.toEqual(after.digest);
  });

  it('produces the same digest regardless of the file-list order', async () => {
    const fp1 = await computeFingerprint(input, [
      join(testDir, 'a.json'),
      join(testDir, 'b.json'),
    ]);
    const fp2 = await computeFingerprint(input, [
      join(testDir, 'b.json'),
      join(testDir, 'a.json'),
    ]);
    expect(fp1.digest).toEqual(fp2.digest);
  });
});
