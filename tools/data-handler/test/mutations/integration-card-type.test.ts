import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { copyDir } from '../../src/utils/file-utils.js';
import type { Checkout } from '../../src/infra/checkout.js';
import { getTestProject } from '../helpers/test-utils.js';
import { ConfigurationLogger } from '../../src/infra/replay-log/configuration-logger.js';
import { resourceName } from '../../src/utils/resource-utils.js';
import { Workspace } from '../../src/workspace/workspace.js';
import { SYSTEM_ACTOR } from '../../src/utils/tx-record.js';

const baseDir = import.meta.dirname;
const testDir = join(baseDir, 'tmp-card-type-integration');
const decisionRecordsPath = join(testDir, 'valid/decision-records');
let checkout: Checkout;

describe('CardType mutation engine end-to-end', () => {
  beforeEach(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir(join(baseDir, '..', 'test-data'), testDir);
    checkout = getTestProject(decisionRecordsPath);
    await checkout.populateCaches();
  });
  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('apply → log entry for a CardType delete with cards', async () => {
    const target = resourceName(`${checkout.projectPrefix}/cardTypes/decision`);

    await Workspace.over(checkout, SYSTEM_ACTOR).changes.apply({
      kind: 'delete',
      target,
    });

    await checkout.populateCaches();
    expect(
      checkout.resources.exists(`${checkout.projectPrefix}/cardTypes/decision`),
    ).toBe(false);
    const remaining = checkout.cardTree
      .cards()
      .filter(
        (c) =>
          c.metadata?.cardType ===
          `${checkout.projectPrefix}/cardTypes/decision`,
      );
    expect(remaining).toHaveLength(0);

    const entries = await ConfigurationLogger.entries(checkout.basePath);
    expect(
      entries.some(
        (e) =>
          e.operation === 'resource_delete' &&
          e.target === `${checkout.projectPrefix}/cardTypes/decision`,
      ),
    ).toBe(true);
  });

  it('apply → log entry for a CardType rename', async () => {
    const target = resourceName(`${checkout.projectPrefix}/cardTypes/decision`);

    await Workspace.over(checkout, SYSTEM_ACTOR).changes.apply({
      kind: 'rename',
      target,
      newIdentifier: 'choice',
    });

    const entries = await ConfigurationLogger.entries(checkout.basePath);
    expect(
      entries.some(
        (e) =>
          e.operation === 'resource_rename' &&
          e.target === `${checkout.projectPrefix}/cardTypes/decision`,
      ),
    ).toBe(true);
  });

  it('display-only changes route to the plain handler (no log entry)', async () => {
    await Workspace.over(checkout, SYSTEM_ACTOR).changes.apply({
      kind: 'edit',
      target: resourceName(`${checkout.projectPrefix}/cardTypes/decision`),
      updateKey: { key: 'displayName' },
      operation: { name: 'change', target: 'Decision', to: 'Choice' },
    });

    const entries = await ConfigurationLogger.entries(checkout.basePath);
    expect(entries).toHaveLength(0);
  });

  const cardOnDisk = (path: string) =>
    JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>;

  const declares = (cardType: string, field: string) =>
    checkout.resources
      .byType(cardType, 'cardTypes')
      .data?.customFields?.some((f) => f.name === field) ?? false;

  it('adding a customField writes no key onto existing cards (no log entry)', async () => {
    // The decision card type already declares every local field type, so the
    // only genuinely undeclared pairing is simplepage + 'finished'.
    const cardType = `${checkout.projectPrefix}/cardTypes/simplepage`;
    const field = `${checkout.projectPrefix}/fieldTypes/finished`;
    const cardPath = join(
      decisionRecordsPath,
      'cardRoot/decision_5/index.json',
    );
    expect(cardOnDisk(cardPath).cardType).toBe(cardType);
    expect(field in cardOnDisk(cardPath)).toBe(false);

    await Workspace.over(checkout, SYSTEM_ACTOR).changes.apply({
      kind: 'edit',
      target: resourceName(cardType),
      updateKey: { key: 'customFields' },
      operation: { name: 'add', target: { name: field } },
    });

    // The definition write landed, but the card gained no null placeholder.
    expect(declares(cardType, field)).toBe(true);
    expect(field in cardOnDisk(cardPath)).toBe(false);
    expect(await ConfigurationLogger.entries(checkout.basePath)).toHaveLength(
      0,
    );
  });

  it('removing a customField leaves the stored value dormant (no log entry)', async () => {
    const cardType = `${checkout.projectPrefix}/cardTypes/decision`;
    const field = `${checkout.projectPrefix}/fieldTypes/finished`;
    const cardPath = join(
      decisionRecordsPath,
      'cardRoot/decision_5/c/decision_6/index.json',
    );
    // The fixture stores null here, which would make a surviving-value
    // assertion vacuous; seed a real value and reload so the card cache sees it.
    writeFileSync(
      cardPath,
      JSON.stringify({ ...cardOnDisk(cardPath), [field]: true }, null, 4),
    );
    checkout = getTestProject(decisionRecordsPath);
    await checkout.populateCaches();

    await Workspace.over(checkout, SYSTEM_ACTOR).changes.apply({
      kind: 'edit',
      target: resourceName(cardType),
      updateKey: { key: 'customFields' },
      operation: { name: 'remove', target: { name: field } },
    });

    expect(declares(cardType, field)).toBe(false);
    expect(cardOnDisk(cardPath)[field]).toBe(true);
    expect(await ConfigurationLogger.entries(checkout.basePath)).toHaveLength(
      0,
    );
  });
});
