import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../../src/containers/project.js';
import { FieldTypeDeleteHandler } from '../../../src/mutations/handlers/field-type-delete.js';
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
const tmpDir = join(import.meta.dirname, 'tmp-field-type-delete');

describe('FieldTypeDeleteHandler', () => {
  let project: Project;
  let projectPath: string;
  const fieldName = () => `${project.projectPrefix}/fieldTypes/finished`;

  beforeEach(async () => {
    projectPath = join(tmpDir, `proj-${Date.now()}-${Math.random()}`);
    await mkdir(projectPath, { recursive: true });
    await copyDir(FIXTURE_PATH, projectPath);
    project = new Project(projectPath);
    await project.populateCaches();
  });
  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('matches delete on a field type', () => {
    const handler = new FieldTypeDeleteHandler();
    const ctx = {
      project,
      input: {
        kind: 'delete' as const,
        target: resourceName(fieldName()),
      },
    };
    expect(handler.matches(ctx)).toBe(true);
  });

  it('does not match delete on a link type', () => {
    const handler = new FieldTypeDeleteHandler();
    const ctx = {
      project,
      input: {
        kind: 'delete' as const,
        target: resourceName(`${project.projectPrefix}/linkTypes/test`),
      },
    };
    expect(handler.matches(ctx)).toBe(false);
  });

  it('preview reports data loss when cards carry the field', async () => {
    const handler = new FieldTypeDeleteHandler();
    const ctx = {
      project,
      input: {
        kind: 'delete' as const,
        target: resourceName(fieldName()),
      },
    };
    const preview = await handler.preview(ctx);
    if (preview.affectedCardCount > 0) {
      expect(preview.dataLossExpected).toBe(true);
    }
  });

  it('applying strips the field from every card type and every card', async () => {
    const handler = new FieldTypeDeleteHandler();
    const target = fieldName();
    const ctx = {
      project,
      input: { kind: 'delete' as const, target: resourceName(target) },
    };
    await handler.apply(ctx);
    for (const cardType of project.resources.cardTypes()) {
      const customFields = cardType.data?.customFields ?? [];
      expect(customFields.some((cf) => cf.name === target)).toBe(false);
    }
    for (const card of project.cards(undefined)) {
      if (!card.metadata) continue;
      expect(Object.keys(card.metadata)).not.toContain(target);
    }
    expect(project.resources.exists(target)).toBe(false);
  });

  it('isBreaking is true', () => {
    expect(new FieldTypeDeleteHandler().isBreaking).toBe(true);
  });
});
