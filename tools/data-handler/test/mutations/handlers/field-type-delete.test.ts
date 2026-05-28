import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { Project } from '../../../src/containers/project.js';
import { FieldTypeDeleteHandler } from '../../../src/mutations/handlers/field-type-delete.js';
import { ResourceMutations } from '../../../src/mutations/plan.js';
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
    const target = fieldName();
    await new ResourceMutations(project).apply(
      { kind: 'delete', target: resourceName(target) },
      { bypassFingerprint: true },
    );
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

  describe('foreign-module replay (apply only, foreign target)', () => {
    it('strips local card type and card references without touching module files', async () => {
      const dedicatedPath = join(tmpDir, `proj-foreign-del-${Date.now()}`);
      await mkdir(dedicatedPath, { recursive: true });
      await copyDir(FIXTURE_PATH, dedicatedPath);

      // Seed module 'foo' — field is ALREADY deleted (not present on disk).
      const fooModuleDir = join(dedicatedPath, '.cards', 'modules', 'foo');
      await mkdir(fooModuleDir, { recursive: true });
      await writeFile(
        join(fooModuleDir, 'cardsConfig.json'),
        JSON.stringify({ cardKeyPrefix: 'foo', name: 'foo', modules: [] }),
      );
      // fieldTypes dir intentionally absent — post-delete state.

      // Seed a local card type referencing the deleted field.
      const cardTypePath = join(
        dedicatedPath,
        '.cards',
        'local',
        'cardTypes',
        'decision.json',
      );
      const cardType = JSON.parse(await readFile(cardTypePath, 'utf-8')) as {
        customFields: { name: string }[];
      };
      cardType.customFields.push({ name: 'foo/fieldTypes/gone' });
      await writeFile(cardTypePath, JSON.stringify(cardType));

      // Seed a local card directly on disk with the deleted field (bypass Project
      // APIs that would trigger calculation engine validation).
      const cardIndexPath = join(dedicatedPath, 'cardRoot', 'decision_5', 'index.json');
      const cardData = JSON.parse(await readFile(cardIndexPath, 'utf-8')) as Record<string, unknown>;
      cardData['foo/fieldTypes/gone'] = 'someValue';
      await writeFile(cardIndexPath, JSON.stringify(cardData));

      const foreignProject = new Project(dedicatedPath);
      await foreignProject.populateCaches();

      // apply: target is foreign. Should strip consumer references only.
      await new ResourceMutations(foreignProject).apply(
        { kind: 'delete', target: resourceName('foo/fieldTypes/gone') },
        { bypassFingerprint: true },
      );

      // Local card type no longer lists the deleted field.
      const updatedCardType = foreignProject.resources
        .cardTypes()
        .find((ct) => ct.data?.name?.endsWith('/cardTypes/decision'));
      const cfNames = (updatedCardType?.data?.customFields ?? []).map((cf) => cf.name);
      expect(cfNames).not.toContain('foo/fieldTypes/gone');

      // Local card no longer carries the field.
      for (const card of foreignProject.cards(undefined)) {
        if (!card.metadata) continue;
        expect(Object.keys(card.metadata)).not.toContain('foo/fieldTypes/gone');
      }

      // Module directory untouched.
      expect(existsSync(fooModuleDir)).toBe(true);
      expect(existsSync(join(fooModuleDir, 'fieldTypes', 'gone.json'))).toBe(false);
    });
  });
});
