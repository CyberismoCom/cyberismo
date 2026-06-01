import { describe, expect, it, vi } from 'vitest';
import { ProjectRegistry, type ProjectRegistryEntry } from '../src/project-registry.js';
import type { CommandManager } from '@cyberismo/data-handler';

function fakeCommands(prefix: string): CommandManager {
  const dispose = vi.fn();
  return {
    project: {
      basePath: `/tmp/${prefix}`,
      configuration: { cardKeyPrefix: prefix, name: prefix },
      dispose,
    },
  } as unknown as CommandManager;
}

describe('ProjectRegistry.replace', () => {
  it('disposes old entries and installs the new ones', async () => {
    const oldCmd = fakeCommands('old');
    const registry = new ProjectRegistry([{ prefix: 'old', commands: oldCmd }]);

    const newCmd = fakeCommands('new');
    await registry.replace([{ prefix: 'new', commands: newCmd }]);

    expect(oldCmd.project.dispose).toHaveBeenCalledOnce();
    expect(registry.get('old')).toBeUndefined();
    expect(registry.get('new')).toBe(newCmd);
  });

  it('handles replace with empty array', async () => {
    const oldCmd = fakeCommands('old');
    const registry = new ProjectRegistry([{ prefix: 'old', commands: oldCmd }]);
    await registry.replace([]);
    expect(oldCmd.project.dispose).toHaveBeenCalledOnce();
    expect(registry.list()).toEqual([]);
  });
});
