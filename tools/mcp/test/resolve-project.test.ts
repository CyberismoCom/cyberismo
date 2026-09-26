/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026

  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.

  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { describe, expect, test } from 'vitest';
import type { CommandManager } from '@cyberismo/data-handler';
import {
  resolveCommands,
  type ProjectProvider,
} from '../src/lib/resolve-project.js';

// Minimal mock that satisfies the CommandManager shape enough for resolution
const mockCommands = (prefix: string) =>
  ({
    _prefix: prefix,
  }) as unknown as CommandManager;

function makeProvider(
  projects: { prefix: string; name: string }[],
): ProjectProvider {
  const map = new Map(projects.map((p) => [p.prefix, mockCommands(p.prefix)]));
  return {
    get: (prefix: string) => map.get(prefix),
    list: () => projects,
  };
}

describe('resolveCommands', () => {
  test('returns commands for a valid prefix', async () => {
    const provider = makeProvider([{ prefix: 'abc', name: 'Project ABC' }]);
    const result = await resolveCommands(provider, 'abc');
    expect(result).toBeDefined();
    expect((result as unknown as { _prefix: string })._prefix).toBe('abc');
  });

  test('throws for unknown prefix with available projects listed', async () => {
    const provider = makeProvider([
      { prefix: 'abc', name: 'Project ABC' },
      { prefix: 'xyz', name: 'Project XYZ' },
    ]);
    await expect(resolveCommands(provider, 'nope')).rejects.toThrow(
      /Unknown project 'nope'/,
    );
    await expect(resolveCommands(provider, 'nope')).rejects.toThrow(/abc, xyz/);
  });

  test('throws for unknown prefix when no projects available', async () => {
    const provider = makeProvider([]);
    await expect(resolveCommands(provider, 'anything')).rejects.toThrow(
      /No projects available/,
    );
  });

  test('resolves correct project among multiple', async () => {
    const provider = makeProvider([
      { prefix: 'alpha', name: 'Alpha' },
      { prefix: 'beta', name: 'Beta' },
    ]);
    const result = await resolveCommands(provider, 'beta');
    expect((result as unknown as { _prefix: string })._prefix).toBe('beta');
  });
});
