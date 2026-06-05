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
const testDir = join(baseDir, 'tmp-integration-template-rename');
const decisionRecordsPath = join(testDir, 'valid/decision-records');
let project: Project;

const TEMPLATE = 'decision/templates/decision';
const REPORT = 'decision/reports/testReport';
const LT = 'decision/linkTypes/test';

describe('Leaf rename mutation engine end-to-end', () => {
  beforeEach(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir(join(baseDir, '..', 'test-data'), testDir);
    project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
  });
  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('apply → log entry for a template rename', async () => {
    const mutations = new ResourceMutations(project);
    await mutations.apply({
      kind: 'rename',
      target: resourceName(TEMPLATE),
      newIdentifier: 'decision-v2',
    });

    const newName = 'decision/templates/decision-v2';
    expect(project.resources.exists(TEMPLATE)).toBe(false);
    expect(project.resources.exists(newName)).toBe(true);

    const entries = await ConfigurationLogger.entries(project.basePath);
    expect(
      entries.some(
        (e) => e.kind === 'resource_rename' && e.target === TEMPLATE,
      ),
    ).toBe(true);
  });

  it('apply → log entry for a report rename', async () => {
    const mutations = new ResourceMutations(project);
    await mutations.apply({
      kind: 'rename',
      target: resourceName(REPORT),
      newIdentifier: 'testReportV2',
    });

    expect(project.resources.exists('decision/reports/testReportV2')).toBe(
      true,
    );

    const entries = await ConfigurationLogger.entries(project.basePath);
    expect(
      entries.some((e) => e.kind === 'resource_rename' && e.target === REPORT),
    ).toBe(true);
  });

  it('apply → link-type card-type edit records NO log entry', async () => {
    const mutations = new ResourceMutations(project);
    await mutations.apply({
      kind: 'edit',
      target: resourceName(LT),
      updateKey: { key: 'sourceCardTypes' },
      operation: { name: 'add', target: 'decision/cardTypes/decision' },
    });

    const lt = project.resources.byType(LT, 'linkTypes').show();
    expect(lt!.sourceCardTypes).toContain('decision/cardTypes/decision');

    const entries = await ConfigurationLogger.entries(project.basePath);
    expect(entries).toHaveLength(0);
  });
});
