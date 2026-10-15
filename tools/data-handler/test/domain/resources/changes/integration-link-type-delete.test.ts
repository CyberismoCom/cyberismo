import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { join } from 'node:path';

import type { Checkout } from '../../../../src/infra/checkout.js';
import { ConfigurationLogger } from '../../../../src/infra/replay-log/configuration-logger.js';
import { deleteDir } from '../../../../src/shared/utils/file-utils.js';
import { resourceName } from '../../../../src/shared/utils/resource-utils.js';
import { createLinkSeededProject } from './helpers.js';
import { Workspace } from '../../../../src/api/workspace/workspace.js';
import { SYSTEM_ACTOR } from '../../../../src/infra/tx/tx-record.js';

const tmpDir = join(import.meta.dirname, 'tmp-integration-link-type-delete');

describe('LinkType delete end-to-end', () => {
  let checkout: Checkout;

  beforeAll(async () => {
    checkout = await createLinkSeededProject(tmpDir);
  });
  afterAll(async () => {
    await deleteDir(tmpDir);
  });

  it('apply → log entry; links stripped from cards', async () => {
    const linkTypeName = `${checkout.projectPrefix}/linkTypes/test`;
    const input = {
      kind: 'delete' as const,
      target: resourceName(linkTypeName),
    };
    // Guard: the cascade must have something to strip for this test to mean
    // anything.
    const linksBefore = checkout.cardTree
      .cards()
      .reduce(
        (n, c) =>
          n +
          (c.metadata?.links?.filter((l) => l.linkType === linkTypeName)
            .length ?? 0),
        0,
      );
    expect(linksBefore).toBeGreaterThan(0);

    await Workspace.over(checkout, SYSTEM_ACTOR).changes.apply(input);

    // Cards no longer reference the deleted link type.
    for (const c of checkout.cardTree.cards()) {
      expect(
        c.metadata?.links?.some((l) => l.linkType === linkTypeName),
      ).not.toBe(true);
    }
    expect(checkout.resources.exists(linkTypeName)).toBe(false);

    const entries = await ConfigurationLogger.entries(checkout.basePath);
    const deleteEntries = entries.filter(
      (e) => e.operation === 'resource_delete' && e.target === linkTypeName,
    );
    expect(deleteEntries).toHaveLength(1);
  });
});
