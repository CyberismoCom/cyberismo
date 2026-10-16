// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { projects } from '../cards/fixture.js';

// The hubs of the test, by the URL of their module list; an Error is a hub
// that cannot be reached. Every request is counted.
const served = vi.hoisted(() => ({
  hubs: new Map<string, { version: number; modules: string[] } | Error>(),
  requests: [] as string[],
}));
vi.mock('../../../src/shared/utils/egress.js', () => ({
  egressFetch: async (url: string) => {
    served.requests.push(url);
    const hub = served.hubs.get(url);
    if (hub instanceof Error) throw hub;
    if (!hub) return new Response('', { status: 404 });
    return Response.json({
      version: hub.version,
      displayName: `Hub ${url}`,
      description: 'A hub',
      modules: hub.modules.map((name) => ({
        name,
        location: `https://modules.test/${name}.git`,
      })),
    });
  },
}));

const open = projects();
const A = 'https://hub.test/a/';
const B = 'https://hub.test/b/';
const listOf = (hub: string) => `${hub}moduleList.json`;
const spec = { hubs: [{ location: A }, { location: B }] };

beforeEach(() => {
  served.hubs.clear();
  served.requests.length = 0;
});

describe('modules.fetchHubs', () => {
  it('caches what each hub offers, the first hub winning a name both offer', async () => {
    const { ws } = await open(spec);
    served.hubs.set(listOf(A), { version: 1, modules: ['base', 'shared'] });
    served.hubs.set(listOf(B), { version: 1, modules: ['shared', 'extra'] });

    expect(await ws.modules.fetchHubs()).toEqual([]);

    expect(await ws.modules.importable()).toEqual(['base', 'shared', 'extra']);
    expect(
      (await ws.modules.hubDetails()).map((hub) =>
        hub.modules.map((module) => module.name),
      ),
    ).toEqual([
      ['base', 'shared'],
      ['shared', 'extra'],
    ]);
  });

  it('reports the hubs it could not read, in configuration order, and caches the others', async () => {
    const { ws } = await open({
      hubs: [{ location: A }, { location: B }, { location: 'https://c.test/' }],
    });
    served.hubs.set(listOf(A), new Error('network down'));
    served.hubs.set(listOf(B), { version: 1, modules: ['base'] });

    const failures = await ws.modules.fetchHubs();

    expect(failures.map((failure) => failure.location)).toEqual([
      A,
      'https://c.test/',
    ]);
    expect(failures[0].message).toContain('network down');
    expect(await ws.modules.importable()).toEqual(['base']);
  });

  it('keeps what a hub offered when a later fetch of it fails', async () => {
    const { ws } = await open(spec);
    served.hubs.set(listOf(A), { version: 1, modules: ['base'] });
    await ws.modules.fetchHubs();
    served.hubs.set(listOf(A), new Error('network down'));

    const failures = await ws.modules.fetchHubs(true);

    expect(failures).toHaveLength(2);
    expect(await ws.modules.importable()).toEqual(['base']);
  });

  it('takes a hub again only when its version is newer, or when forced', async () => {
    const { ws } = await open({ hubs: [{ location: A }] });
    served.hubs.set(listOf(A), { version: 1, modules: ['old'] });
    await ws.modules.fetchHubs();

    served.hubs.set(listOf(A), { version: 1, modules: ['changed'] });
    await ws.modules.fetchHubs();
    expect(await ws.modules.importable()).toEqual(['old']);

    served.hubs.set(listOf(A), { version: 2, modules: ['newer'] });
    await ws.modules.fetchHubs();
    expect(await ws.modules.importable()).toEqual(['newer']);

    served.hubs.set(listOf(A), { version: 2, modules: ['forced'] });
    await ws.modules.fetchHubs(true);
    expect(await ws.modules.importable()).toEqual(['forced']);
  });

  it('writes the cache the project keeps under .temp, with what it knows of each hub', async () => {
    const { ws, path } = await open({ hubs: [{ location: A }] });
    served.hubs.set(listOf(A), { version: 3, modules: ['base'] });

    await ws.modules.fetchHubs();

    expect(
      JSON.parse(readFileSync(join(path, '.temp', 'moduleList.json'), 'utf-8')),
    ).toEqual({
      modules: [{ name: 'base', location: 'https://modules.test/base.git' }],
      hubs: [
        {
          location: A,
          version: 3,
          displayName: `Hub ${listOf(A)}`,
          description: 'A hub',
          modules: [
            { name: 'base', location: 'https://modules.test/base.git' },
          ],
        },
      ],
    });
  });

  // Each form names the same module list.
  it.each([
    ['with a trailing slash', 'https://hub.test/c/'],
    ['without a trailing slash', 'https://hub.test/c'],
    ['pointing at the file', 'https://hub.test/c/moduleList.json'],
  ])('reads a hub location %s', async (_, location) => {
    const { ws } = await open({ hubs: [{ location }] });
    served.hubs.set(listOf('https://hub.test/c/'), {
      version: 1,
      modules: ['base'],
    });

    expect(await ws.modules.fetchHubs()).toEqual([]);

    expect(served.requests).toContain(listOf('https://hub.test/c/'));
    expect(await ws.modules.importable()).toEqual(['base']);
  });

  it('shows the hubs without fetching them', async () => {
    const { ws } = await open(spec);
    served.hubs.set(listOf(A), new Error('network down'));

    expect(await ws.modules.hubDetails()).toHaveLength(2);
    expect(served.requests).toEqual([]);
  });
});

