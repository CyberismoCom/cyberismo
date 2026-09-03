import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { CommandManager } from '@cyberismo/data-handler';
import { createApp } from '../src/app.js';
import { ProjectRegistry } from '../src/project-registry.js';
import { MockAuthProvider, MOCK_ROLE_COOKIE } from '../src/auth/mock.js';
import type { ProjectModule } from '../src/domain/project/service.js';
import { cleanupTempTestData, createTempTestData } from './test-utils.js';

type UpdatePlanResponse = {
  ok: boolean;
  changes: {
    module: string;
    from: string | null;
    to: string | null;
    sealCount: number;
  }[];
  conflicts: { module: string; reason: string }[];
};

let app: ReturnType<typeof createApp>;
let tempTestDataPath: string;

// None of these tests should reach a hub; serve an empty module list to any
// URL so hub refreshes triggered along the way stay off the network.
beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(
    async () =>
      new Response(JSON.stringify({ modules: [] }), {
        headers: { 'content-type': 'application/json' },
      }),
  );
});

afterEach(async () => {
  vi.restoreAllMocks();
  await cleanupTempTestData(tempTestDataPath);
});

/**
 * Copies the module-test fixture, lets `setup` shape its module state on
 * disk, and only then opens the project — the configuration is read once
 * at load.
 */
async function createAppWithFixture(
  setup?: (projectPath: string) => Promise<void>,
) {
  tempTestDataPath = await createTempTestData('module-test');
  if (setup) {
    await setup(tempTestDataPath);
  }
  const commands = await CommandManager.getInstance(tempTestDataPath);
  app = createApp(
    new MockAuthProvider(),
    ProjectRegistry.fromCommandManager(commands),
  );
}

async function declareModules(
  projectPath: string,
  modules: {
    name: string;
    location: string;
    version?: string;
    private?: boolean;
  }[],
) {
  const configPath = path.join(
    projectPath,
    '.cards',
    'local',
    'cardsConfig.json',
  );
  const config = JSON.parse(await readFile(configPath, 'utf-8')) as {
    modules: unknown[];
  };
  config.modules = modules;
  await writeFile(configPath, JSON.stringify(config, null, 2));
}

/**
 * Writes an installed module under `.cards/modules/<name>/`. A workflow is
 * included because a module with no resources at all is invisible to the
 * resource cache, and thereby to `showModule`.
 */
async function installFakeModule(
  projectPath: string,
  module: {
    name: string;
    version?: string;
    dependencies?: { name: string; location: string; version?: string }[];
  },
) {
  const dir = path.join(projectPath, '.cards', 'modules', module.name);
  await mkdir(path.join(dir, 'workflows'), { recursive: true });
  await writeFile(
    path.join(dir, 'cardsConfig.json'),
    JSON.stringify({
      cardKeyPrefix: module.name,
      name: `Module ${module.name}`,
      description: '',
      ...(module.version ? { version: module.version } : {}),
      modules: module.dependencies ?? [],
      hubs: [],
    }),
  );
  await writeFile(
    path.join(dir, 'workflows', '.schema'),
    JSON.stringify([{ id: 'workflowSchema', version: 1 }]),
  );
  await writeFile(
    path.join(dir, 'workflows', 'basic.json'),
    JSON.stringify({
      name: `${module.name}/workflows/basic`,
      displayName: '',
      states: [{ name: 'Draft', category: 'initial' }],
      transitions: [{ name: 'Create', fromState: [''], toState: 'Draft' }],
    }),
  );
}

/** A minimal module project usable as a `file:` source. */
async function createFileSourceModule(
  projectPath: string,
  prefix: string,
): Promise<string> {
  const dir = path.join(path.dirname(projectPath), `${prefix}-src`);
  await mkdir(path.join(dir, '.cards', 'local'), { recursive: true });
  await writeFile(
    path.join(dir, '.cards', 'local', 'cardsConfig.json'),
    JSON.stringify({
      cardKeyPrefix: prefix,
      name: `Module ${prefix}`,
      description: '',
      modules: [],
      hubs: [],
    }),
  );
  return dir;
}

