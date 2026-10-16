// testing
import { expect, it, describe, beforeAll, afterAll } from 'vitest';

// node
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

// cyberismo
import { copyDir } from '../src/utils/file-utils.js';
import { generateReportContent } from '../src/queries/report.js';

// Create test artifacts in a temp folder.
const baseDir = import.meta.dirname;
const testDir = join(baseDir, 'tmp-command-handler-skill-tests');

describe('skill command', () => {
  beforeAll(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data', testDir);
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('renders a content-only skill without running a query', async () => {
    // A skill with an empty query must not invoke the logic program engine.
    const calculate = {
      runLogicProgram: () => {
        throw new Error('logic program should not run for an empty query');
      },
    };
    const rendered = await generateReportContent({
      // Only runLogicProgram is used by generateReportContent.
      calculate: calculate as never,
      contentTemplate: '# {{title}}\n\nApplies to {{cardKey}}.',
      queryTemplate: '',
      options: { title: 'Risk register', cardKey: 'mini_1' },
      context: 'localApp',
    });
    expect(rendered).toContain('# Risk register');
    expect(rendered).toContain('Applies to mini_1.');
  });
});