describe('modules.ensureModuleListExists', () => {
  it('fetches the hubs when nothing is cached, and only then', async () => {
    const { ws } = await open({ hubs: [{ location: A }] });
    served.hubs.set(listOf(A), { version: 1, modules: ['base'] });

    await ws.modules.ensureModuleListExists();
    const requests = served.requests.length;
    await ws.modules.ensureModuleListExists();

    expect(requests).toBeGreaterThan(0);
    expect(served.requests).toHaveLength(requests);
    expect(await ws.modules.importable()).toEqual(['base']);
  });
});

describe('modules.importable', () => {
  const cache = (path: string) => {
    mkdirSync(join(path, '.temp'), { recursive: true });
    writeFileSync(
      join(path, '.temp', 'moduleList.json'),
      JSON.stringify({
        modules: [
          { name: 'have', location: 'https://modules.test/have.git' },
          { name: 'want', location: 'https://modules.test/want.git' },
        ],
        hubs: [],
      }),
    );
  };

  it.each([
    ['the names of what is not installed', undefined, undefined, ['want']],
    [
      'the names of everything the hubs offer',
      true,
      undefined,
      ['have', 'want'],
    ],
    [
      'the details of what is not installed',
      undefined,
      true,
      [{ name: 'want', location: 'https://modules.test/want.git' }],
    ],
    [
      'the details of everything the hubs offer',
      true,
      true,
      [
        { name: 'have', location: 'https://modules.test/have.git' },
        { name: 'want', location: 'https://modules.test/want.git' },
      ],
    ],
  ])('gives %s', async (_, all, details, expected) => {
    const { ws, path } = await open({
      modules: [{ prefix: 'have', workflows: [{ name: 'flow' }] }],
    });
    cache(path);

    expect(await ws.modules.importable(all, details)).toEqual(expected);
  });

  it('gives nothing while no hub has been fetched', async () => {
    const { ws } = await open();

    expect(await ws.modules.importable(true, true)).toEqual([]);
  });

  it('does not fetch', async () => {
    const { ws } = await open(spec);

    await ws.modules.importable();

    expect(served.requests).toEqual([]);
  });
});

describe('modules.hubs', () => {
  it('lists the hubs the project declares, as declared', async () => {
    const { ws } = await open({
      hubs: [
        { location: A, displayName: 'Mine', description: 'Our hub' },
        { location: B },
      ],
    });

    expect(await ws.modules.hubs()).toEqual([
      { location: A, displayName: 'Mine', description: 'Our hub' },
      { location: B },
    ]);
  });
});