describe('Module info in GET /api/project', () => {
  test('reports installed version, declared range and root/transitive status', async () => {
    await createAppWithFixture(async (projectPath) => {
      await declareModules(projectPath, [
        {
          name: 'moda',
          location: 'https://example.com/moda.git',
          version: '^1.0.0',
        },
      ]);
      await installFakeModule(projectPath, {
        name: 'moda',
        version: '1.2.3',
        dependencies: [
          {
            name: 'modb',
            location: 'https://example.com/modb.git',
            version: '^1.0.0',
          },
        ],
      });
      await installFakeModule(projectPath, { name: 'modb', version: '1.0.0' });
    });

    const response = await app.request('/api/projects/test/project');
    expect(response.status).toBe(200);
    const result = (await response.json()) as { modules: ProjectModule[] };

    const root = result.modules.find((mod) => mod.cardKeyPrefix === 'moda');
    expect(root).toEqual({
      name: 'Module moda',
      cardKeyPrefix: 'moda',
      installedVersion: '1.2.3',
      declaredRange: '^1.0.0',
      isRoot: true,
    });

    const transitive = result.modules.find(
      (mod) => mod.cardKeyPrefix === 'modb',
    );
    expect(transitive).toEqual({
      name: 'modb',
      cardKeyPrefix: 'modb',
      installedVersion: '1.0.0',
      isRoot: false,
    });
  });
});

describe('POST /api/project/modules with version', () => {
  test('returns 400 for a version that is not valid semver', async () => {
    await createAppWithFixture();
    const response = await app.request('/api/projects/test/project/modules', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        source: 'https://example.com/mod.git',
        version: 'not-a-version',
      }),
    });
    expect(response.status).toBe(400);
  });

  test('accepts a semver range in the schema', async () => {
    await createAppWithFixture();
    // The import itself fails (the remote does not exist), but validation
    // must not be the reason.
    const response = await app.request('/api/projects/test/project/modules', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source: 'not-a-git-url', version: '^1.0.0' }),
    });
    expect(response.status).toBe(400);
    const result = (await response.json()) as { error: string };
    expect(result.error).toContain('Source must be a git URL');
    expect(result.error).not.toContain('version');
  });
});

describe('POST /api/project/modules/:module/update with version', () => {
  test('works without a request body', async () => {
    await createAppWithFixture();
    const response = await app.request(
      '/api/projects/test/project/modules/nope/update',
      { method: 'POST' },
    );
    expect(response.status).toBe(404);
    const result = (await response.json()) as { error: string };
    expect(result.error).toContain("Module 'nope' is not part of the project");
  });

  test('returns 400 for a version that is not an exact semver version', async () => {
    await createAppWithFixture();
    const response = await app.request(
      '/api/projects/test/project/modules/moda/update',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ version: '^1.0.0' }),
      },
    );
    expect(response.status).toBe(400);
  });

  test('returns 400 for a malformed JSON body', async () => {
    await createAppWithFixture();
    const response = await app.request(
      '/api/projects/test/project/modules/moda/update',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{not json',
      },
    );
    expect(response.status).toBe(400);
  });

  test('passes the version through to the update command', async () => {
    await createAppWithFixture(async (projectPath) => {
      const sourceDir = await createFileSourceModule(projectPath, 'filemod');
      await declareModules(projectPath, [
        { name: 'filemod', location: `file:${sourceDir}`, version: '^1.0.0' },
      ]);
      await installFakeModule(projectPath, {
        name: 'filemod',
        version: '1.0.0',
      });
    });

    // The declared range rejects the requested version, which proves the
    // version reached the command without going anywhere near a remote.
    const response = await app.request(
      '/api/projects/test/project/modules/filemod/update',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ version: '2.0.0' }),
      },
    );
    expect(response.status).toBe(400);
    const result = (await response.json()) as { error: string };
    expect(result.error).toContain(
      "Version '2.0.0' for module 'filemod' does not satisfy constraint '^1.0.0'",
    );
  });

  test('blocks Editor role', async () => {
    await createAppWithFixture();
    const response = await app.request(
      '/api/projects/test/project/modules/moda/update',
      {
        method: 'POST',
        headers: { cookie: `${MOCK_ROLE_COOKIE}=editor` },
      },
    );
    expect(response.status).toBe(403);
  });
});

