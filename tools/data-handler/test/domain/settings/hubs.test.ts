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

import { execFile } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

import { expectRefused, projects, readJson } from '../resources/fixture.js';

const open = projects();

type Opened = Awaited<ReturnType<typeof open>>;
const hubA = 'https://a.example.com/hub/';
const hubB = 'https://b.example.com/hub/';

const configured = (path: string) =>
  (
    readJson(join(path, '.cards', 'local', 'cardsConfig.json')).hubs as {
      location: string;
    }[]
  ).map((hub) => hub.location);
const moduleOf = (name: string) => ({
  name,
  location: `https://x/${name}.git`,
});
// Writes the module list a fetch would have cached.
function cache(path: string, hubs: Record<string, string[]>) {
  const cached = Object.entries(hubs).map(([location, names]) => ({
    location,
    version: 1,
    modules: names.map(moduleOf),
  }));
  mkdirSync(join(path, '.temp'), { recursive: true });
  writeFileSync(
    join(path, '.temp', 'moduleList.json'),
    JSON.stringify({
      modules: cached.flatMap((hub) => hub.modules),
      hubs: cached,
    }),
  );
}
const cachedModules = (path: string) =>
  (
    readJson(join(path, '.temp', 'moduleList.json')).modules as {
      name: string;
    }[]
  ).map((module) => module.name);
const hubs = (ws: Opened['ws']) => ws.modules.hubs();

describe('adding a hub', () => {
  // Resolving moduleList.json against a location without the closing slash
  // would drop its last segment, so locations are kept as directory URLs.
  it.each([
    ['a plain URL', 'https://h.example.com/m', 'https://h.example.com/m/'],
    [
      'a URL that ends in a slash',
      'https://h.example.com/m/',
      'https://h.example.com/m/',
    ],
    [
      'whitespace around it',
      '  https://h.example.com/m  ',
      'https://h.example.com/m/',
    ],
    [
      'the URL of its module list',
      'https://h.example.com/m/moduleList.json',
      'https://h.example.com/m/',
    ],
    [
      'a run of closing slashes',
      'https://h.example.com/m///',
      'https://h.example.com/m/',
    ],
    [
      'a slash after the module list',
      'https://h.example.com/m/moduleList.json/',
      'https://h.example.com/m/',
    ],
    // Only a whole segment names the module list; this one is a directory.
    [
      'a segment that merely ends in its name',
      'https://h.example.com/m/foo-moduleList.json',
      'https://h.example.com/m/foo-moduleList.json/',
    ],
    ['a host and port', 'http://localhost:8080', 'http://localhost:8080/'],
  ])('stores %s as a directory URL', async (_name, location, stored) => {
    const { ws, path } = await open({});

    await ws.settings.hubs.add(location);

    expect(configured(path)).toEqual([stored]);
    expect(await hubs(ws)).toEqual([{ location: stored }]);
  });

  describe('refusals leave the project as it was', () => {
    it.each([
      ['an empty location', '', /Cannot add empty hub/],
      ['a blank location', '   ', /Cannot add empty hub/],
      ['text that is no URL', 'not a url', /Invalid hub URL/],
      ['a bare scheme', 'https://', /Invalid hub URL/],
      ['a bare http scheme', 'http://', /Invalid hub URL/],
      ['a path only', '/hub/', /Invalid hub URL/],
      [
        'a protocol other than HTTP',
        'ftp://h.example.com/',
        /Only HTTP and HTTPS/,
      ],
      ['a hub that is there already', hubA, /already exists as a hub/],
      [
        'a hub there under another spelling',
        'https://a.example.com/hub/moduleList.json',
        /already exists as a hub/,
      ],
      [
        'a hub there without the slash',
        'https://a.example.com/hub',
        /Hub 'https:\/\/a.example.com\/hub\/' already exists as a hub/,
      ],
    ])('when it is %s', async (_name, location, error) => {
      const { ws, path } = await open({ hubs: [{ location: hubA }] });

      await expectRefused(path, () => ws.settings.hubs.add(location), error);
    });
  });

  it('takes a hub stored by hand without the slash for the same hub', async () => {
    const { ws, path } = await open({
      hubs: [{ location: 'https://old.example.com/hub' }],
    });

    await expectRefused(
      path,
      () => ws.settings.hubs.add('https://old.example.com/hub'),
      /already exists as a hub/,
    );
  });

  it('is one commit under autocommit', async () => {
    const { ws, path } = await open({ git: true }, { autocommit: true });

    await ws.settings.hubs.add(hubA);

    expect(
      (
        await promisify(execFile)('git', ['log', '-1', '--format=%s'], {
          cwd: path,
        })
      ).stdout.trim(),
    ).toBe(`Add hub ${hubA}`);
  });
});

