import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
    const remaining = project.cardTree
      .cards()
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
          e.operation === 'resource_delete' &&
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
          e.operation === 'resource_rename' &&
          e.target === `${project.projectPrefix}/cardTypes/decision`,
      ),
    ).toBe(true);
  });

  it('display-only changes route to the plain handler (no log entry)', async () => {
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

  const cardOnDisk = (path: string) =>
    JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>;

  const declares = (cardType: string, field: string) =>
    project.resources
      .byType(cardType, 'cardTypes')
      .data?.customFields?.some((f) => f.name === field) ?? false;

  it('adding a customField writes no key onto existing cards (no log entry)', async () => {
    // The decision card type already declares every local field type, so the
    // only genuinely undeclared pairing is simplepage + 'finished'.
    const cardType = `${project.projectPrefix}/cardTypes/simplepage`;
    const field = `${project.projectPrefix}/fieldTypes/finished`;
    const cardPath = join(
      decisionRecordsPath,
      'cardRoot/decision_5/index.json',
    );
    expect(cardOnDisk(cardPath).cardType).toBe(cardType);
    expect(field in cardOnDisk(cardPath)).toBe(false);

    await new ResourceMutations(project).apply({
      kind: 'edit',
      target: resourceName(cardType),
      updateKey: { key: 'customFields' },
      operation: { name: 'add', target: { name: field } },
    });

    // The definition write landed, but the card gained no null placeholder.
    expect(declares(cardType, field)).toBe(true);
    expect(field in cardOnDisk(cardPath)).toBe(false);
    expect(await ConfigurationLogger.entries(project.basePath)).toHaveLength(0);
  });

  it('removing a customField leaves the stored value dormant (no log entry)', async () => {
    const cardType = `${project.projectPrefix}/cardTypes/decision`;
    const field = `${project.projectPrefix}/fieldTypes/finished`;
    const cardPath = join(
      decisionRecordsPath,
      'cardRoot/decision_5/c/decision_6/index.json',
    );
    // The fixture stores null here, which would make a surviving-value
    // assertion vacuous; seed a real value and reload so the card cache sees it.
    writeFileSync(
      cardPath,
      JSON.stringify({ ...cardOnDisk(cardPath), [field]: true }, null, 4),
    );
    project = getTestProject(decisionRecordsPath);
    await project.populateCaches();

    await new ResourceMutations(project).apply({
      kind: 'edit',
      target: resourceName(cardType),
      updateKey: { key: 'customFields' },
      operation: { name: 'remove', target: { name: field } },
    });

    expect(declares(cardType, field)).toBe(false);
    expect(cardOnDisk(cardPath)[field]).toBe(true);
    expect(await ConfigurationLogger.entries(project.basePath)).toHaveLength(0);
  });
});
