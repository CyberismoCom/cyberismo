import { describe, it, expect } from 'vitest';
import { ResourceMutations } from '../../src/mutations/resource-mutations.js';
import { resourceName } from '../../src/utils/resource-utils.js';
import type { Project } from '../../src/containers/project.js';

// The pipeline must refuse replay for handlers that have not implemented
// applyCascade yet (transitional state during Phase 1). Phase 1's final
// task flips this test to assert replay succeeds.
describe('ResourceMutations replay origin', () => {
  it('throws for a handler without applyCascade', async () => {
    const stubProject = {
      lock: { write: (fn: () => Promise<void>) => fn() },
    } as unknown as Project;
    const mutations = new ResourceMutations(stubProject);
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
    ).rejects.toThrow(/not replay-capable/);
  });
});
