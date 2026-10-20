/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { GitSourceLayer } from '../../../src/infra/modules/source-git.js';

const clone = vi.hoisted(() => vi.fn());
vi.mock('simple-git', () => ({ simpleGit: () => ({ clone }) }));

const destination = mkdtempSync(join(tmpdir(), 'cyberismo-git-clone-'));
afterAll(() => rmSync(destination, { recursive: true, force: true }));

const fetchAt = (ref?: string) =>
  new GitSourceLayer().fetch(
    {
      location: 'https://hub.test/x.git',
      remoteUrl: 'https://hub.test/x.git',
      ref,
    },
    destination,
    'x',
  );

describe('git source layer cloning', () => {
  it.each([
    [undefined, ['--depth', '1']],
    ['v1.2.0', ['--depth', '1', '--branch', 'v1.2.0']],
  ])('clones a ref of %s with the options %j', async (ref, options) => {
    clone.mockResolvedValue(undefined);

    await fetchAt(ref);

    expect(clone).toHaveBeenLastCalledWith(
      'https://hub.test/x.git',
      expect.stringContaining('x'),
      options,
    );
  });

  it('serves versions', () => {
    expect(new GitSourceLayer().supportsVersioning()).toBe(true);
  });
});