describe('GET /api/project/modules/versions', () => {
  test('returns 400 when neither source nor module is given', async () => {
    await createAppWithFixture();
    const response = await app.request(
      '/api/projects/test/project/modules/versions',
    );
    expect(response.status).toBe(400);
  });

  test('returns 400 when both source and module are given', async () => {
    await createAppWithFixture();
    const response = await app.request(
      '/api/projects/test/project/modules/versions?source=https%3A%2F%2Fexample.com%2Fmod.git&module=moda',
    );
    expect(response.status).toBe(400);
  });

  test('returns 400 for a source that is not a git URL', async () => {
    await createAppWithFixture();
    const response = await app.request(
      '/api/projects/test/project/modules/versions?source=%2Flocal%2Fpath',
    );
    expect(response.status).toBe(400);
  });

  test('returns 404 for a module that is not part of the project', async () => {
    await createAppWithFixture();
    const response = await app.request(
      '/api/projects/test/project/modules/versions?module=nope',
    );
    expect(response.status).toBe(404);
    const result = (await response.json()) as { error: string };
    expect(result.error).toContain("Module 'nope' is not part of the project");
  });

  test('returns a clear error for a private module', async () => {
    await createAppWithFixture(async (projectPath) => {
      await declareModules(projectPath, [
        {
          name: 'secret',
          location: 'https://example.com/secret.git',
          private: true,
        },
      ]);
      await installFakeModule(projectPath, { name: 'secret' });
    });
    const response = await app.request(
      '/api/projects/test/project/modules/versions?module=secret',
    );
    expect(response.status).toBe(400);
    const result = (await response.json()) as { error: string };
    expect(result.error).toContain('private');
  });

  test('resolves an installed module name to its configured location', async () => {
    await createAppWithFixture(async (projectPath) => {
      const sourceDir = await createFileSourceModule(projectPath, 'filemod');
      await declareModules(projectPath, [
        { name: 'filemod', location: `file:${sourceDir}` },
      ]);
      await installFakeModule(projectPath, { name: 'filemod' });
    });
    const response = await app.request(
      '/api/projects/test/project/modules/versions?module=filemod',
    );
    expect(response.status).toBe(200);
    // File sources have no discrete versions to offer.
    expect(await response.json()).toEqual([]);
  });

  test('blocks Reader role', async () => {
    await createAppWithFixture();
    const response = await app.request(
      '/api/projects/test/project/modules/versions?module=moda',
      { headers: { cookie: `${MOCK_ROLE_COOKIE}=reader` } },
    );
    expect(response.status).toBe(403);
  });
});

describe('GET /api/project/modules/update-plan', () => {
  test('returns an empty plan for a project without modules', async () => {
    await createAppWithFixture();
    const response = await app.request(
      '/api/projects/test/project/modules/update-plan',
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      changes: [],
      conflicts: [],
    });
  });

  test('plans a single module update', async () => {
    await createAppWithFixture(async (projectPath) => {
      const sourceDir = await createFileSourceModule(projectPath, 'filemod');
      await declareModules(projectPath, [
        { name: 'filemod', location: `file:${sourceDir}` },
      ]);
      await installFakeModule(projectPath, {
        name: 'filemod',
        version: '1.0.0',
      });
    });
    const response = await app.request(
      '/api/projects/test/project/modules/filemod/update-plan',
    );
    expect(response.status).toBe(200);
    const result = (await response.json()) as UpdatePlanResponse;
    // A versioned installation of an unversioned (file) source has nowhere
    // to move, so the plan resolves to no changes.
    expect(result).toEqual({ ok: true, changes: [], conflicts: [] });
  });

  test('returns 404 for a module that is not part of the project', async () => {
    await createAppWithFixture();
    const response = await app.request(
      '/api/projects/test/project/modules/nope/update-plan',
    );
    expect(response.status).toBe(404);
    const result = (await response.json()) as { error: string };
    expect(result.error).toContain("Module 'nope' is not part of the project");
  });

  test('refuses a target version the declared range excludes', async () => {
    await createAppWithFixture(async (projectPath) => {
      const sourceDir = await createFileSourceModule(projectPath, 'filemod');
      await declareModules(projectPath, [
        { name: 'filemod', location: `file:${sourceDir}`, version: '^1.0.0' },
      ]);
      await installFakeModule(projectPath, {
        name: 'filemod',
        version: '1.0.0',
      });
    });
    const response = await app.request(
      '/api/projects/test/project/modules/filemod/update-plan?version=2.0.0',
    );
    expect(response.status).toBe(400);
    const result = (await response.json()) as { error: string };
    expect(result.error).toContain(
      "Version '2.0.0' for module 'filemod' does not satisfy constraint '^1.0.0'",
    );
  });

  test('returns 400 for an invalid version query parameter', async () => {
    await createAppWithFixture();
    const response = await app.request(
      '/api/projects/test/project/modules/moda/update-plan?version=newest',
    );
    expect(response.status).toBe(400);
  });

  test('blocks Editor role', async () => {
    await createAppWithFixture();
    const all = await app.request(
      '/api/projects/test/project/modules/update-plan',
      { headers: { cookie: `${MOCK_ROLE_COOKIE}=editor` } },
    );
    expect(all.status).toBe(403);
    const single = await app.request(
      '/api/projects/test/project/modules/moda/update-plan',
      { headers: { cookie: `${MOCK_ROLE_COOKIE}=editor` } },
    );
    expect(single.status).toBe(403);
  });
});
