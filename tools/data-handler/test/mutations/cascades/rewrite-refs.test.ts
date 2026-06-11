import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

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

describe('rewriteCardContentRefs local-only scope', () => {
  const cardsTestDir = join(import.meta.dirname, 'tmp-rewrite-card-refs');
  const cardsFixturePath = join(cardsTestDir, 'valid', 'decision-records');
  let project: Project;
  let localTemplateCardFile: string;
  let projectCardFile: string;
  let moduleTemplateCardFile: string;

  beforeAll(async () => {
    await mkdir(cardsTestDir, { recursive: true });
    await copyDir('test/test-data/', cardsTestDir);

    localTemplateCardFile = join(
      cardsFixturePath,
      '.cards',
      'local',
      'templates',
      'decision',
      'c',
      'decision_1',
      'index.adoc',
    );
    projectCardFile = join(
      cardsFixturePath,
      'cardRoot',
      'decision_5',
      'index.adoc',
    );

    // Seed a fake module template card. Module-owned content must never be
    // rewritten from the consumer side.
    const moduleTemplateDir = join(
      cardsFixturePath,
      '.cards',
      'modules',
      'mymod',
      'templates',
    );
    const moduleCardDir = join(moduleTemplateDir, 'mytemp', 'c', 'mymod_1');
    moduleTemplateCardFile = join(moduleCardDir, 'index.adoc');
    await mkdir(moduleCardDir, { recursive: true });
    await writeFile(
      join(moduleTemplateDir, 'mytemp.json'),
      JSON.stringify({
        name: 'mymod/templates/mytemp',
        displayName: 'Module template',
      }),
    );
    await writeFile(
      join(dirname(moduleCardDir), '.schema'),
      JSON.stringify([{ id: 'cardBaseSchema', version: 1 }]),
    );
    await writeFile(
      join(moduleCardDir, 'index.json'),
      JSON.stringify({
        cardType: 'decision/cardTypes/decision',
        title: 'Module card',
        workflowState: 'Draft',
        rank: '0|a',
      }),
    );
    await writeFile(
      moduleTemplateCardFile,
      'Module card\n\nMARKER_CARD_FROM\n',
    );

    for (const file of [localTemplateCardFile, projectCardFile]) {
      const original = (await readFile(file)).toString();
      await writeFile(file, original + '\nMARKER_CARD_FROM\n');
    }

    project = new Project(cardsFixturePath);
    await project.populateCaches();
  });

  afterAll(async () => {
    await deleteDir(cardsTestDir);
  });

  it('rewrites local cards but never module template cards', async () => {
    await rewriteCardContentRefs(project, 'MARKER_CARD_FROM', 'MARKER_CARD_TO');

    for (const file of [localTemplateCardFile, projectCardFile]) {
      const updated = (await readFile(file)).toString();
      expect(updated).toContain('MARKER_CARD_TO');
      expect(updated).not.toContain('MARKER_CARD_FROM');
    }

    const moduleContent = (await readFile(moduleTemplateCardFile)).toString();
    expect(moduleContent).toContain('MARKER_CARD_FROM');
    expect(moduleContent).not.toContain('MARKER_CARD_TO');
  });
});
