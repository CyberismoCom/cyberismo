import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getCardQueryResult, reset, exportSite } from '../src/export.js';
import {
  localFolder,
  type ProjectDirectory,
  type Workspace,
} from '@cyberismo/data-handler';
import type * as Utils from '../src/utils.js';

// The built frontend does not exist when tests run from source.
vi.mock('../src/utils.js', async (importOriginal) => {
  const { mkdtempSync } = await import('node:fs');
  return {
    ...(await importOriginal<typeof Utils>()),
    staticFrontendDirRelative: mkdtempSync(join(tmpdir(), 'cyberismo-fe-')),
  };
});
import { createTempTestFolder } from './test-utils.js';

describe('export module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getCardQueryResult', () => {
    function createMockCommands(
      mockCards: { key: string; title: string }[],
      prefix = 'TEST',
    ) {
      const runQuery = vi.fn().mockResolvedValue(mockCards);
      const ws = {
        queries: { runQuery },
        settings: { prefix },
      } as unknown as Workspace;
      return { ws, runQuery };
    }

    test('should return all cards when no cardKey is provided', async () => {
      const mockCards = [
        { key: 'card1', title: 'Card 1' },
        { key: 'card2', title: 'Card 2' },
      ];

      const { ws, runQuery } = createMockCommands(mockCards);

      const result = await getCardQueryResult(ws);

      expect(result).toEqual(mockCards);
      expect(runQuery).toHaveBeenCalledWith('card', 'exportedSite', {});
    });

    test('should return specific card when cardKey is provided', async () => {
      const mockCards = [
        { key: 'card1', title: 'Card 1' },
        { key: 'card2', title: 'Card 2' },
      ];

      const { ws } = createMockCommands(mockCards);

      const result = await getCardQueryResult(ws, 'card1');

      expect(result).toEqual([{ key: 'card1', title: 'Card 1' }]);
    });

    test('should throw error when card is not found', async () => {
      const mockCards = [{ key: 'card1', title: 'Card 1' }];

      const { ws } = createMockCommands(mockCards);

      await expect(getCardQueryResult(ws, 'nonexistent')).rejects.toThrow(
        'Card nonexistent not found',
      );
    });

    test('should cache query results for subsequent calls', async () => {
      const mockCards = [{ key: 'card1', title: 'Card 1' }];

      const { ws, runQuery } = createMockCommands(mockCards);

      // First call
      await getCardQueryResult(ws);
      // Second call
      await getCardQueryResult(ws, 'card1');

      await getCardQueryResult(ws, 'card1');

      await getCardQueryResult(ws, 'card1');

      await getCardQueryResult(ws, 'card1');

      await getCardQueryResult(ws, 'card1');

      // calculate cmd should be only called once
      expect(runQuery).toHaveBeenCalledTimes(1);
    });

    test('should maintain separate caches per project prefix', async () => {
      const cardsA = [{ key: 'alpha_1', title: 'Alpha Card' }];
      const cardsB = [{ key: 'beta_1', title: 'Beta Card' }];

      const { ws: commandsA, runQuery: runQueryA } = createMockCommands(
        cardsA,
        'alpha',
      );
      const { ws: commandsB, runQuery: runQueryB } = createMockCommands(
        cardsB,
        'beta',
      );

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

      const { ws: commandsA } = createMockCommands(cardsA, 'alpha');
      const { ws: commandsB } = createMockCommands(cardsB, 'beta');

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
      const registry = {
        list: async () => [],
      } as unknown as ProjectDirectory;

      await expect(
        exportSite(registry, tempDir, {
          defaultProject: 'nonexistent',
        }),
      ).rejects.toThrow("Default project 'nonexistent' is not in the registry");
    });

    test('should throw with available prefixes in the error message', async () => {
      const registry = {
        list: async () => [{ prefix: 'foo', name: 'Foo' }],
      } as unknown as ProjectDirectory;

      await expect(
        exportSite(registry, tempDir, {
          defaultProject: 'bar',
        }),
      ).rejects.toThrow('Available: foo');
    });
  });

  describe('exportSite error attribution', () => {
    let tempDir: string;
    let folder: string;

    beforeEach(async () => {
      tempDir = await mkdtemp(join(tmpdir(), 'cyberismo-export-test-'));
      folder = await createTempTestFolder('decision-records', 'minimal');
    });

    afterEach(async () => {
      await rm(tempDir, { recursive: true, force: true });
      await rm(folder, { recursive: true, force: true });
    });

    test('reports a failing card under its own project only', async () => {
      const { directory: registry } = await localFolder(folder);
      // Loaded, then lost on disk: its route fails at export.
      const card = join(folder, 'decision-records', 'cardRoot', 'decision_5');
      await rm(join(card, 'a', 'games.jpg'));

      const { errors } = await exportSite(registry, tempDir);

      expect(errors.map((e) => e.prefix)).toEqual(['decision']);
      expect(errors[0].errors.length).toBeGreaterThan(0);
    });
  });
});
