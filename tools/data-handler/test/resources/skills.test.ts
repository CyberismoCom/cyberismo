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

import { expect, it } from 'vitest';

import { ResourceNotFoundError } from '../../src/shared/exceptions/index.js';
import { edit, projects, remove, spec } from './fixture.js';

const open = projects();

const skill = 'test/skills/guide';

// A skill is listed once a calculation enables it, and follows its edits.
const enabledSkill = async () => {
  const opened = await open(spec);
  const { ws } = opened;
  await ws.resources.create('guide', 'skills', {});
  await ws.resources.create('on', 'calculations', {});
  await edit(
    ws,
    'test/calculations/on',
    { key: 'content', subKey: 'calculation' },
    { name: 'change', to: `enableSkill("${skill}").\n` },
  );
  return opened;
};

it('does not list a created skill until a calculation enables it', async () => {
  const { ws } = await open(spec);
  await ws.resources.create('guide', 'skills', {});
  await ws.resources.create('on', 'calculations', {});

  expect(await ws.resources.skills()).toEqual([]);
  expect(await ws.resources.skill(skill)).toEqual({ status: 'not-enabled' });
});

it('lists an enabled skill by category', async () => {
  const { ws } = await enabledSkill();
  await edit(ws, skill, 'category', { name: 'change', to: 'help' });

  expect(await ws.resources.skills({ category: 'help' })).toEqual([
    expect.objectContaining({ name: skill, scope: 'global' }),
  ]);
  expect(await ws.resources.skills({ category: 'other' })).toEqual([]);
});

it('renders an enabled skill for a card', async () => {
  const { ws, keys } = await enabledSkill();
  await edit(
    ws,
    skill,
    { key: 'content', subKey: 'skillContent' },
    { name: 'change', to: 'Be kind to {{cardKey}}.' },
  );

  expect(await ws.resources.skill(skill, { cardKey: keys[0] })).toMatchObject({
    status: 'ok',
    skill: { name: skill, instructions: `Be kind to ${keys[0]}.` },
  });
});

it('reports a removed skill as not found', async () => {
  const { ws } = await enabledSkill();

  await remove(ws, skill);

  expect(await ws.resources.skill(skill)).toEqual({ status: 'not-found' });
});

// Pins today's behaviour: a calculation that still enables the removed skill
// makes the listing fail.
it('fails to list skills while a calculation enables a removed skill', async () => {
  const { ws } = await enabledSkill();

  await remove(ws, skill);

  await expect(ws.resources.skills()).rejects.toBeInstanceOf(
    ResourceNotFoundError,
  );
});
