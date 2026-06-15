import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';

import type { Project } from '../../src/containers/project.js';
import { ResourceMutations } from '../../src/mutations/resource-mutations.js';
import { ConfigurationLogger } from '../../src/utils/configuration-logger.js';
import { resourceName } from '../../src/utils/resource-utils.js';
import { deleteDir } from '../../src/utils/file-utils.js';
import { createLinkSeededProject } from './helpers.js';

const tmpDir = join(import.meta.dirname, 'tmp-integration');

describe('mutation engine end-to-end', () => {
  let project: Project;

  beforeEach(async () => {
    project = await createLinkSeededProject(tmpDir);
  });

  afterEach(async () => {
    await deleteDir(tmpDir);
  });

  it('apply runs the cascade and writes a log entry', async () => {
    const mutations = new ResourceMutations(project);
    const input = {
      kind: 'rename' as const,
      target: resourceName(`${project.projectPrefix}/linkTypes/test`),
      newIdentifier: 'is-caused-by',
    };

    await mutations.apply(input);

    // The cascade ran: every card link that referenced the old name now
    // points at the new name.
    const oldRef = `${project.projectPrefix}/linkTypes/test`;
    const newRef = `${project.projectPrefix}/linkTypes/is-caused-by`;
    let sawNew = false;
    for (const card of project.cards(undefined)) {
      for (const link of card.metadata?.links ?? []) {
        expect(link.linkType).not.toBe(oldRef);
        if (link.linkType === newRef) sawNew = true;
      }
    }
    expect(sawNew).toBe(true);

    const entries = await ConfigurationLogger.entries(project.basePath);
    const renameEntry = entries.find((e) => e.operation === 'resource_rename');
    expect(renameEntry).toBeDefined();
    expect(renameEntry!.target).toBe(`${project.projectPrefix}/linkTypes/test`);
  });
});
