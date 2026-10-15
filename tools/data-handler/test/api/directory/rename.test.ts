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
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { ConfigurationLogger } from '../../../src/infra/replay-log/configuration-logger.js';
import { expectRefused, projects } from '../../domain/cards/fixture.js';
import { openTestWorkspace } from '../../helpers/open-test-workspace.js';
import { renameProject } from '../../../src/api/directory/rename-project.js';
import { Validate } from '../../../src/domain/validation/validate.js';
import { checkoutOf } from '../../../src/infra/internal.js';

const open = projects();

const spec = {
  prefix: 'old',
  cards: [{ title: 'A', children: [{ title: 'B' }] }],
  templates: [{ name: 'tpl', cards: [{}] }],
};
const published = { ...spec, version: '1.2.0' };

const config = (path: string) =>
  JSON.parse(
    readFileSync(join(path, '.cards', 'local', 'cardsConfig.json'), 'utf-8'),
  );
const cardDir = (path: string, key: string) => join(path, 'cardRoot', key);

describe('renameProject', () => {
  it('moves the prefix everywhere and leaves a project that validates', async () => {
    const { ws, path, keys } = await open(spec);
    const [parent, child] = keys;

    await renameProject(ws, 'new');

    const renamed = (key: string) => key.replace(/^old_/, 'new_');
    expect(existsSync(cardDir(path, parent))).toBe(false);
    expect(
      existsSync(
        join(cardDir(path, renamed(parent)), 'c', renamed(child), 'index.json'),
      ),
    ).toBe(true);
    expect(config(path).cardKeyPrefix).toBe('new');
    const reopened = await openTestWorkspace(path);
    expect(
      await Validate.getInstance().validate(path, () => checkoutOf(reopened)),
    ).toBe('');
  });

  it('renames a project that has no cards', async () => {
    const { ws, path } = await open({ prefix: 'old' });

    await renameProject(ws, 'new');

    expect(config(path).cardKeyPrefix).toBe('new');
  });

  it('renames attachments whose file name carries the old prefix', async () => {
    const { ws, path, keys } = await open(spec);
    await ws.cards.addAttachment(keys[0], 'old.png', Buffer.from('img'));

    await renameProject(ws, 'new');

    const attachments = join(
      cardDir(path, keys[0].replace(/^old_/, 'new_')),
      'a',
    );
    expect(existsSync(join(attachments, 'new.png'))).toBe(true);
    expect(existsSync(join(attachments, 'old.png'))).toBe(false);
  });

  it('records no configuration log entry', async () => {
    // The prefix is the project's identity: nothing a consumer can replay.
    const { ws, path } = await open(spec);
    const before = await ConfigurationLogger.entries(path);

    await renameProject(ws, 'new');

    expect(await ConfigurationLogger.entries(path)).toEqual(before);
  });

  it.each([
    ['an invalid prefix', 'new_2', /prefix/i],
    ['an empty prefix', '', /empty 'to' is not allowed/],
  ])('refuses %s and changes nothing', async (_name, to, error) => {
    const { ws, path } = await open(spec);

    await expectRefused(path, () => renameProject(ws, to), error);
  });

  it('refuses once a version is published and moves nothing', async () => {
    const { ws, path } = await open(published);

    await expectRefused(
      path,
      () => renameProject(ws, 'new'),
      /version 1\.2\.0\b.*'cyberismo rename new --force'/s,
    );
  });

  it('with force renames a published project, keeping its version and log', async () => {
    const { ws, path, keys } = await open(published);
    const before = await ConfigurationLogger.entries(path);

    await renameProject(ws, 'new', { force: true });

    expect(existsSync(cardDir(path, keys[0].replace(/^old_/, 'new_')))).toBe(
      true,
    );
    expect(config(path)).toMatchObject({
      cardKeyPrefix: 'new',
      version: '1.2.0',
    });
    expect(await ConfigurationLogger.entries(path)).toEqual(before);
  });
});
