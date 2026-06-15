import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../../src/containers/project.js';
import {
  rewriteCardContentRefs,
  rewriteContentFileRefs,
} from '../../../src/mutations/cascades/rewrite-refs.js';
import { copyDir, deleteDir } from '../../../src/utils/file-utils.js';

const testDir = join(import.meta.dirname, 'tmp-rewrite-refs');
const fixturePath = join(testDir, 'valid', 'decision-records');

describe('rewrite-refs guards', () => {
  it('rewriteContentFileRefs throws on empty "from"', async () => {
    await expect(
      rewriteContentFileRefs({} as unknown as Project, '  ', 'newName'),
    ).rejects.toThrow(/"from" and "to" parameters must not be empty/);
  });

  it('rewriteContentFileRefs throws on empty "to"', async () => {
    await expect(
      rewriteContentFileRefs({} as unknown as Project, 'oldName', ''),
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

describe('rewriteContentFileRefs happy path', () => {
  let project: Project;
  // Content files of different local folder resources, seeded with a marker.
  let reportHbsFile: string;
  let calculationLpFile: string;

  beforeAll(async () => {
    await mkdir(testDir, { recursive: true });
    await copyDir('test/test-data/', testDir);
    reportHbsFile = join(
      fixturePath,
      '.cards',
      'local',
      'reports',
      'testReport',
      'index.adoc.hbs',
    );
    calculationLpFile = join(
      fixturePath,
      '.cards',
      'local',
      'calculations',
      'test',
      'calculation.lp',
    );
    // Seed a known token before the caches load the content files.
    for (const file of [reportHbsFile, calculationLpFile]) {
      const original = (await readFile(file)).toString();
      await writeFile(file, original + '\nMARKER_REWRITE_FROM\n');
    }
    project = new Project(fixturePath);
    await project.populateCaches();
  });

  afterAll(async () => {
    await deleteDir(testDir);
  });

  it('rewrites content files across local folder resources', async () => {
    await rewriteContentFileRefs(
      project,
      'MARKER_REWRITE_FROM',
      'MARKER_REWRITE_TO',
    );
    for (const file of [reportHbsFile, calculationLpFile]) {
      const updated = (await readFile(file)).toString();
      expect(updated).toContain('MARKER_REWRITE_TO');
      expect(updated).not.toContain('MARKER_REWRITE_FROM');
    }
  });
});
