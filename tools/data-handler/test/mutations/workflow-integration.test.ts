// tools/data-handler/test/mutations/workflow-integration.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { Project } from '../../src/containers/project.js';
import { ResourceMutations } from '../../src/mutations/plan.js';
import { ConfigurationLogger } from '../../src/utils/configuration-logger.js';
import { resourceName } from '../../src/utils/resource-utils.js';
import { copyDir } from '../../src/utils/file-utils.js';
import { getTestProject } from '../helpers/test-utils.js';

const baseDir = import.meta.dirname;
const testDir = join(baseDir, 'tmp-workflow-integration');
const decisionRecordsPath = join(testDir, 'valid/decision-records');
let project: Project;

describe('Workflow cascade — end-to-end', () => {
  beforeEach(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir(join(baseDir, '..', 'test-data'), testDir);
    project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
  });
  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('plan → apply → cards, card types and workflow all gone, log entries written', async () => {
    const mutations = new ResourceMutations(project);
    const wfName = `${project.projectPrefix}/workflows/decision`;
    const dependentCardTypeNames = project.resources
      .cardTypes()
      .filter((ct) => ct.data?.workflow === wfName)
      .map((ct) => ct.data!.name);
    expect(dependentCardTypeNames.length).toBeGreaterThan(0);

    const input = {
      kind: 'delete' as const,
      target: resourceName(wfName),
    };
    const plan = await mutations.plan(input);
    expect(plan.isBreaking).toBe(true);
    expect(plan.preview.dataLossExpected).toBe(true);

    await mutations.apply(input, { fingerprint: plan.fingerprint });

    await project.populateCaches();

    expect(project.resources.exists(wfName)).toBe(false);
    for (const ctName of dependentCardTypeNames) {
      expect(project.resources.exists(ctName)).toBe(false);
    }
    const survivors = project.cards(undefined).filter((c) =>
      dependentCardTypeNames.includes(c.metadata?.cardType ?? ''),
    );
    expect(survivors).toHaveLength(0);

    const entries = await ConfigurationLogger.entries(project.basePath);
    const workflowEntry = entries.find(
      (e) => e.kind === 'resource_delete' && e.target === wfName,
    );
    expect(workflowEntry).toBeDefined();
    for (const ctName of dependentCardTypeNames) {
      expect(
        entries.some(
          (e) => e.kind === 'resource_delete' && e.target === ctName,
        ),
      ).toBe(true);
    }
  });

  it('fingerprint mismatches when the project state shifts between plan and apply', async () => {
    const mutations = new ResourceMutations(project);
    const wfName = `${project.projectPrefix}/workflows/decision`;
    const dependentCardTypeNames = project.resources
      .cardTypes()
      .filter((ct) => ct.data?.workflow === wfName)
      .map((ct) => ct.data!.name);

    const input = {
      kind: 'delete' as const,
      target: resourceName(wfName),
    };
    const plan = await mutations.plan(input);

    // Drift: change a metadata of a card that belongs to a dependent card type.
    const allCards = project.cards(undefined);
    const driftCard = allCards.find((c) =>
      dependentCardTypeNames.includes(c.metadata?.cardType ?? ''),
    );
    if (driftCard && driftCard.metadata) {
      driftCard.metadata.title = `${driftCard.metadata.title} (drifted)`;
      await project.updateCardMetadata(driftCard, driftCard.metadata);
    }
    await expect(
      mutations.apply(input, { fingerprint: plan.fingerprint }),
    ).rejects.toThrow(/stale/i);
  });
});
