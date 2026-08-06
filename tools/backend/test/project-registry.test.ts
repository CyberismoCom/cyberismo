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
import { describe, expect, it, vi } from 'vitest';
import type * as Modules from '@cyberismo/data-handler';

vi.mock('@cyberismo/data-handler', async (importOriginal) => {
  const actual = await importOriginal<typeof Modules>();
  return {
    ...actual,
    CommandManager: vi.fn().mockImplementation(function (
      this: unknown,
      path: string,
    ) {
      return {
        initialize: vi.fn().mockImplementation(async () => {
          if (path === '/bad/project') {
            throw new Error('cardRoot not found');
          }
        }),
        project: { configuration: { cardKeyPrefix: 'x', name: 'x' } },
      };
    }),
  };
});

import { ProjectRegistry } from '../src/project-registry.js';

describe('ProjectRegistry.fromScannedProjects', () => {
  it('attributes an initialize() failure to the failing project', async () => {
    await expect(
      ProjectRegistry.fromScannedProjects([
        { path: '/good/project', prefix: 'good', name: 'Good' },
        { path: '/bad/project', prefix: 'bad', name: 'Bad' },
      ]),
    ).rejects.toThrow(
      "Failed to initialize project 'bad' at '/bad/project': cardRoot not found",
    );
  });

  it('succeeds when every project initializes cleanly', async () => {
    const registry = await ProjectRegistry.fromScannedProjects([
      { path: '/good/project', prefix: 'good', name: 'Good' },
    ]);
    expect(registry.has('good')).toBe(true);
  });
});
