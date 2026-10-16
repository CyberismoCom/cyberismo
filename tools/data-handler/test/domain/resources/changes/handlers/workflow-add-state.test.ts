// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { Checkout } from '../../../../../src/state/checkout/checkout.js';
import { resourceName } from '../../../../../src/shared/utils/resource-utils.js';
import { copyDir } from '../../../../../src/shared/utils/file-utils.js';
import { Workspace } from '../../../../../src/api/workspace.js';
import { SYSTEM_ACTOR } from '../../../../../src/infra/tx/tx-record.js';

const FIXTURE_PATH = join(
  import.meta.dirname,
  '..',
  '..',
  '..',
  '..',
  'test-data',
  'valid',
  'decision-records',
);
const tmpDir = join(import.meta.dirname, 'tmp-workflow-add-state');

describe('workflow states add routing and cascade', () => {
  let checkout: Checkout;

  beforeEach(async () => {
    const projectPath = join(tmpDir, `proj-${Date.now()}-${Math.random()}`);
    await mkdir(projectPath, { recursive: true });
    await copyDir(FIXTURE_PATH, projectPath);
    checkout = new Checkout(projectPath);
    await checkout.populateCaches();
  });
  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('apply appends the new state to the workflow definition', async () => {
    await Workspace.over(checkout, SYSTEM_ACTOR).changes.apply({
      kind: 'edit',
      target: resourceName('decision/workflows/decision'),
      updateKey: { key: 'states' },
      operation: {
        name: 'add',
        target: { name: 'Archived', category: 'closed' },
      },
    });
    const wf = checkout.resources.byType(
      'decision/workflows/decision',
      'workflows',
    );
    expect(wf?.data?.states.map((s) => s.name)).toContain('Archived');
  });
});
