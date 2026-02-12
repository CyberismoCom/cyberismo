import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { getCardQueryResult, reset } from '../src/export.js';
import type { CommandManager } from '@cyberismo/data-handler';

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
        project: {
          calculationEngine: { runQuery },
        },
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
  });
});
