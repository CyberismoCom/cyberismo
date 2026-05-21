import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { copyDir } from '../../../src/utils/file-utils.js';
import type { Project } from '../../../src/containers/project.js';
import { getTestProject } from '../../helpers/test-utils.js';
import { CardTypeRenameHandler } from '../../../src/mutations/handlers/card-type-rename.js';
import { resourceName } from '../../../src/utils/resource-utils.js';

const baseDir = import.meta.dirname;
const testDir = join(baseDir, 'tmp-card-type-rename');
const decisionRecordsPath = join(testDir, 'valid/decision-records');
let project: Project;

describe('CardTypeRenameHandler', () => {
  beforeEach(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir(
      join(baseDir, '..', '..', 'test-data'),
      testDir,
    );
    project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
  });
  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('matches a CardType rename input', () => {
    const handler = new CardTypeRenameHandler();
    const ctx = {
      project,
      input: {
        kind: 'rename' as const,
        target: resourceName(`${project.projectPrefix}/cardTypes/decision`),
        newIdentifier: 'choice',
      },
    };
    expect(handler.matches(ctx)).toBe(true);
    expect(handler.isBreaking).toBe(true);
  });

  it('preview counts affected cards and link-type references', async () => {
    const handler = new CardTypeRenameHandler();
    const ctx = {
      project,
      input: {
        kind: 'rename' as const,
        target: resourceName(`${project.projectPrefix}/cardTypes/decision`),
        newIdentifier: 'choice',
      },
    };
    const preview = await handler.preview(ctx);
    expect(preview.affectedCardCount).toBeGreaterThan(0);
    expect(preview.dataLossExpected).toBe(false);
  });

  it('rewrites cardType in every affected card after apply', async () => {
    const handler = new CardTypeRenameHandler();
    const oldName = `${project.projectPrefix}/cardTypes/decision`;
    const newName = `${project.projectPrefix}/cardTypes/choice`;
    const ctx = {
      project,
      input: {
        kind: 'rename' as const,
        target: resourceName(oldName),
        newIdentifier: 'choice',
      },
    };
    await handler.apply(ctx);

    for (const card of project.cards(undefined)) {
      expect(card.metadata?.cardType).not.toBe(oldName);
    }
    // The card type file itself has the new name.
    const renamed = project.resources.byType(newName, 'cardTypes').show();
    expect(renamed.name).toBe(newName);
  });

  it('rewrites occurrences in link-type sourceCardTypes/destinationCardTypes', async () => {
    const handler = new CardTypeRenameHandler();
    const oldName = `${project.projectPrefix}/cardTypes/decision`;
    await handler.apply({
      project,
      input: {
        kind: 'rename' as const,
        target: resourceName(oldName),
        newIdentifier: 'choice',
      },
    });
    for (const lt of project.resources.linkTypes()) {
      const data = lt.data!;
      expect(data.sourceCardTypes).not.toContain(oldName);
      expect(data.destinationCardTypes).not.toContain(oldName);
    }
  });

  it('affectedFilePaths returns the index.json files that will be rewritten', async () => {
    const handler = new CardTypeRenameHandler();
    const ctx = {
      project,
      input: {
        kind: 'rename' as const,
        target: resourceName(`${project.projectPrefix}/cardTypes/decision`),
        newIdentifier: 'choice',
      },
    };
    const paths = await handler.affectedFilePaths(ctx);
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.some((p) => p.endsWith('index.json'))).toBe(true);
  });
});
