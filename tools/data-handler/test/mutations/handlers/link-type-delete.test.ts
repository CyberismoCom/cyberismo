import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';

import type { Project } from '../../../src/containers/project.js';
import { LinkTypeDeleteHandler } from '../../../src/mutations/handlers/link-type-delete.js';
import { deleteDir } from '../../../src/utils/file-utils.js';
import { resourceName } from '../../../src/utils/resource-utils.js';
import { createLinkSeededProject } from '../helpers.js';

const tmpDir = join(import.meta.dirname, 'tmp-link-type-delete');

describe('LinkTypeDeleteHandler', () => {
  let project: Project;

  beforeEach(async () => {
    project = await createLinkSeededProject(tmpDir);
  });
  afterEach(async () => {
    await deleteDir(tmpDir);
  });

  it('matches only delete inputs on linkTypes', () => {
    const handler = new LinkTypeDeleteHandler();
    expect(
      handler.matches({
        project,
        input: {
          kind: 'delete',
          target: resourceName(`${project.projectPrefix}/linkTypes/test`),
        },
      }),
    ).toBe(true);
    expect(
      handler.matches({
        project,
        input: {
          kind: 'delete',
          target: resourceName(`${project.projectPrefix}/cardTypes/foo`),
        },
      }),
    ).toBe(false);
  });

  it('is breaking', () => {
    expect(new LinkTypeDeleteHandler().isBreaking).toBe(true);
  });

  it('apply strips matching links and deletes the resource', async () => {
    const handler = new LinkTypeDeleteHandler();
    const linkTypeName = `${project.projectPrefix}/linkTypes/test`;
    await handler.apply({
      project,
      input: { kind: 'delete', target: resourceName(linkTypeName) },
    });

    for (const card of project.cards(undefined)) {
      const links = card.metadata?.links ?? [];
      expect(links.some((l) => l.linkType === linkTypeName)).toBe(false);
    }
    expect(project.resources.exists(linkTypeName)).toBe(false);
  });
});
