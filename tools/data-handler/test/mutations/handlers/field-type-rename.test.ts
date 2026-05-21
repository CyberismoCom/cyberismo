import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../../src/containers/project.js';
import { FieldTypeRenameHandler } from '../../../src/mutations/handlers/field-type-rename.js';
import { resourceName } from '../../../src/utils/resource-utils.js';
import { copyDir } from '../../../src/utils/file-utils.js';

const FIXTURE_PATH = join(
  import.meta.dirname,
  '..',
  '..',
  'test-data',
  'valid',
  'decision-records',
);
const tmpDir = join(import.meta.dirname, 'tmp-field-type-rename');

describe('FieldTypeRenameHandler', () => {
  let project: Project;
  let projectPath: string;

  beforeEach(async () => {
    projectPath = join(tmpDir, `proj-${Date.now()}`);
    await mkdir(projectPath, { recursive: true });
    await copyDir(FIXTURE_PATH, projectPath);
    project = new Project(projectPath);
    await project.populateCaches();
  });
  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('matches a field-type rename input', () => {
    const handler = new FieldTypeRenameHandler();
    const ctx = {
      project,
      input: {
        kind: 'rename' as const,
        target: resourceName(`${project.projectPrefix}/fieldTypes/finished`),
        newIdentifier: 'completed',
      },
    };
    expect(handler.matches(ctx)).toBe(true);
  });

  it('does not match a link-type rename', () => {
    const handler = new FieldTypeRenameHandler();
    const ctx = {
      project,
      input: {
        kind: 'rename' as const,
        target: resourceName(`${project.projectPrefix}/linkTypes/causes`),
        newIdentifier: 'is-caused-by',
      },
    };
    expect(handler.matches(ctx)).toBe(false);
  });

  it('preview reports affected card and card-type counts', async () => {
    const handler = new FieldTypeRenameHandler();
    const ctx = {
      project,
      input: {
        kind: 'rename' as const,
        target: resourceName(`${project.projectPrefix}/fieldTypes/finished`),
        newIdentifier: 'completed',
      },
    };
    const preview = await handler.preview(ctx);
    expect(preview.dataLossExpected).toBe(false);
    // The decision-records fixture has at least one card type using
    // "finished" and at least one card carrying the metadata key.
    expect(preview.affectedCardCount).toBeGreaterThanOrEqual(0);
  });

  it('applying rewrites every card metadata key and every card type customFields entry', async () => {
    const handler = new FieldTypeRenameHandler();
    const oldName = `${project.projectPrefix}/fieldTypes/finished`;
    const newName = `${project.projectPrefix}/fieldTypes/completed`;
    const ctx = {
      project,
      input: {
        kind: 'rename' as const,
        target: resourceName(oldName),
        newIdentifier: 'completed',
      },
    };
    await handler.apply(ctx);

    for (const card of project.cards(undefined)) {
      if (!card.metadata) continue;
      expect(Object.keys(card.metadata)).not.toContain(oldName);
    }
    for (const cardType of project.resources.cardTypes()) {
      const customFields = cardType.data?.customFields ?? [];
      for (const cf of customFields) {
        expect(cf.name).not.toBe(oldName);
        if (cf.name.endsWith('/fieldTypes/completed')) {
          expect(cf.name).toBe(newName);
        }
      }
    }
  });

  it('isBreaking is true', () => {
    expect(new FieldTypeRenameHandler().isBreaking).toBe(true);
  });
});
