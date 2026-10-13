import { describe, expect, it, vi } from 'vitest';
import { ProjectRegistry } from '../src/project-registry.js';
import type { Workspace } from '@cyberismo/data-handler';

function fakeCommands(prefix: string): Workspace {
  const dispose = vi.fn();
  return {
    checkout: {
      basePath: `/tmp/${prefix}`,
      configuration: { cardKeyPrefix: prefix, name: prefix },
      dispose,
    },
  } as unknown as Workspace;
}

describe('ProjectRegistry.replace', () => {
  it('disposes old entries and installs the new ones', async () => {
    const oldCmd = fakeCommands('old');
    const registry = new ProjectRegistry([
      { prefix: 'old', checkout: oldCmd.checkout },
    ]);

    const newCmd = fakeCommands('new');
    await registry.replace([{ prefix: 'new', checkout: newCmd.checkout }]);

    expect(oldCmd.checkout.dispose).toHaveBeenCalledOnce();
    expect(registry.get('old')).toBeUndefined();
    expect(registry.get('new')).toBe(newCmd.checkout);
  });

  it('handles replace with empty array', async () => {
    const oldCmd = fakeCommands('old');
    const registry = new ProjectRegistry([
      { prefix: 'old', checkout: oldCmd.checkout },
    ]);
    await registry.replace([]);
    expect(oldCmd.checkout.dispose).toHaveBeenCalledOnce();
    expect(registry.list()).toEqual([]);
  });
});