describe('removing a hub', () => {
  it('is one commit under autocommit', async () => {
    const { ws, path } = await open(
      { git: true, hubs: [{ location: hubA }] },
      { autocommit: true },
    );

    await ws.settings.hubs.remove(hubA);

    expect(
      (
        await promisify(execFile)('git', ['log', '-1', '--format=%s'], {
          cwd: path,
        })
      ).stdout.trim(),
    ).toBe(`Remove hub ${hubA}`);
  });

  it.each([
    ['its stored location', hubA],
    ['its location without the slash', 'https://a.example.com/hub'],
  ])('by %s', async (_name, name) => {
    const { ws, path } = await open({
      hubs: [{ location: hubA }, { location: hubB }],
    });

    await ws.settings.hubs.remove(name);

    expect(configured(path)).toEqual([hubB]);
  });

  it('removes a hub that was stored by hand without the slash, by either spelling', async () => {
    const { ws, path } = await open({
      hubs: [{ location: 'https://old.example.com/hub' }],
    });

    await ws.settings.hubs.remove('https://old.example.com/hub/');

    expect(configured(path)).toEqual([]);
  });

  it('refuses a hub the project does not have, changing nothing', async () => {
    const { ws, path } = await open({ hubs: [{ location: hubA }] });

    await expectRefused(
      path,
      () => ws.settings.hubs.remove(hubB),
      /not part of the project/,
    );
  });

  it('stops offering the modules only that hub offered', async () => {
    const { ws, path } = await open({
      hubs: [{ location: hubA }, { location: hubB }],
    });
    cache(path, { [hubA]: ['one', 'shared'], [hubB]: ['two', 'shared'] });

    await ws.settings.hubs.remove(hubA);

    expect(cachedModules(path)).toEqual(['two', 'shared']);
    expect(
      (
        readJson(join(path, '.temp', 'moduleList.json')).hubs as {
          location: string;
        }[]
      ).map((hub) => hub.location),
    ).toEqual([hubB]);
  });

  it('works when no module list has been cached', async () => {
    const { ws, path } = await open({ hubs: [{ location: hubA }] });

    await ws.settings.hubs.remove(hubA);

    expect(configured(path)).toEqual([]);
  });
});

describe('showing the hubs with their modules', () => {
  it('gives each hub the modules cached for it, with its configured name first', async () => {
    const { ws, path } = await open({
      hubs: [{ location: hubA, displayName: 'Mine' }, { location: hubB }],
    });
    mkdirSync(join(path, '.temp'), { recursive: true });
    writeFileSync(
      join(path, '.temp', 'moduleList.json'),
      JSON.stringify({
        modules: [],
        hubs: [
          {
            location: hubA,
            version: 1,
            displayName: 'Theirs',
            modules: [moduleOf('one')],
          },
          {
            location: hubB,
            version: 1,
            displayName: 'Other',
            description: 'About',
            modules: [],
          },
        ],
      }),
    );

    expect(await ws.modules.hubDetails()).toEqual([
      {
        location: hubA,
        displayName: 'Mine',
        description: undefined,
        modules: [moduleOf('one')],
      },
      {
        location: hubB,
        displayName: 'Other',
        description: 'About',
        modules: [],
      },
    ]);
  });

  it('gives the hubs without modules when nothing is cached', async () => {
    const { ws } = await open({ hubs: [{ location: hubA }] });

    expect(await ws.modules.hubDetails()).toEqual([
      {
        location: hubA,
        displayName: undefined,
        description: undefined,
        modules: [],
      },
    ]);
  });
});
