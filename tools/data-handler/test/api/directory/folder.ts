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

import { mkdtemp, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach } from 'vitest';

import {
  buildProject,
  type ProjectSpec,
} from '../../helpers/project-builder.js';

// Call once per file: a folder holding a project per spec, each under its
// prefix; every folder is removed after each test.
export function folders() {
  const created: string[] = [];
  afterEach(async () => {
    for (const path of created.splice(0)) {
      await rm(path, { recursive: true, force: true, maxRetries: 5 });
    }
  });
  return async (...specs: (ProjectSpec & { prefix: string })[]) => {
    const root = await mkdtemp(join(tmpdir(), 'cyberismo-folder-'));
    created.push(root);
    const keys: Record<string, string[]> = {};
    for (const spec of specs) {
      const built = await buildProject(spec);
      await rename(built.path, join(root, spec.prefix));
      keys[spec.prefix] = built.keys;
    }
    return { root, keys };
  };
}
