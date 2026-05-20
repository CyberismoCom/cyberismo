// tools/data-handler/test/mutations/handlers/default-no-cascade.test.ts

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../../src/containers/project.js';
import { DefaultNoCascadeHandler } from '../../../src/mutations/handlers/default-no-cascade.js';
import { resourceName } from '../../../src/utils/resource-utils.js';
import { deleteDir } from '../../../src/utils/file-utils.js';

const testDir = join(import.meta.dirname, 'tmp-default-handler');
const fixturePath = join(
  import.meta.dirname,
  '..',
  '..',
  '..',
  'test',
  'test-data',
  'valid',
  'decision-records',
);

describe('DefaultNoCascadeHandler', () => {
  beforeAll(async () => {
    await mkdir(testDir, { recursive: true });
  });
  afterAll(async () => {
    await deleteDir(testDir);
  });

  it('reports zero affected items in preview', async () => {
    const project = new Project(fixturePath);
    const handler = new DefaultNoCascadeHandler();
    const ctx = {
      project,
      input: {
        kind: 'edit' as const,
        target: resourceName('test/cardTypes/foo'),
        updateKey: { key: 'displayName' },
        operation: { name: 'change' as const, target: 'Old', to: 'New' },
      },
    };
    expect(handler.matches(ctx)).toBe(true);
    const preview = await handler.preview(ctx);
    expect(preview.affectedCardCount).toBe(0);
    expect(preview.affectedLinkCount).toBe(0);
    expect(preview.dataLossExpected).toBe(false);
  });

  it('is not breaking', () => {
    const handler = new DefaultNoCascadeHandler();
    expect(handler.isBreaking).toBe(false);
  });
});
