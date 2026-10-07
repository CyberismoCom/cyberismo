import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { CommandManager } from '@cyberismo/data-handler';
import { createApp } from '../src/app.js';
import { ProjectRegistry } from '../src/project-registry.js';
import { MockAuthProvider, MOCK_ROLE_COOKIE } from '../src/auth/mock.js';
import { cleanupTempTestData, createTempTestData } from './test-utils.js';

interface Mod {
  name: string;
  location: string;
  private?: boolean;
  dep?: string;
}

const GIT = 'https://example.com/git.git';
const SECRET = 'https://user:tok@example.com/p.git';
const file: Mod = { name: 'modf', location: 'file:/nowhere/modf' };
const parent: Mod = {
  name: 'moda',
  location: 'file:/nowhere/moda',
  dep: 'modb',
};
const child: Mod = { name: 'modb', location: 'file:/nowhere/modb' };
let app: ReturnType<typeof createApp>;
let commands: CommandManager;
let dir: string;

// Hub refreshes triggered along the way must stay off the network.
beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response('{"modules":[]}'),
  );
});
afterEach(async () => {
  vi.restoreAllMocks();
  await cleanupTempTestData(dir);
});

// Declares `roots`, installs them and `transitive` as fake 1.0.0 modules.
// A `dep` requires the child at ^2.0.0, which the installed 1.0.0 cannot meet.
async function open(roots: Mod[], transitive: Mod[] = []) {
  dir = await createTempTestData('module-test');
  const config = path.join(dir, '.cards', 'local', 'cardsConfig.json');
  const json = JSON.parse(await readFile(config, 'utf-8'));
  json.modules = roots.map((m) => ({
    name: m.name,
    location: m.location,
    private: m.private,
  }));
  await writeFile(config, JSON.stringify(json));
  for (const { name, dep } of [...roots, ...transitive]) {
    const modules = dep
      ? [{ name: dep, location: `file:/nowhere/${dep}`, version: '^2.0.0' }]
      : [];
    await mkdir(path.join(dir, '.cards', 'modules', name), { recursive: true });
    await writeFile(
      path.join(dir, '.cards', 'modules', name, 'cardsConfig.json'),
      JSON.stringify({ cardKeyPrefix: name, name, version: '1.0.0', modules }),
    );
  }
  commands = await CommandManager.getInstance(dir);
  app = createApp(
    new MockAuthProvider(),
    ProjectRegistry.fromCommandManager(commands),
  );
}

const call = (method: string, url: string, body?: unknown, role = 'admin') =>
  app.request(`/api/projects/test/project${url}`, {
    method,
    headers: {
      cookie: `${MOCK_ROLE_COOKIE}=${role}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

describe('module version endpoints', () => {
  // Mutation: requireRole(Admin) lowered to Editor or dropped on a route.
  test.each(['/modules/versions?module=modf', '/modules/update-plan'])(
    '%s is admin-only',
    async (url) => {
      await open([file]);
      expect((await call('GET', url, undefined, 'editor')).status).toBe(403);
    },
  );

  // Mutations: XOR refine dropped; userinfo refine dropped; blank range accepted.
  test.each([
    ['GET', '/modules/versions', undefined],
    ['GET', `/modules/versions?module=modf&source=${GIT}`, undefined],
    [
      'GET',
      `/modules/versions?source=${encodeURIComponent(SECRET)}`,
      undefined,
    ],
    ['POST', '/modules/modg/update', { range: '  ' }],
  ])('%s %s %j is refused', async (method, url, body) => {
    await open([file, { name: 'modg', location: GIT }]);
    const response = await call(method, url, body);
    expect(response.status).toBe(400);
    expect(await response.text()).not.toContain('tok');
  });

  // Mutation: git's text, which may quote the remote, sent in the response.
  test('an unreachable source names the module and nothing else', async () => {
    await open([{ name: 'modg', location: 'https://127.0.0.1:1/x.git' }]);
    const response = await call('GET', '/modules/versions?module=modg');
    expect(response.status).toBe(500);
    const body = await response.text();
    expect(body).toContain("'modg' is unreachable");
    expect(body).not.toContain('127.0.0.1');
  });

  // Mutations: parents read from the wrong side; the source location added to a row.
  test('GET /project reports version source without the location', async () => {
    const roots = [
      file,
      parent,
      { name: 'modg', location: GIT },
      { name: 'modp', location: SECRET, private: true },
    ];
    await open(roots, [child]);
    const text = await (await call('GET', '', undefined, 'reader')).text();
    expect(text).not.toMatch(/nowhere|example\.com|tok|location/);
    const rows = Object.fromEntries(
      (JSON.parse(text).modules as { name: string }[]).map((m) => [m.name, m]),
    );
    expect(rows.modf).toMatchObject({
      versionSource: 'file',
      isRoot: true,
      parents: [],
    });
    expect([rows.modg.versionSource, rows.modp.versionSource]).toEqual([
      'git',
      'private',
    ]);
    expect(rows.modb).toMatchObject({
      isRoot: false,
      parents: ['moda'],
      installedVersion: '1.0.0',
    });
  });
});
