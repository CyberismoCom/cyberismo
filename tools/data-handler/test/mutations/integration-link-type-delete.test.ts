import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { join } from 'node:path';

import type { Project } from '../../src/containers/project.js';
import { ResourceMutations } from '../../src/mutations/resource-mutations.js';
import { ConfigurationLogger } from '../../src/utils/configuration-logger.js';
import { deleteDir } from '../../src/utils/file-utils.js';
import { resourceName } from '../../src/utils/resource-utils.js';
import { createLinkSeededProject } from './helpers.js';

const tmpDir = join(import.meta.dirname, 'tmp-integration-link-type-delete');

describe('LinkType delete end-to-end', () => {
  let project: Project;

  beforeAll(async () => {
    project = await createLinkSeededProject(tmpDir);
  });
  afterAll(async () => {
    await deleteDir(tmpDir);
  });

  it('apply → log entry; links stripped from cards', async () => {
    const linkTypeName = `${project.projectPrefix}/linkTypes/test`;
    const mutations = new ResourceMutations(project);
    const input = {
      kind: 'delete' as const,
      target: resourceName(linkTypeName),
    };
    // Guard: the cascade must have something to strip for this test to mean
    // anything.
    const linksBefore = project
      .cards(undefined)
      .reduce(
        (n, c) =>
          n +
          (c.metadata?.links?.filter((l) => l.linkType === linkTypeName)
            .length ?? 0),
        0,
      );
    expect(linksBefore).toBeGreaterThan(0);

    await mutations.apply(input);

    // Cards no longer reference the deleted link type.
    for (const c of project.cards(undefined)) {
      expect(
        c.metadata?.links?.some((l) => l.linkType === linkTypeName),
      ).not.toBe(true);
    }
    expect(project.resources.exists(linkTypeName)).toBe(false);

    const entries = await ConfigurationLogger.entries(project.basePath);
    const deleteEntries = entries.filter(
      (e) => e.operation === 'resource_delete' && e.target === linkTypeName,
    );
    expect(deleteEntries).toHaveLength(1);
  });
});
