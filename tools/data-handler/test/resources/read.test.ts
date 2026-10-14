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

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { ResourceName } from '@cyberismo/model';
import { ResourceNotFoundError } from '../../src/exceptions/index.js';
import { openTestWorkspace } from '../helpers/open-test-workspace.js';
import {
  edit,
  local,
  newParams,
  projects,
  resourceTypes,
  spec,
} from './fixture.js';

const open = projects();

const named = (type: string, identifier: string): ResourceName => ({
  prefix: 'test',
  type,
  identifier,
});

describe('resources.show', () => {
  it('shows the metadata of a file resource', async () => {
    const { ws } = await open(spec);

    expect(await ws.resources.show('test/linkTypes/rel')).toEqual({
      name: 'test/linkTypes/rel',
      displayName: 'rel',
      outboundDisplayName: 'rel out',
      inboundDisplayName: 'rel in',
      sourceCardTypes: ['test/cardTypes/page'],
      destinationCardTypes: [],
      destinationConnectors: undefined,
      enableLinkDescription: false,
    });
  });

  it('shows a folder resource with its content files', async () => {
    const { ws } = await open(spec);

    expect(await ws.resources.show('test/calculations/calc')).toMatchObject({
      name: 'test/calculations/calc',
      content: { calculation: 'fact(1).\n' },
    });
  });

  it('shows a template with the number of its cards and where it is', async () => {
    const { ws, path } = await open(spec);

    expect(await ws.resources.show('test/templates/tpl')).toEqual({
      name: 'test/templates/tpl',
      displayName: 'tpl',
      description: undefined,
      category: undefined,
      path: local(path, 'templates', 'tpl.json'),
      numberOfCards: 1,
    });
  });

  it('shows the resources of a module', async () => {
    const { ws } = await open(spec);

    expect(await ws.resources.show('mod/workflows/mflow')).toMatchObject({
      name: 'mod/workflows/mflow',
    });
  });

  it('refuses a resource that is not there', async () => {
    const { ws } = await open(spec);

    await expect(
      ws.resources.show('test/workflows/missing'),
    ).rejects.toBeInstanceOf(ResourceNotFoundError);
  });
});

describe('resources.validate', () => {
  it.each(resourceTypes)('finds a new %s resource valid', async (type) => {
    const { ws } = await open(spec);
    await ws.resources.create('x', type, newParams[type]);

    expect(await ws.resources.validate(named(type, 'x'))).toBe('');
  });

  it.each([
    {
      why: 'a calculation holds an invalid logic program',
      resource: named('calculations', 'bad'),
      project: { calculations: { ...spec.calculations, bad: 'result(' } },
      error: /Invalid logic program for 'test\/calculations\/bad'/,
    },
    {
      why: 'a workflow has two transitions that create a card',
      resource: named('workflows', 'bad'),
      project: {
        workflows: [
          ...spec.workflows,
          {
            name: 'bad',
            transitions: [
              { name: 'Create', fromState: [], toState: 'Open' },
              { name: 'Again', fromState: [], toState: 'Open' },
            ],
          },
        ],
      },
      error: /exactly one transition/,
    },
  ])('reports it when $why', async ({ resource, project, error }) => {
    const { ws } = await open({ ...spec, ...project });

    expect(await ws.resources.validate(resource)).toMatch(error);
  });

  it('reports a report whose parameter schema is not a schema', async () => {
    const { ws } = await open(spec);
    await ws.resources.create('x', 'reports', {});
    await edit(
      ws,
      'test/reports/x',
      { key: 'content', subKey: 'schema' },
      { name: 'change', to: { type: 5 } },
    );

    expect(await ws.resources.validate(named('reports', 'x'))).toMatch(
      /Invalid parameter schema/,
    );
  });
});

describe('listing resources', () => {
  it.each(resourceTypes)(
    'lists the %s resources of the project and its modules by name',
    async (type) => {
      const { ws } = await open(spec);
      await ws.resources.create('x', type, newParams[type]);

      const names = await ws.resources.list(type);

      expect(names).toContain(`test/${type}/x`);
      expect(names).toEqual([...names].sort());
      expect(names.every((name) => name.split('/')[1] === type)).toBe(true);
    },
  );

  it('lists the module resources too', async () => {
    const { ws } = await open(spec);

    expect(await ws.resources.list('workflows')).toEqual([
      'mod/workflows/mflow',
      'test/workflows/flow',
      'test/workflows/other',
    ]);
  });

  it('lists nothing for a type that is not one', async () => {
    const { ws } = await open(spec);

    expect(await ws.resources.list('colours')).toEqual([]);
  });

  it('gives card types, workflows and templates with their details', async () => {
    const { ws } = await open(spec);

    expect(
      (await ws.resources.contents('cardTypes')).map((item) => item.name),
    ).toEqual(
      expect.arrayContaining(['test/cardTypes/page', 'test/cardTypes/bare']),
    );
    expect(
      (await ws.resources.contents('workflows')).map(
        (item) => item.states.length,
      ),
    ).toEqual([3, 3, 3]);
    expect(await ws.resources.contents('templates')).toEqual([
      expect.objectContaining({ name: 'test/templates/tpl', numberOfCards: 1 }),
    ]);
  });

  // A template's name does not come from its file.
  it.each([
    {
      type: 'cardTypes',
      names: ['test/cardTypes/bare', 'test/cardTypes/page'],
    },
    { type: 'templates', names: ['test/templates/tpl', 'test/templates/zzz'] },
  ] as const)(
    'gives the $type it can name when a file cannot be read',
    async ({ type, names }) => {
      const { path } = await open(spec);
      writeFileSync(local(path, type, 'zzz.json'), '{ broken');
      const ws = await openTestWorkspace(path);
      try {
        const contents = await ws.resources.contents(type);

        expect(contents.map((item) => item.name).sort()).toEqual(names);
      } finally {
        ws.checkout.dispose();
      }
    },
  );
});

describe('the modules the hubs offer', () => {
  const offered = ['mod', 'fresh'].map((name) => ({
    name,
    location: `https://x/${name}.git`,
    displayName: name,
    documentationLocation: '',
  }));

  it.each([
    { options: [], expected: ['fresh'] },
    { options: [true], expected: ['mod', 'fresh'] },
    { options: [false, true], expected: [offered[1]] },
    { options: [true, true], expected: offered },
  ])('shows $expected for $options', async ({ options, expected }) => {
    const { ws, path } = await open(spec);
    mkdirSync(join(path, '.temp'), { recursive: true });
    writeFileSync(
      join(path, '.temp', 'moduleList.json'),
      JSON.stringify({ modules: offered, hubs: [] }),
    );

    expect(await ws.modules.importable(...options)).toEqual(expected);
  });

  it('shows none when no module list has been cached', async () => {
    const { ws } = await open(spec);

    expect(await ws.modules.importable(true)).toEqual([]);
  });
});

describe('rendering a skill that is not enabled', () => {
  it('renders the given content for a card, whatever the stored content is', async () => {
    const { ws, keys } = await open(spec);
    await ws.resources.create('k', 'skills', {});

    expect(
      await ws.resources.skillPreview('test/skills/k', {
        cardKey: keys[0],
        skillContent: 'Card {{cardKey}}.',
      }),
    ).toBe(`Card ${keys[0]}.`);
  });

  it('refuses a card that does not exist', async () => {
    const { ws } = await open(spec);
    await ws.resources.create('k', 'skills', {});

    await expect(
      ws.resources.skillPreview('test/skills/k', { cardKey: 'test_nope1234' }),
    ).rejects.toThrow(/test_nope1234/);
  });
});
