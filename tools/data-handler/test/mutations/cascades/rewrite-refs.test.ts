// tools/data-handler/test/mutations/cascades/rewrite-refs.test.ts

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../../src/containers/project.js';
import {
  rewriteCalculationRefs,
  rewriteCardContentRefs,
  rewriteHandlebarRefs,
} from '../../../src/mutations/cascades/rewrite-refs.js';
import { copyDir, deleteDir } from '../../../src/utils/file-utils.js';

const testDir = join(import.meta.dirname, 'tmp-rewrite-refs');
const fixturePath = join(testDir, 'valid', 'decision-records');

describe('rewrite-refs guards', () => {
  it('rewriteCalculationRefs throws on empty "from"', async () => {
    await expect(
      rewriteCalculationRefs({} as unknown as Project, '  ', 'newName'),
    ).rejects.toThrow(/"from" and "to" parameters must not be empty/);
  });

  it('rewriteCalculationRefs throws on empty "to"', async () => {
    await expect(
      rewriteCalculationRefs({} as unknown as Project, 'oldName', ''),
    ).rejects.toThrow(/"from" and "to" parameters must not be empty/);
  });

  it('rewriteHandlebarRefs throws on empty "from"', async () => {
    await expect(
      rewriteHandlebarRefs({} as unknown as Project, '', 'newName'),
    ).rejects.toThrow(/"from" and "to" parameters must not be empty/);
  });

  it('rewriteHandlebarRefs throws on empty "to"', async () => {
    await expect(
      rewriteHandlebarRefs({} as unknown as Project, 'oldName', '   '),
    ).rejects.toThrow(/"from" and "to" parameters must not be empty/);
  });

  it('rewriteCardContentRefs throws on empty "from"', async () => {
    await expect(
      rewriteCardContentRefs({} as unknown as Project, '', 'newName'),
    ).rejects.toThrow(/"from" and "to" parameters must not be empty/);
  });

  it('rewriteCardContentRefs throws on empty "to"', async () => {
    await expect(
      rewriteCardContentRefs({} as unknown as Project, 'oldName', ' '),
    ).rejects.toThrow(/"from" and "to" parameters must not be empty/);
  });
});

describe('rewriteHandlebarRefs happy path', () => {
  let project: Project;
  // Path to a handlebar file we will mutate and check.
  let hbsFile: string;

  beforeAll(async () => {
    await mkdir(testDir, { recursive: true });
    await copyDir('test/test-data/', testDir);
    project = new Project(fixturePath);
    await project.populateCaches();
    hbsFile = join(
      fixturePath,
      '.cards',
      'local',
      'reports',
      'testReport',
      'index.adoc.hbs',
    );
    // Seed a known token into the file so the rewrite is deterministic.
    const original = (await readFile(hbsFile)).toString();
    await writeFile(hbsFile, original + '\nMARKER_REWRITE_FROM\n');
  });

  afterAll(async () => {
    await deleteDir(testDir);
  });

  it('rewrites the supplied handlebar file content', async () => {
    await rewriteHandlebarRefs(
      project,
      'MARKER_REWRITE_FROM',
      'MARKER_REWRITE_TO',
      [hbsFile],
    );
    const updated = (await readFile(hbsFile)).toString();
    expect(updated).toContain('MARKER_REWRITE_TO');
    expect(updated).not.toContain('MARKER_REWRITE_FROM');
  });
});
