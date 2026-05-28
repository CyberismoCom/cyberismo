// tools/data-handler/test/mutations/cascades/rewrite-refs.test.ts

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
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

describe('rewriteCardContentRefs — local-only scope', () => {
  const FIXTURE_PATH = join(
    import.meta.dirname,
    '..',
    '..',
    'test-data',
    'valid',
    'decision-records',
  );
  const tmpBase = join(import.meta.dirname, 'tmp-rewrite-card-scope');

  let projPath: string;
  let project: Project;
  // Content seeded into the module template card — must be byte-equal after rewrite.
  let moduleTemplateCardContent: string;
  let moduleTemplateCardPath: string;

  beforeEach(async () => {
    projPath = join(tmpBase, `proj-${Date.now()}`);
    await mkdir(projPath, { recursive: true });
    await copyDir(FIXTURE_PATH, projPath);

    // Seed module "foo" with a template card that references MARKER_OLD.
    const moduleDir = join(projPath, '.cards', 'modules', 'foo');
    const moduleTemplateCardDir = join(moduleDir, 'templates', 'footemp', 'c', 'foo_1');
    await mkdir(moduleTemplateCardDir, { recursive: true });
    await writeFile(
      join(moduleDir, 'cardsConfig.json'),
      JSON.stringify({ cardKeyPrefix: 'foo', name: 'foo', modules: [] }),
    );
    // A minimal template descriptor so populateCaches picks it up.
    await writeFile(
      join(moduleDir, 'templates', 'footemp.json'),
      JSON.stringify({ name: 'foo/templates/footemp', displayName: 'Foo Temp', description: '', category: '' }),
    );
    moduleTemplateCardContent = JSON.stringify({
      cardType: 'foo/cardTypes/bar',
      rank: '0|a',
    });
    moduleTemplateCardPath = join(moduleTemplateCardDir, 'index.json');
    await writeFile(moduleTemplateCardPath, moduleTemplateCardContent);

    project = new Project(projPath);
    await project.populateCaches();
  });

  afterEach(async () => {
    await rm(tmpBase, { recursive: true, force: true });
  });

  it('does not rewrite content in module template cards', async () => {
    // Patch the module template card to include MARKER_OLD in its content.
    // We write it after populateCaches so the file on disk has the marker
    // but the cascade should NOT touch it (it is a module template card).
    const withMarker = JSON.stringify({
      cardType: 'foo/cardTypes/bar',
      rank: '0|a',
      summary: 'MARKER_OLD',
    });
    await writeFile(moduleTemplateCardPath, withMarker);

    await rewriteCardContentRefs(project, 'MARKER_OLD', 'MARKER_NEW');

    // Module template card file must be byte-equal to what we seeded.
    const afterBytes = await readFile(moduleTemplateCardPath, 'utf-8');
    expect(afterBytes).toBe(withMarker);
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
