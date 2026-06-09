import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { copyDir } from '../../src/utils/file-utils.js';
import type { Project } from '../../src/containers/project.js';
import { getTestProject } from '../helpers/test-utils.js';
import { ResourceMutations } from '../../src/mutations/resource-mutations.js';
import { ConfigurationLogger } from '../../src/utils/configuration-logger.js';
import { resourceName } from '../../src/utils/resource-utils.js';

const baseDir = import.meta.dirname;
const testDir = join(baseDir, 'tmp-card-type-integration');
const decisionRecordsPath = join(testDir, 'valid/decision-records');
let project: Project;

describe('CardType mutation engine end-to-end', () => {
  beforeEach(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir(join(baseDir, '..', 'test-data'), testDir);
    project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
  });
  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('apply → log entry for a CardType delete with cards', async () => {
    const mutations = new ResourceMutations(project);
    const target = resourceName(`${project.projectPrefix}/cardTypes/decision`);

    await mutations.apply({ kind: 'delete', target });

    await project.populateCaches();
    expect(
      project.resources.exists(`${project.projectPrefix}/cardTypes/decision`),
    ).toBe(false);
    const remaining = project
      .cards(undefined)
      .filter(
        (c) =>
          c.metadata?.cardType ===
          `${project.projectPrefix}/cardTypes/decision`,
      );
    expect(remaining).toHaveLength(0);

    const entries = await ConfigurationLogger.entries(project.basePath);
    expect(
      entries.some(
        (e) =>
          e.kind === 'resource_delete' &&
          e.target === `${project.projectPrefix}/cardTypes/decision`,
      ),
    ).toBe(true);
  });

  it('apply → log entry for a CardType rename', async () => {
    const mutations = new ResourceMutations(project);
    const target = resourceName(`${project.projectPrefix}/cardTypes/decision`);

    await mutations.apply({
      kind: 'rename',
      target,
      newIdentifier: 'choice',
    });

    const entries = await ConfigurationLogger.entries(project.basePath);
    expect(
      entries.some(
        (e) =>
          e.kind === 'resource_rename' &&
          e.target === `${project.projectPrefix}/cardTypes/decision`,
      ),
    ).toBe(true);
  });

  it('display-only changes fall through to DefaultNoCascadeHandler (no log entry)', async () => {
    const mutations = new ResourceMutations(project);
    await mutations.apply({
      kind: 'edit',
      target: resourceName(`${project.projectPrefix}/cardTypes/decision`),
      updateKey: { key: 'displayName' },
      operation: { name: 'change', target: 'Decision', to: 'Choice' },
    });

    const entries = await ConfigurationLogger.entries(project.basePath);
    expect(entries).toHaveLength(0);
  });
});
