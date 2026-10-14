// testing
import { expect, it, describe } from 'vitest';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

import { copyDir } from '../src/utils/file-utils.js';
import { Cmd, Commands } from '../src/command-handler.js';

describe('clean recommendation', () => {
  const baseDir = import.meta.dirname;
  const RECOMMENDATION = "'cyberismo clean' to remove them";

  // Each test gets its own project folder: the CommandManager instance the
  // handler uses is keyed by project path, so a reused path would be served
  // from a stale in-memory project.
  async function handlerProject(testDirName: string) {
    const testDir = join(baseDir, testDirName);
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data/', testDir);
    return {
      testDir,
      handler: new Commands(),
      options: { projectPath: join(testDir, 'valid/decision-records') },
    };
  }

  it('recommends clean after a module import and after a module update', async () => {
    const { testDir, handler, options } = await handlerProject(
      'tmp-clean-recommend-modules',
    );
    try {
      // The project's own cards already hold dormant values, so both module
      // operations have something to report.
      const imported = await handler.command(
        Cmd.import,
        ['module', join(testDir, 'valid/minimal')],
        options,
      );
      expect(imported.statusCode).toBe(200);
      expect(imported.note).toContain(RECOMMENDATION);

      const updated = await handler.command(Cmd.updateModules, [], options);
      expect(updated.statusCode).toBe(200);
      expect(updated.note).toContain(RECOMMENDATION);
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  });
});
