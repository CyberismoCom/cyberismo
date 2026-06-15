import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { copyDir } from '../../../src/utils/file-utils.js';
import type { Project } from '../../../src/containers/project.js';
import { getTestProject } from '../../helpers/test-utils.js';
import { CardTypeDeleteHandler } from '../../../src/mutations/handlers/card-type-delete.js';
import { dispatch } from '../../../src/mutations/dispatcher.js';
import { resourceName } from '../../../src/utils/resource-utils.js';
import { ResourceMutations } from '../../../src/mutations/resource-mutations.js';

const baseDir = import.meta.dirname;
const testDir = join(baseDir, 'tmp-card-type-delete');
const decisionRecordsPath = join(testDir, 'valid/decision-records');
let project: Project;

describe('CardTypeDeleteHandler', () => {
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

  it('routes a CardType delete input to this handler (breaking)', () => {
    const { handler, breaking } = dispatch({
      project,
      input: {
        kind: 'delete',
        target: resourceName(cardTypeName()),
      },
    });
    expect(handler).toBeInstanceOf(CardTypeDeleteHandler);
    expect(breaking).toBe(true);
  });

  it('deletes every card of this type', async () => {
    const before = project
      .cards(undefined)
      .filter((c) => c.metadata?.cardType === cardTypeName());
    expect(before.length).toBeGreaterThan(0);

    const mutations = new ResourceMutations(project);
    await mutations.apply({
      kind: 'delete',
      target: resourceName(cardTypeName()),
    });
    // Re-read after apply (caches were invalidated by removeCard calls).
    await project.populateCaches();
    const after = project
      .cards(undefined)
      .filter((c) => c.metadata?.cardType === cardTypeName());
    expect(after).toHaveLength(0);
  });

  it('strips the card type from every link type sourceCardTypes/destinationCardTypes', async () => {
    const mutations = new ResourceMutations(project);
    await mutations.apply({
      kind: 'delete',
      target: resourceName(cardTypeName()),
    });
    for (const lt of project.resources.linkTypes()) {
      const data = lt.data!;
      expect(data.sourceCardTypes).not.toContain(cardTypeName());
      expect(data.destinationCardTypes).not.toContain(cardTypeName());
    }
  });

  it('deletes the card type resource file from disk', async () => {
    const mutations = new ResourceMutations(project);
    await mutations.apply({
      kind: 'delete',
      target: resourceName(cardTypeName()),
    });
    expect(project.resources.exists(cardTypeName())).toBe(false);
  });
});
