// tools/data-handler/test/mutations/integration-card-type.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { copyDir } from '../../src/utils/file-utils.js';
import type { Project } from '../../src/containers/project.js';
import { getTestProject } from '../helpers/test-utils.js';
import { ResourceMutations } from '../../src/mutations/plan.js';
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

  it('plan → apply → log entry for a CardType delete with cards', async () => {
    const mutations = new ResourceMutations(project);
    const target = resourceName(`${project.projectPrefix}/cardTypes/decision`);
    const input = { kind: 'delete' as const, target };

    const plan = await mutations.plan(input);
    expect(plan.isBreaking).toBe(true);
    expect(plan.preview.affectedCardCount).toBeGreaterThan(0);
    expect(plan.preview.dataLossExpected).toBe(true);

    await mutations.apply(input, { fingerprint: plan.fingerprint });

    await project.populateCaches();
    expect(project.resources.exists(`${project.projectPrefix}/cardTypes/decision`)).toBe(false);
    const remaining = project.cards(undefined).filter(
      (c) => c.metadata?.cardType === `${project.projectPrefix}/cardTypes/decision`,
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

  it('plan → apply → log entry for a CardType rename', async () => {
    const mutations = new ResourceMutations(project);
    const target = resourceName(`${project.projectPrefix}/cardTypes/decision`);
    const input = {
      kind: 'rename' as const,
      target,
      newIdentifier: 'choice',
    };

    const plan = await mutations.plan(input);
    await mutations.apply(input, { fingerprint: plan.fingerprint });

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
    const input = {
      kind: 'edit' as const,
      target: resourceName(`${project.projectPrefix}/cardTypes/decision`),
      updateKey: { key: 'displayName' },
      operation: { name: 'change' as const, target: 'Decision', to: 'Choice' },
    };
    const plan = await mutations.plan(input);
    expect(plan.isBreaking).toBe(false);
    await mutations.apply(input);

    const entries = await ConfigurationLogger.entries(project.basePath);
    expect(entries).toHaveLength(0);
  });
});
