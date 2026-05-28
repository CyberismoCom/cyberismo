// tools/data-handler/test/mutations/handlers/link-type-edit-card-types.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../../src/containers/project.js';
import { LinkTypeEditCardTypesHandler } from '../../../src/mutations/handlers/link-type-edit-card-types.js';
import { ResourceMutations } from '../../../src/mutations/plan.js';
import { copyDir } from '../../../src/utils/file-utils.js';
import { resourceName } from '../../../src/utils/resource-utils.js';

const FIXTURE_PATH = join(
  import.meta.dirname,
  '..',
  '..',
  'test-data',
  'valid',
  'decision-records',
);
const tmpDir = join(import.meta.dirname, 'tmp-link-type-edit-card-types');

describe('LinkTypeEditCardTypesHandler', () => {
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

  it('matches sourceCardTypes and destinationCardTypes edits on linkTypes', () => {
    const handler = new LinkTypeEditCardTypesHandler();
    expect(
      handler.matches({
        project,
        input: {
          kind: 'edit',
          target: resourceName(`${project.projectPrefix}/linkTypes/test`),
          updateKey: { key: 'sourceCardTypes' },
          operation: { name: 'add', target: 'decision/cardTypes/decision' },
        },
      }),
    ).toBe(true);
    expect(
      handler.matches({
        project,
        input: {
          kind: 'edit',
          target: resourceName(`${project.projectPrefix}/linkTypes/test`),
          updateKey: { key: 'destinationCardTypes' },
          operation: { name: 'add', target: 'decision/cardTypes/decision' },
        },
      }),
    ).toBe(true);
  });

  it('does not match other edit keys on linkTypes', () => {
    const handler = new LinkTypeEditCardTypesHandler();
    expect(
      handler.matches({
        project,
        input: {
          kind: 'edit',
          target: resourceName(`${project.projectPrefix}/linkTypes/test`),
          updateKey: { key: 'outboundDisplayName' },
          operation: { name: 'change', target: 'foo' },
        },
      }),
    ).toBe(false);
  });

  it('does not match edits on other resource types', () => {
    const handler = new LinkTypeEditCardTypesHandler();
    expect(
      handler.matches({
        project,
        input: {
          kind: 'edit',
          target: resourceName(`${project.projectPrefix}/cardTypes/decision`),
          updateKey: { key: 'sourceCardTypes' },
          operation: { name: 'add', target: 'decision/cardTypes/decision' },
        },
      }),
    ).toBe(false);
  });

  it('validate passes when the card type exists', async () => {
    const handler = new LinkTypeEditCardTypesHandler();
    await expect(
      handler.validate!({
        project,
        input: {
          kind: 'edit',
          target: resourceName(`${project.projectPrefix}/linkTypes/test`),
          updateKey: { key: 'sourceCardTypes' },
          operation: { name: 'add', target: 'decision/cardTypes/decision' },
        },
      }),
    ).resolves.toBeUndefined();
  });

  it('validate rejects when the card type does not exist', async () => {
    const handler = new LinkTypeEditCardTypesHandler();
    await expect(
      handler.validate!({
        project,
        input: {
          kind: 'edit',
          target: resourceName(`${project.projectPrefix}/linkTypes/test`),
          updateKey: { key: 'sourceCardTypes' },
          operation: {
            name: 'add',
            target: 'decision/cardTypes/nonExistentCardType',
          },
        },
      }),
    ).rejects.toThrow(/nonExistentCardType/);
  });

  it('validate skips non-add operations (remove does not re-check existence)', async () => {
    const handler = new LinkTypeEditCardTypesHandler();
    await expect(
      handler.validate!({
        project,
        input: {
          kind: 'edit',
          target: resourceName(`${project.projectPrefix}/linkTypes/test`),
          updateKey: { key: 'sourceCardTypes' },
          operation: {
            name: 'remove',
            target: 'decision/cardTypes/nonExistentCardType',
          },
        },
      }),
    ).resolves.toBeUndefined();
  });

  it('plan() via ResourceMutations rejects missing card type at plan time', async () => {
    const mutations = new ResourceMutations(project);
    await expect(
      mutations.plan({
        kind: 'edit',
        target: resourceName(`${project.projectPrefix}/linkTypes/test`),
        updateKey: { key: 'sourceCardTypes' },
        operation: {
          name: 'add',
          target: 'decision/cardTypes/doesNotExist',
        },
      }),
    ).rejects.toThrow(/doesNotExist/);
  });

  it('is not breaking', () => {
    expect(new LinkTypeEditCardTypesHandler().isBreaking).toBe(false);
  });
});
