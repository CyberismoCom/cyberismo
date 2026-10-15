import { expect, it, describe, beforeEach, afterEach } from 'vitest';

import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

import type { CardType } from '@cyberismo/model';
import { copyDir } from '../src/shared/utils/file-utils.js';
import type { Checkout } from '../src/infra/checkout.js';
import type { Changes } from '../src/api/workspace/changes.js';
import { getTestProject } from './helpers/test-utils.js';
import { resourceName } from '../src/shared/utils/resource-utils.js';
import { Workspace } from '../src/api/workspace/workspace.js';
import { SYSTEM_ACTOR } from '../src/infra/tx/tx-record.js';

const baseDir = import.meta.dirname;
const testDir = join(baseDir, 'tmp-update-tests');
const decisionRecordsPath = join(testDir, 'valid/decision-records');
let checkout: Checkout;
let update: Changes;

describe('update command', () => {
  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data', testDir);
    checkout = getTestProject(decisionRecordsPath);
    await checkout.populateCaches();
    update = Workspace.over(checkout, SYSTEM_ACTOR).changes;
  });

  it('update resource - rank item using string value (name)', async () => {
    const show = Workspace.over(checkout, SYSTEM_ACTOR);
    const name = `${checkout.projectPrefix}/cardTypes/decision`;
    const moveToIndex = 0;

    const before = await show.resources.show(name);
    const foundBefore = (before as CardType).customFields.find((item) => {
      return item.name === 'decision/fieldTypes/finished';
    });
    const indexBefore = (before as CardType).customFields.indexOf(foundBefore!);

    await update.apply({
      kind: 'edit',
      target: resourceName(name),
      updateKey: { key: 'customFields' },
      operation: {
        name: 'rank',
        target: 'decision/fieldTypes/finished',
        newIndex: moveToIndex,
      },
    });

    const after = await show.resources.show(name);
    const foundAfter = (after as CardType).customFields.find((item) => {
      return item.name === 'decision/fieldTypes/finished';
    });
    const indexAfter = (after as CardType).customFields.indexOf(foundAfter!);

    expect(indexBefore).not.toBe(indexAfter);
    expect(indexAfter).toBe(moveToIndex);
  });
});
