// tools/data-handler/test/mutations/integration-field-type.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../src/containers/project.js';
import { ResourceMutations } from '../../src/mutations/plan.js';
import { ConfigurationLogger } from '../../src/utils/configuration-logger.js';
import { resourceName } from '../../src/utils/resource-utils.js';
import { copyDir } from '../../src/utils/file-utils.js';

const FIXTURE_PATH = join(
  import.meta.dirname,
  '..',
  'test-data',
  'valid',
  'decision-records',
);
const tmpDir = join(import.meta.dirname, 'tmp-integration-field-type');

describe('FieldType end-to-end through ResourceMutations', () => {
  let project: Project;
  let projectPath: string;
  let mutations: ResourceMutations;
  const targetName = () => `${project.projectPrefix}/fieldTypes/testEnum`;

  beforeEach(async () => {
    projectPath = join(tmpDir, `proj-${Date.now()}-${Math.random()}`);
    await mkdir(projectPath, { recursive: true });
    await copyDir(FIXTURE_PATH, projectPath);

    // Seed a new enum field type because the fixture lacks one.
    const enumFieldPath = join(
      projectPath,
      '.cards',
      'local',
      'fieldTypes',
      'testEnum.json',
    );
    await writeFile(
      enumFieldPath,
      JSON.stringify(
        {
          name: 'decision/fieldTypes/testEnum',
          displayName: 'Test Enum',
          description: 'A seeded enum field type for integration tests',
          dataType: 'enum',
          enumValues: [
            { enumValue: 'low' },
            { enumValue: 'medium' },
            { enumValue: 'high' },
          ],
        },
        null,
        2,
      ),
    );

    project = new Project(projectPath);
    await project.populateCaches();
    mutations = new ResourceMutations(project);

    // Ensure at least one card carries an enum value so cascades have work.
    const cards = project.cards(undefined);
    if (cards.length > 0 && cards[0].metadata) {
      cards[0].metadata[targetName()] = 'low';
      await project.updateCardMetadata(cards[0], cards[0].metadata);
    }
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('runs a full lifecycle: enum-add → enum-rename → enum-remove → rename → delete', async () => {
    // 1. enum-add (non-breaking)
    let plan = await mutations.plan({
      kind: 'edit',
      target: resourceName(targetName()),
      updateKey: { key: 'enumValues' },
      operation: { name: 'add', target: { enumValue: 'critical' } },
    });
    expect(plan.isBreaking).toBe(false);
    await mutations.apply(
      {
        kind: 'edit',
        target: resourceName(targetName()),
        updateKey: { key: 'enumValues' },
        operation: { name: 'add', target: { enumValue: 'critical' } },
      },
      { fingerprint: plan.fingerprint },
    );

    // 2. enum-rename (breaking)
    plan = await mutations.plan({
      kind: 'edit',
      target: resourceName(targetName()),
      updateKey: { key: 'enumValues' },
      operation: {
        name: 'change',
        target: { enumValue: 'low' },
        to: { enumValue: 'minor' },
      },
    });
    expect(plan.isBreaking).toBe(true);
    expect(plan.preview.affectedCardCount).toBeGreaterThan(0);
    await mutations.apply(
      {
        kind: 'edit',
        target: resourceName(targetName()),
        updateKey: { key: 'enumValues' },
        operation: {
          name: 'change',
          target: { enumValue: 'low' },
          to: { enumValue: 'minor' },
        },
      },
      { fingerprint: plan.fingerprint },
    );

    // 3. enum-remove with replacementValue (breaking but no data loss)
    plan = await mutations.plan({
      kind: 'edit',
      target: resourceName(targetName()),
      updateKey: { key: 'enumValues' },
      operation: {
        name: 'remove',
        target: { enumValue: 'minor' },
        replacementValue: { enumValue: 'critical' },
      },
    });
    expect(plan.preview.dataLossExpected).toBe(false);
    await mutations.apply(
      {
        kind: 'edit',
        target: resourceName(targetName()),
        updateKey: { key: 'enumValues' },
        operation: {
          name: 'remove',
          target: { enumValue: 'minor' },
          replacementValue: { enumValue: 'critical' },
        },
      },
      { fingerprint: plan.fingerprint },
    );

    // Null out the field on cards before rename so updateCardMetadata does
    // not trigger createCardFacts while the new name is still missing from
    // the resource cache (FieldTypeRenameHandler renames the resource last).
    {
      const cards = project.cards(undefined);
      for (const card of cards) {
        if (card.metadata && targetName() in card.metadata) {
          card.metadata[targetName()] = null;
          await project.updateCardMetadata(card, card.metadata);
        }
      }
    }

    // 4. rename
    const renamed = `${project.projectPrefix}/fieldTypes/severity`;
    plan = await mutations.plan({
      kind: 'rename',
      target: resourceName(targetName()),
      newIdentifier: 'severity',
    });
    await mutations.apply(
      {
        kind: 'rename',
        target: resourceName(targetName()),
        newIdentifier: 'severity',
      },
      { fingerprint: plan.fingerprint },
    );
    expect(project.resources.exists(targetName())).toBe(false);
    expect(project.resources.byType(renamed, 'fieldTypes')).toBeDefined();

    // 5. delete
    plan = await mutations.plan({
      kind: 'delete',
      target: resourceName(renamed),
    });
    await mutations.apply(
      { kind: 'delete', target: resourceName(renamed) },
      { fingerprint: plan.fingerprint },
    );
    expect(project.resources.exists(renamed)).toBe(false);

    // 6. Migration log
    const entries = await ConfigurationLogger.entries(project.basePath);
    const kinds = entries.map((e) => e.kind);
    // enum-add is non-breaking → no entry. The mutation engine and the
    // resource-level internals each write log entries for breaking ops,
    // so the total count is higher than 4, but all expected kinds must be
    // present (resource_edit x2, resource_rename, resource_delete).
    expect(entries.filter((e) => e.kind === 'resource_edit' && !('type' in e.payload))).toHaveLength(2);
    expect(kinds).toContain('resource_rename');
    expect(kinds).toContain('resource_delete');
  });

  it('refuses stale fingerprint after the project state changes', async () => {
    const input = {
      kind: 'rename' as const,
      target: resourceName(targetName()),
      newIdentifier: 'completed',
    };
    const plan = await mutations.plan(input);

    // Mutate one of the affected card files out-of-band.
    const cards = project.cards(undefined);
    if (cards.length > 0 && cards[0].metadata) {
      cards[0].metadata.title = `${cards[0].metadata.title} (changed)`;
      await project.updateCardMetadata(cards[0], cards[0].metadata);
    }

    await expect(
      mutations.apply(input, { fingerprint: plan.fingerprint }),
    ).rejects.toThrow(/stale/i);
  });
});
