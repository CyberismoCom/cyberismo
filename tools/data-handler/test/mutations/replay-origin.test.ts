import { describe, it, expect, vi, afterEach } from 'vitest';
import { ResourceMutations } from '../../src/mutations/resource-mutations.js';
import { dispatch } from '../../src/mutations/dispatcher.js';
import type { MutationInput } from '../../src/mutations/types.js';
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
    // Dispatches to the plain handler, whose cascade is empty: the
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

  it('calls applyCascade only on a migratable rename, and never logs', async () => {
    const input: MutationInput = {
      kind: 'rename',
      target: resourceName('test/workflows/flow'),
      newIdentifier: 'renamedFlow',
    };
    const stubProject = {
      lock: { write: (fn: () => Promise<void>) => fn() },
      basePath: '/unused',
    } as unknown as Project;
    // Spy on the registry's own handler singleton, so the mutation below runs
    // through these spies rather than through a stand-in route.
    const { handler, classification } = dispatch({
      project: stubProject,
      input,
    });
    expect(classification).toBe('migratable');
    const apply = vi.spyOn(handler, 'apply').mockResolvedValue(undefined);
    const applyCascade = vi
      .spyOn(handler, 'applyCascade')
      .mockResolvedValue(undefined);
    const logSpy = vi.spyOn(ConfigurationLogger, 'log');

    await new ResourceMutations(stubProject).apply(input, {
      kind: 'replay',
      modulePrefix: 'test',
    });

    expect(applyCascade).toHaveBeenCalledTimes(1);
    expect(apply).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
  });
});
