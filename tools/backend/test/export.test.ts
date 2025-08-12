import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Context, Hono } from 'hono';
import {
  getCardQueryResult,
  exportSite,
  isSSGContext,
  ssgParams,
  reset,
} from '../src/export.js';
import { CommandManager } from '@cyberismo/data-handler';
import { createApp } from '../src/app.js';
import { mkdir, readFile, writeFile, cp } from 'node:fs/promises';
import path from 'node:path';

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

  describe('exportSite', () => {
    test('should export site with default directory', async () => {
      const mockApp = {
        routes: [
          { method: 'GET', path: '/api/cards' },
          { method: 'GET', path: '/api/card/:key' },
        ],
        request: vi.fn(),
      };

      const mockCommands = {
        project: {
          calculationEngine: {
            generate: vi.fn().mockResolvedValue(undefined),
            runQuery: vi.fn().mockResolvedValue([]),
          },
        },
      };

      vi.mocked(createApp).mockReturnValue(mockApp as unknown as Hono);
      vi.mocked(CommandManager.getInstance).mockResolvedValue(
        mockCommands as unknown as CommandManager,
      );
      vi.mocked(cp).mockResolvedValue(undefined);
      vi.mocked(readFile).mockResolvedValue('{"staticMode": false}');
      vi.mocked(writeFile).mockResolvedValue(undefined);
      vi.mocked(mkdir).mockResolvedValue(undefined);

      // Mock app.request to return successful responses
      mockApp.request.mockImplementation((route, options) => {
        if (options?.headers?.get('x-ssg-find') === 'true') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve([]),
          });
        }
        return Promise.resolve({
          ok: true,
          headers: new Map([['content-type', 'text/html']]),
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
        });
      });

      await exportSite('/test/project');

      expect(cp).toHaveBeenCalledWith('./static-frontend', 'static', {
        recursive: true,
      });
      expect(readFile).toHaveBeenCalledWith(
        `static${path.sep}config.json`,
        'utf-8',
      );
      expect(writeFile).toHaveBeenCalledWith(
        `static${path.sep}config.json`,
        '{"staticMode":true}',
      );
    });

    test('should export site with custom directory', async () => {
      const mockApp = {
        routes: [{ method: 'GET', path: '/api/cards' }],
        request: vi.fn().mockResolvedValue({
          ok: true,
          headers: new Map([['content-type', 'text/html']]),
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
        }),
      };

      const mockCommands = {
        project: {
          calculationEngine: {
            generate: vi.fn().mockResolvedValue(undefined),
            runQuery: vi.fn().mockResolvedValue([]),
          },
        },
      };

      vi.mocked(createApp).mockReturnValue(mockApp as unknown as Hono);
      vi.mocked(CommandManager.getInstance).mockResolvedValue(
        mockCommands as unknown as CommandManager,
      );
      vi.mocked(cp).mockResolvedValue(undefined);
      vi.mocked(readFile).mockResolvedValue('{"staticMode": false}');
      vi.mocked(writeFile).mockResolvedValue(undefined);
      vi.mocked(mkdir).mockResolvedValue(undefined);

      await exportSite('/test/project', '/custom/export/dir');

      expect(cp).toHaveBeenCalledWith(
        './static-frontend',
        '/custom/export/dir',
        { recursive: true },
      );
    });

    test('should call progress callback during export', async () => {
      const mockApp = {
        routes: [
          { method: 'GET', path: '/api/cards' },
          { method: 'GET', path: '/api/projects' },
        ],
        request: vi.fn().mockResolvedValue({
          ok: true,
          headers: new Map([['content-type', 'text/html']]),
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
        }),
      };

      const mockCommands = {
        project: {
          calculationEngine: {
            generate: vi.fn().mockResolvedValue(undefined),
            runQuery: vi.fn().mockResolvedValue([]),
          },
        },
      };

      vi.mocked(createApp).mockReturnValue(mockApp as unknown as Hono);
      vi.mocked(CommandManager.getInstance).mockResolvedValue(
        mockCommands as unknown as CommandManager,
      );
      vi.mocked(cp).mockResolvedValue(undefined);
      vi.mocked(readFile).mockResolvedValue('{"staticMode": false}');
      vi.mocked(writeFile).mockResolvedValue(undefined);
      vi.mocked(mkdir).mockResolvedValue(undefined);

      const progressCallback = vi.fn();

      await exportSite('/test/project', 'static', 'info', progressCallback);

      expect(progressCallback).toHaveBeenCalledWith(0, 2);
      expect(progressCallback).toHaveBeenCalledWith(1, 2);
      expect(progressCallback).toHaveBeenCalledWith(2, 2);
    });

    test('should throw error when route export fails', async () => {
      const mockApp = {
        routes: [{ method: 'GET', path: '/api/cards' }],
        request: vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
          json: vi.fn().mockResolvedValue({ error: 'test' }),
        }),
      };

      const mockCommands = {
        project: {
          calculationEngine: {
            generate: vi.fn().mockResolvedValue(undefined),
            runQuery: vi.fn().mockResolvedValue([]),
          },
        },
      };

      vi.mocked(createApp).mockReturnValue(mockApp as unknown as Hono);
      vi.mocked(CommandManager.getInstance).mockResolvedValue(
        mockCommands as unknown as CommandManager,
      );
      vi.mocked(cp).mockResolvedValue(undefined);
      vi.mocked(readFile).mockResolvedValue('{"staticMode": false}');
      vi.mocked(writeFile).mockResolvedValue(undefined);

      await expect(exportSite('/test/project')).rejects.toThrow(
        'Errors:\nFailed to export route /api/cards: test',
      );
    });
  });

  describe('isSSGContext', () => {
    test('should return true when x-ssg header is true', () => {
      const mockContext = {
        req: {
          header: vi.fn().mockReturnValue('true'),
        },
      } as unknown as Context;

      const result = isSSGContext(mockContext);

      expect(result).toBe(true);
      expect(mockContext.req.header).toHaveBeenCalledWith('x-ssg');
    });

    test('should return false when x-ssg header is not true', () => {
      const mockContext = {
        req: {
          header: vi.fn().mockReturnValue('false'),
        },
      } as unknown as Context;

      const result = isSSGContext(mockContext);

      expect(result).toBe(false);
    });

    test('should return false when x-ssg header is missing', () => {
      const mockContext = {
        req: {
          header: vi.fn().mockReturnValue(undefined),
        },
      } as unknown as Context;

      const result = isSSGContext(mockContext);

      expect(result).toBe(false);
    });
  });

  describe('ssgParams', () => {
    test('should return JSON response when x-ssg-find header is true and function provided', async () => {
      const mockContext = {
        req: {
          header: vi.fn().mockReturnValue('true'),
        },
        json: vi.fn().mockReturnValue('json-response'),
      } as unknown as Context;

      const mockFn = vi.fn().mockResolvedValue([{ id: 1 }, { id: 2 }]);
      const middleware = ssgParams(mockFn);

      const result = await middleware(mockContext, vi.fn());

      expect(mockContext.req.header).toHaveBeenCalledWith('x-ssg-find');
      expect(mockFn).toHaveBeenCalledWith(mockContext);
      expect(mockContext.json).toHaveBeenCalledWith([{ id: 1 }, { id: 2 }]);
      expect(result).toBe('json-response');
    });

    test('should return empty array when x-ssg-find header is true but no function provided', async () => {
      const mockContext = {
        req: {
          header: vi.fn().mockReturnValue('true'),
        },
        json: vi.fn().mockReturnValue('empty-json-response'),
      } as unknown as Context;

      const middleware = ssgParams();

      const result = await middleware(mockContext, vi.fn());

      expect(mockContext.json).toHaveBeenCalledWith([]);
      expect(result).toBe('empty-json-response');
    });

    test('should call next when x-ssg-find header is not true', async () => {
      const mockContext = {
        req: {
          header: vi.fn().mockReturnValue('false'),
        },
      } as unknown as Context;

      const mockNext = vi.fn().mockReturnValue('next-response');
      const middleware = ssgParams(vi.fn());

      const result = await middleware(mockContext, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(result).toBe('next-response');
    });

    test('should handle async function errors gracefully', async () => {
      const mockContext = {
        req: {
          header: vi.fn().mockReturnValue('true'),
        },
        json: vi.fn(),
      } as unknown as Context;

      const mockFn = vi.fn().mockRejectedValue(new Error('Function error'));
      const middleware = ssgParams(mockFn);

      await expect(middleware(mockContext, vi.fn())).rejects.toThrow(
        'Function error',
      );
    });
  });
});
