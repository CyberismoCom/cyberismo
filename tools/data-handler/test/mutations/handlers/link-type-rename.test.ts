import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';

import type { Project } from '../../../src/containers/project.js';
import { LinkTypeRenameHandler } from '../../../src/mutations/handlers/link-type-rename.js';
import { resourceName } from '../../../src/utils/resource-utils.js';
import { deleteDir } from '../../../src/utils/file-utils.js';
import { createLinkSeededProject } from '../helpers.js';

const tmpDir = join(import.meta.dirname, 'tmp-link-type-rename');

describe('LinkTypeRenameHandler', () => {
  let project: Project;

  beforeEach(async () => {
    project = await createLinkSeededProject(tmpDir);
  });
  afterEach(async () => {
    await deleteDir(tmpDir);
  });

  it('matches a link-type rename input', () => {
    const handler = new LinkTypeRenameHandler();
    const ctx = {
      project,
      input: {
        kind: 'rename' as const,
        target: resourceName(`${project.projectPrefix}/linkTypes/test`),
        newIdentifier: 'is-caused-by',
      },
    };
    expect(handler.matches(ctx)).toBe(true);
  });

  it('applying rewrites every card that referenced the old link type', async () => {
    const handler = new LinkTypeRenameHandler();
    const ctx = {
      project,
      input: {
        kind: 'rename' as const,
        target: resourceName(`${project.projectPrefix}/linkTypes/test`),
        newIdentifier: 'is-caused-by',
      },
    };
    await handler.apply(ctx);
    const cards = project.cards(undefined);
    const oldRef = `${project.projectPrefix}/linkTypes/test`;
    const newRef = `${project.projectPrefix}/linkTypes/is-caused-by`;
    for (const card of cards) {
      for (const link of card.metadata?.links ?? []) {
        expect(link.linkType).not.toBe(oldRef);
        if (link.linkType.endsWith('/linkTypes/is-caused-by')) {
          expect(link.linkType).toBe(newRef);
        }
      }
    }
  });

  it('isBreaking is true', () => {
    const handler = new LinkTypeRenameHandler();
    expect(handler.isBreaking).toBe(true);
  });
});
