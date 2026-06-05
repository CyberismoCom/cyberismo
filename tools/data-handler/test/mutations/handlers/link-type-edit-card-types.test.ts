import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../../src/containers/project.js';
import { LinkTypeEditCardTypesHandler } from '../../../src/mutations/handlers/link-type-edit-card-types.js';
import { resourceName } from '../../../src/utils/resource-utils.js';
import { copyDir } from '../../../src/utils/file-utils.js';
import { ResourceMutations } from '../../../src/mutations/resource-mutations.js';

const FIXTURE_PATH = join(
  import.meta.dirname,
  '..',
  '..',
  'test-data',
  'valid',
  'decision-records',
);
const tmpDir = join(import.meta.dirname, 'tmp-link-type-edit-card-types');

const LT = 'decision/linkTypes/test';

describe('LinkTypeEditCardTypesHandler', () => {
  let project: Project;

  beforeEach(async () => {
    const projectPath = join(tmpDir, `proj-${Date.now()}-${Math.random()}`);
    await mkdir(projectPath, { recursive: true });
    await copyDir(FIXTURE_PATH, projectPath);
    project = new Project(projectPath);
    await project.populateCaches();
  });
  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('matches edits on sourceCardTypes and destinationCardTypes', () => {
    const handler = new LinkTypeEditCardTypesHandler();
    for (const key of ['sourceCardTypes', 'destinationCardTypes']) {
      expect(
        handler.matches({
          project,
          input: {
            kind: 'edit',
            target: resourceName(LT),
            updateKey: { key },
            operation: { name: 'add', target: 'decision/cardTypes/decision' },
          },
        }),
      ).toBe(true);
    }
  });

  it('declines edits on other link-type keys', () => {
    const handler = new LinkTypeEditCardTypesHandler();
    expect(
      handler.matches({
        project,
        input: {
          kind: 'edit',
          target: resourceName(LT),
          updateKey: { key: 'outboundDisplayName' },
          operation: { name: 'change', target: 'a', to: 'b' },
        },
      }),
    ).toBe(false);
  });

  it('declines non-edit inputs', () => {
    const handler = new LinkTypeEditCardTypesHandler();
    expect(
      handler.matches({
        project,
        input: {
          kind: 'rename',
          target: resourceName(LT),
          newIdentifier: 'test-v2',
        },
      }),
    ).toBe(false);
  });

  it('isBreaking is false', () => {
    expect(new LinkTypeEditCardTypesHandler().isBreaking).toBe(false);
  });

  it('apply adds an existing card type to sourceCardTypes', async () => {
    const mutations = new ResourceMutations(project);
    await mutations.apply({
      kind: 'edit',
      target: resourceName(LT),
      updateKey: { key: 'sourceCardTypes' },
      operation: { name: 'add', target: 'decision/cardTypes/decision' },
    });

    const lt = project.resources.byType(LT, 'linkTypes').show();
    expect(lt!.sourceCardTypes).toContain('decision/cardTypes/decision');
  });

  it('apply adds a card type that does not exist (only duplicates are rejected)', async () => {
    const mutations = new ResourceMutations(project);
    // Adding a non-existent card type is allowed; only duplicates are rejected.
    await mutations.apply({
      kind: 'edit',
      target: resourceName(LT),
      updateKey: { key: 'destinationCardTypes' },
      operation: { name: 'add', target: 'decision/cardTypes/does-not-exist' },
    });

    const lt = project.resources.byType(LT, 'linkTypes').show();
    expect(lt!.destinationCardTypes).toContain(
      'decision/cardTypes/does-not-exist',
    );
  });
});
