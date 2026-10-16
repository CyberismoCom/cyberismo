// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

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
