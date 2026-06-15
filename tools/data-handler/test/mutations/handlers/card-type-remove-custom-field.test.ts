import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { copyDir } from '../../../src/utils/file-utils.js';
import type { Project } from '../../../src/containers/project.js';
import { getTestProject } from '../../helpers/test-utils.js';
import { CardTypeRemoveCustomFieldHandler } from '../../../src/mutations/handlers/card-type-remove-custom-field.js';
import { dispatch } from '../../../src/mutations/dispatcher.js';
import { resourceName } from '../../../src/utils/resource-utils.js';
import { ResourceMutations } from '../../../src/mutations/resource-mutations.js';

const baseDir = import.meta.dirname;
const testDir = join(baseDir, 'tmp-card-type-remove-field');
const decisionRecordsPath = join(testDir, 'valid/decision-records');
let project: Project;

describe('CardTypeRemoveCustomFieldHandler', () => {
  beforeEach(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir(join(baseDir, '..', '..', 'test-data'), testDir);
    project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
  });
  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  const cardTypeName = () => `${project.projectPrefix}/cardTypes/decision`;
  const fieldName = () => `${project.projectPrefix}/fieldTypes/finished`;

  it('routes a remove operation on customFields to this handler (breaking)', () => {
    const { handler, breaking } = dispatch({
      project,
      input: {
        kind: 'edit',
        target: resourceName(cardTypeName()),
        updateKey: { key: 'customFields' },
        operation: { name: 'remove', target: { name: fieldName() } },
      },
    });
    expect(handler).toBeInstanceOf(CardTypeRemoveCustomFieldHandler);
    expect(breaking).toBe(true);
  });

  it('removes the field key from every card of this type', async () => {
    const mutations = new ResourceMutations(project);
    await mutations.apply({
      kind: 'edit',
      target: resourceName(cardTypeName()),
      updateKey: { key: 'customFields' },
      operation: { name: 'remove', target: { name: fieldName() } },
    });
    const cards = project
      .cards(undefined)
      .filter((c) => c.metadata?.cardType === cardTypeName());
    for (const card of cards) {
      expect(card.metadata).not.toHaveProperty(fieldName());
    }
  });

  it('strips the field from alwaysVisibleFields and optionallyVisibleFields', async () => {
    const mutations = new ResourceMutations(project);
    await mutations.apply({
      kind: 'edit',
      target: resourceName(cardTypeName()),
      updateKey: { key: 'customFields' },
      operation: { name: 'remove', target: { name: fieldName() } },
    });
    const ct = project.resources.byType(cardTypeName(), 'cardTypes').show();
    expect(ct.alwaysVisibleFields ?? []).not.toContain(fieldName());
    expect(ct.optionallyVisibleFields ?? []).not.toContain(fieldName());
  });
});
