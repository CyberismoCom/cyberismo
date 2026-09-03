import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import type * as FsPromises from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { CommandManager } from '@cyberismo/data-handler';
import { getCardQueryResult, reset, exportSite } from '../src/export.js';
import { ProjectRegistry } from '../src/project-registry.js';
import { cleanupTempTestData, createTempTestData } from './test-utils.js';

// The export copies the built frontend over the output directory, and that
// build does not exist when the suite runs from source.
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof FsPromises>();
  return {
    ...actual,
    cp: async (source: string, ...rest: unknown[]) =>
      source.endsWith('public')
        ? undefined
        : (actual.cp as (...args: unknown[]) => Promise<void>)(source, ...rest),
  };
});

/** Every file under `dir`, as paths relative to it. */
async function filesUnder(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)));
}

describe('export module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getCardQueryResult', () => {
    function createMockCommands(mockCards: { key: string; title: string }[]) {
      const runQuery = vi.fn().mockResolvedValue(mockCards);
      const commands = {
        calculateCmd: { runQuery },
        project: { configuration: { cardKeyPrefix: 'TEST' } },
      } as unknown as CommandManager;
      return { commands, runQuery };
    }

    test('should return all cards when no cardKey is provided', async () => {
      const mockCards = [
        { key: 'card1', title: 'Card 1' },
        { key: 'card2', title: 'Card 2' },
      ];

      const { commands, runQuery } = createMockCommands(mockCards);

      const result = await getCardQueryResult(commands);

      expect(result).toEqual(mockCards);
      expect(runQuery).toHaveBeenCalledWith('card', 'exportedSite', {});
    });

    test('should return specific card when cardKey is provided', async () => {
      const mockCards = [
        { key: 'card1', title: 'Card 1' },
        { key: 'card2', title: 'Card 2' },
      ];

      const { commands } = createMockCommands(mockCards);

      const result = await getCardQueryResult(commands, 'card1');

      expect(result).toEqual([{ key: 'card1', title: 'Card 1' }]);
    });

    test('should throw error when card is not found', async () => {
      const mockCards = [{ key: 'card1', title: 'Card 1' }];

      const { commands } = createMockCommands(mockCards);

      await expect(getCardQueryResult(commands, 'nonexistent')).rejects.toThrow(
        'Card nonexistent not found',
      );
    });

    test('should cache query results for subsequent calls', async () => {
      const mockCards = [{ key: 'card1', title: 'Card 1' }];

      const { commands, runQuery } = createMockCommands(mockCards);

      // First call
      await getCardQueryResult(commands);
      // Second call
      await getCardQueryResult(commands, 'card1');

      await getCardQueryResult(commands, 'card1');

      await getCardQueryResult(commands, 'card1');

      await getCardQueryResult(commands, 'card1');

      await getCardQueryResult(commands, 'card1');

      // calculate cmd should be only called once
      expect(runQuery).toHaveBeenCalledTimes(1);
    });

    test('should maintain separate caches per project prefix', async () => {
      const cardsA = [{ key: 'alpha_1', title: 'Alpha Card' }];
      const cardsB = [{ key: 'beta_1', title: 'Beta Card' }];

      const { commands: commandsA, runQuery: runQueryA } =
        createMockCommands(cardsA);
      const { commands: commandsB, runQuery: runQueryB } =
        createMockCommands(cardsB);

      // Override prefix so they differ
      (
        commandsA.project as { configuration: { cardKeyPrefix: string } }
      ).configuration.cardKeyPrefix = 'alpha';
      (
        commandsB.project as { configuration: { cardKeyPrefix: string } }
      ).configuration.cardKeyPrefix = 'beta';

      const resultA = await getCardQueryResult(commandsA);
      const resultB = await getCardQueryResult(commandsB);

      expect(resultA).toEqual(cardsA);
      expect(resultB).toEqual(cardsB);
      expect(runQueryA).toHaveBeenCalledTimes(1);
      expect(runQueryB).toHaveBeenCalledTimes(1);
    });

    test('should not cross-contaminate cached results between projects', async () => {
      const cardsA = [
        { key: 'alpha_1', title: 'A1' },
        { key: 'alpha_2', title: 'A2' },
      ];
      const cardsB = [{ key: 'beta_1', title: 'B1' }];

      const { commands: commandsA } = createMockCommands(cardsA);
      const { commands: commandsB } = createMockCommands(cardsB);

      (
        commandsA.project as { configuration: { cardKeyPrefix: string } }
      ).configuration.cardKeyPrefix = 'alpha';
      (
        commandsB.project as { configuration: { cardKeyPrefix: string } }
      ).configuration.cardKeyPrefix = 'beta';

      // Cache both
      await getCardQueryResult(commandsA);
      await getCardQueryResult(commandsB);

      // alpha_1 should only be found via commandsA
      const found = await getCardQueryResult(commandsA, 'alpha_1');
      expect(found).toEqual([cardsA[0]]);

      // alpha_1 should NOT be found via commandsB
      await expect(getCardQueryResult(commandsB, 'alpha_1')).rejects.toThrow(
        'Card alpha_1 not found',
      );
    });
  });

  describe('exportSite validation', () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await mkdtemp(join(tmpdir(), 'cyberismo-export-test-'));
    });

    afterEach(async () => {
      await rm(tempDir, { recursive: true, force: true });
    });

    test('should throw when defaultProject is not in the registry', async () => {
      const registry = new ProjectRegistry();

      await expect(
        exportSite(registry, tempDir, {
          defaultProject: 'nonexistent',
        }),
      ).rejects.toThrow("Default project 'nonexistent' is not in the registry");
    });

    test('leaves the module version routes out of the exported site', async () => {
      // Both routes need a query or a body the crawler cannot supply, and the
      // plan they would compute goes stale the moment a module is published.
      const projectPath = await createTempTestData('minimal');
      // Nothing here should reach a hub; answer any refresh with no modules.
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ modules: [] }), {
          headers: { 'content-type': 'application/json' },
        }),
      );
      try {
        const commands = await CommandManager.getInstance(projectPath);
        const siteDir = join(tempDir, 'site');
        const { errors } = await exportSite(
          ProjectRegistry.fromCommandManager(commands),
          siteDir,
        );

        const written = await filesUnder(siteDir);
        expect(
          written.filter((file) => file.includes('modules/update-plan')),
        ).toEqual([]);
        expect(
          written.filter((file) => file.includes('modules/versions')),
        ).toEqual([]);
        expect(errors).toEqual([]);
      } finally {
        await cleanupTempTestData(projectPath);
      }
    });

    test('should throw with available prefixes in the error message', async () => {
      const commands = {
        calculateCmd: { runQuery: vi.fn().mockResolvedValue([]) },
        project: {
          basePath: '/tmp/proj',
          configuration: { cardKeyPrefix: 'foo', name: 'Foo' },
        },
      } as unknown as CommandManager;

      const registry = ProjectRegistry.fromCommandManager(commands);

      await expect(
        exportSite(registry, tempDir, {
          defaultProject: 'bar',
        }),
      ).rejects.toThrow('Available: foo');
    });
  });
});
