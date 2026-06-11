import { describe, it, expect, vi, afterEach } from 'vitest';
import { ResourceMutations } from '../../src/mutations/resource-mutations.js';
import { _registerHandlerForTest } from '../../src/mutations/dispatcher.js';
import type { MutationContext } from '../../src/mutations/handler.js';
import { ConfigurationLogger } from '../../src/utils/configuration-logger.js';
import { resourceName } from '../../src/utils/resource-utils.js';
import type { Project } from '../../src/containers/project.js';

describe('ResourceMutations replay origin', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('replays a displayName edit as a no-op cascade without logging', async () => {
    const logSpy = vi.spyOn(ConfigurationLogger, 'log');
    const stubProject = {
      lock: { write: (fn: () => Promise<void>) => fn() },
    } as unknown as Project;
    const mutations = new ResourceMutations(stubProject);
    // Dispatches to DefaultNoCascadeHandler, whose cascade is empty: the
    // replay path must resolve without touching the project or the log.
    await expect(
      mutations.apply(
        {
          kind: 'edit',
          target: resourceName('test/cardTypes/page'),
          updateKey: { key: 'displayName' },
          operation: { name: 'change', target: 'a', to: 'b' },
        },
        { kind: 'replay', modulePrefix: 'test' },
      ),
    ).resolves.toBeUndefined();
    expect(logSpy).not.toHaveBeenCalled();
  });

  describe('with a replay-capable stub handler', () => {

    it('calls applyCascade only and never writes a log entry', async () => {
      const handler = {
        matches: (ctx: MutationContext) =>
          ctx.input.kind === 'edit' &&
          ctx.input.updateKey.key === 'replayProbe',
        isBreaking: true,
        apply: vi.fn(),
        applyCascade: vi.fn(),
      };
      const unregister = _registerHandlerForTest(handler);
      const logSpy = vi.spyOn(ConfigurationLogger, 'log');
      try {
        const stubProject = {
          lock: { write: (fn: () => Promise<void>) => fn() },
          basePath: '/unused',
        } as unknown as Project;
        const mutations = new ResourceMutations(stubProject);
        await mutations.apply(
          {
            kind: 'edit',
            target: resourceName('test/cardTypes/page'),
            updateKey: { key: 'replayProbe' },
            operation: { name: 'change', target: 'a', to: 'b' },
          },
          { kind: 'replay', modulePrefix: 'test' },
        );
        expect(handler.applyCascade).toHaveBeenCalledTimes(1);
        expect(handler.apply).not.toHaveBeenCalled();
        expect(logSpy).not.toHaveBeenCalled();
      } finally {
        unregister();
      }
    });
  });
});
