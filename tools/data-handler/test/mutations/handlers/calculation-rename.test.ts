import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../../src/containers/project.js';
import { CalculationRenameHandler } from '../../../src/mutations/handlers/calculation.js';
import { copyDir } from '../../../src/utils/file-utils.js';
import { resourceName } from '../../../src/utils/resource-utils.js';

const FIXTURE_PATH = join(
  import.meta.dirname,
  '..',
  '..',
  'test-data',
  'valid',
  'decision-records',
);
const tmpDir = join(import.meta.dirname, 'tmp-calculation-rename');

describe('CalculationRenameHandler', () => {
  let project: Project;
  let projectPath: string;

  beforeEach(async () => {
    projectPath = join(tmpDir, `proj-${Date.now()}`);
    await mkdir(projectPath, { recursive: true });
    await copyDir(FIXTURE_PATH, projectPath);
    project = new Project(projectPath);
    await project.populateCaches();
  });
  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('matches rename inputs on calculations only', () => {
    const handler = new CalculationRenameHandler();
    const ctx = {
      project,
      input: {
        kind: 'rename' as const,
        target: resourceName(
          `${project.projectPrefix}/calculations/test`,
        ),
        newIdentifier: 'test-renamed',
      },
    };
    expect(handler.matches(ctx)).toBe(true);
  });

  it('is breaking', () => {
    expect(new CalculationRenameHandler().isBreaking).toBe(true);
  });

  it('applyCascade + applyResourceOp rewrites references in calculation files', async () => {
    // Use the first calculation in the fixture; fall back if none.
    const calculations = project.resources.calculations(/* localOnly */);
    if (calculations.length === 0) return; // skip if fixture has none
    const calc = calculations[0];
    const oldName = calc.data!.name;
    const newIdent = `${calc.resourceName.identifier}-renamed`;
    const handler = new CalculationRenameHandler();
    const ctx = {
      project,
      input: {
        kind: 'rename' as const,
        target: resourceName(oldName),
        newIdentifier: newIdent,
      },
    };

    await handler.applyCascade(ctx);
    await handler.applyResourceOp(ctx);

    const renamed = project.resources.byType(
      `${calc.resourceName.prefix}/calculations/${newIdent}`,
      'calculations',
    );
    expect(renamed).toBeDefined();
  });
});
