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

import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SCHEMA_VERSION } from '@cyberismo/migrations';
import { Validate } from '../../src/commands/validate.js';
import { Checkout } from '../../src/containers/project.js';
import { createProject } from '../../src/directory/create-project.js';

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'cyberismo-create-'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const config = (path: string) =>
  JSON.parse(
    readFileSync(join(path, '.cards', 'local', 'cardsConfig.json'), 'utf-8'),
  );

describe('createProject', () => {
  it('writes a valid project with the given values, and no repository', async () => {
    const path = join(root, 'new');

    await createProject(path, {
      name: 'New Project',
      prefix: 'newp',
      category: 'Development',
      description: 'A new project',
    });

    expect(config(path)).toEqual({
      schemaVersion: SCHEMA_VERSION,
      cardKeyPrefix: 'newp',
      name: 'New Project',
      category: 'Development',
      description: 'A new project',
      modules: [],
      hubs: [],
    });
    expect(existsSync(join(path, 'cardRoot'))).toBe(true);
    expect(existsSync(join(path, '.git'))).toBe(false);
    expect(
      await Validate.getInstance().validate(path, () => new Checkout(path)),
    ).toBe('');
  });

  it('leaves out the category and description it is not given', async () => {
    const path = join(root, 'new');

    await createProject(path, { name: 'New Project', prefix: 'newp' });

    expect(config(path)).not.toHaveProperty('category');
    expect(config(path).description).toBe('');
  });

  it.each([
    ['a missing prefix', 'new', { name: 'New', prefix: '' }, 'prefix must be'],
    [
      'a prefix too long',
      'new',
      { name: 'New', prefix: 'abcdefghijk' },
      'prefix must be',
    ],
    [
      'an uppercase prefix',
      'new',
      { name: 'New', prefix: 'Test' },
      'invalid prefix',
    ],
    [
      'an invalid name',
      'new',
      { name: 'New!', prefix: 'newp' },
      'invalid project name',
    ],
    [
      'a forbidden folder name',
      'lpt1',
      { name: 'New', prefix: 'newp' },
      'is invalid',
    ],
  ])('refuses %s, writing nothing', async (_, folder, params, message) => {
    const path = join(root, folder);

    await expect(createProject(path, params)).rejects.toThrow(message);
    expect(existsSync(path)).toBe(false);
  });

  it('refuses a path that holds a project', async () => {
    const path = join(root, 'new');
    await createProject(path, { name: 'New', prefix: 'newp' });

    await expect(
      createProject(path, { name: 'Other', prefix: 'other' }),
    ).rejects.toThrow('Project already exists');
    expect(config(path).name).toBe('New');
  });
});
