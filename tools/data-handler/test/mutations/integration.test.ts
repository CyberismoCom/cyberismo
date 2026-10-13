import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';

import type { Checkout } from '../../src/containers/project.js';
import { ConfigurationLogger } from '../../src/utils/configuration-logger.js';
import { resourceName } from '../../src/utils/resource-utils.js';
import { deleteDir } from '../../src/utils/file-utils.js';
import { createLinkSeededProject } from './helpers.js';
import { Workspace } from '../../src/workspace/workspace.js';
import { SYSTEM_ACTOR } from '../../src/utils/tx-record.js';

const tmpDir = join(import.meta.dirname, 'tmp-integration');

describe('mutation engine end-to-end', () => {
  let checkout: Checkout;

  beforeEach(async () => {
    checkout = await createLinkSeededProject(tmpDir);
  });

  afterEach(async () => {
    await deleteDir(tmpDir);
  });

  it('apply runs the cascade and writes a log entry', async () => {
    const input = {
      kind: 'rename' as const,
      target: resourceName(`${checkout.projectPrefix}/linkTypes/test`),
      newIdentifier: 'is-caused-by',
    };

    await Workspace.over(checkout, SYSTEM_ACTOR).changes.apply(input);

    // The cascade ran: every card link that referenced the old name now
    // points at the new name.
    const oldRef = `${checkout.projectPrefix}/linkTypes/test`;
    const newRef = `${checkout.projectPrefix}/linkTypes/is-caused-by`;
    let sawNew = false;
    for (const card of checkout.cardTree.cards()) {
      for (const link of card.metadata?.links ?? []) {
        expect(link.linkType).not.toBe(oldRef);
        if (link.linkType === newRef) sawNew = true;
      }
    }
    expect(sawNew).toBe(true);

    const entries = await ConfigurationLogger.entries(checkout.basePath);
    const renameEntry = entries.find((e) => e.operation === 'resource_rename');
    expect(renameEntry).toBeDefined();
    expect(renameEntry!.target).toBe(
      `${checkout.projectPrefix}/linkTypes/test`,
    );
  });
});
