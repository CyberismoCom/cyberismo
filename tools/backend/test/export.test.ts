import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { getCardQueryResult, reset } from '../src/export.js';
import { CommandManager } from '@cyberismo/data-handler';

// Mock external dependencies
vi.mock('@cyberismo/data-handler');
vi.mock('../src/app.js');
vi.mock('node:fs/promises');
vi.mock('../src/utils.js', () => ({
  runCbSafely: vi.fn((fn) => fn()),
  runInParallel: vi.fn(async (promises) => {
    for (const promiseFn of promises) {
      await promiseFn();
    }
  }),
  staticFrontendDirRelative: './static-frontend',
}));

describe('export module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getCardQueryResult', () => {
    test('should return all cards when no cardKey is provided', async () => {
      const mockCards = [
        { key: 'card1', title: 'Card 1' },
        { key: 'card2', title: 'Card 2' },
      ];

      const mockCommands = {
        project: {
          calculationEngine: {
            runQuery: vi.fn().mockResolvedValue(mockCards),
          },
        },
      };

      vi.mocked(CommandManager.getInstance).mockResolvedValue(
        mockCommands as unknown as CommandManager,
      );

      const result = await getCardQueryResult('/test/project');

      expect(result).toEqual(mockCards);
      expect(
        mockCommands.project.calculationEngine.runQuery,
      ).toHaveBeenCalledWith('card', 'exportedSite', {});
    });

    test('should return specific card when cardKey is provided', async () => {
      const mockCards = [
        { key: 'card1', title: 'Card 1' },
        { key: 'card2', title: 'Card 2' },
      ];

      const mockCommands = {
        project: {
          calculationEngine: {
            runQuery: vi.fn().mockResolvedValue(mockCards),
          },
        },
      };

      vi.mocked(CommandManager.getInstance).mockResolvedValue(
        mockCommands as unknown as CommandManager,
      );

      const result = await getCardQueryResult('/test/project', 'card1');

      expect(result).toEqual([{ key: 'card1', title: 'Card 1' }]);
    });

    test('should throw error when card is not found', async () => {
      const mockCards = [{ key: 'card1', title: 'Card 1' }];

      const mockCommands = {
        project: {
          calculationEngine: {
            runQuery: vi.fn().mockResolvedValue(mockCards),
          },
        },
      };

      vi.mocked(CommandManager.getInstance).mockResolvedValue(
        mockCommands as unknown as CommandManager,
      );

      await expect(
        getCardQueryResult('/test/project', 'nonexistent'),
      ).rejects.toThrow('Card nonexistent not found');
    });

    test('should cache query results for subsequent calls', async () => {
      const mockCards = [{ key: 'card1', title: 'Card 1' }];

      const mockCommands = {
        project: {
          calculationEngine: {
            runQuery: vi.fn().mockResolvedValue(mockCards),
          },
        },
      };

      vi.mocked(CommandManager.getInstance).mockResolvedValue(
        mockCommands as unknown as CommandManager,
      );

      // First call
      await getCardQueryResult('/test/project');
      // Second call
      await getCardQueryResult('/test/project', 'card1');

      await getCardQueryResult('/test/project', 'card1');

      await getCardQueryResult('/test/project', 'card1');

      await getCardQueryResult('/test/project', 'card1');

      await getCardQueryResult('/test/project', 'card1');

      // calculate cmd should be only called once
      expect(
        mockCommands.project.calculationEngine.runQuery,
      ).toHaveBeenCalledTimes(1);
    });
  });
});
