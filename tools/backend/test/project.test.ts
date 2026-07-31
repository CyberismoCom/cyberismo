import { readFileSync } from 'node:fs';
import { beforeEach, afterEach, describe, expect, test, vi } from 'vitest';
import { CommandManager } from '@cyberismo/data-handler';
import { createApp } from '../src/app.js';
import { ProjectRegistry } from '../src/project-registry.js';
import { MockAuthProvider } from '../src/auth/mock.js';
import { cleanupTempTestData, createTempTestData } from './test-utils.js';

type ProjectResponse = {
  name: string;
  cardKeyPrefix: string;
  description: string;
  category: string;
  modules: {
    name: string;
    cardKeyPrefix: string;
    scope: string;
    readOnly: boolean;
  }[];
};

let app: ReturnType<typeof createApp>;
let tempTestDataPath: string;

// Whichever hub the fixture project declares is the one served locally, so
// the mock cannot drift from the fixture. It answers with this repository's
// own hub content - the file the default hub serves once a change is merged -
// so a schema change and the hub data it implies are tested together instead
// of against whatever the published hub still holds.
const FIXTURE_HUB = (
  JSON.parse(
    readFileSync(
      new URL(
        '../../../module-test/.cards/local/cardsConfig.json',
        import.meta.url,
      ),
      'utf-8',
    ),
  ) as { hubs: { location: string }[] }
).hubs[0].location;

const HUB_PAYLOAD = JSON.parse(
  readFileSync(
    new URL('../../assets/src/hub/moduleList.json', import.meta.url),
    'utf-8',
  ),
) as { modules: { name: string }[] };

const HUB_FILE_URL = new URL(
  'moduleList.json',
  FIXTURE_HUB.endsWith('/') ? FIXTURE_HUB : `${FIXTURE_HUB}/`,
).toString();

// The hub the fixture points at is served locally. Reaching for the real one
// makes these tests depend on the network, where they flake once several test
// files fetch it at the same time. Installed before the project is opened,
// because opening it is itself allowed to populate the hub cache.
let hubFetch: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  hubFetch = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (input: RequestInfo | URL) => {
      if (String(input) === HUB_FILE_URL) {
        return new Response(JSON.stringify(HUB_PAYLOAD), {
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`Cannot reach ${String(input)}`);
    }) as ReturnType<typeof vi.spyOn>;
});

afterEach(() => {
  vi.restoreAllMocks();
});

beforeEach(async () => {
  tempTestDataPath = await createTempTestData('module-test');
  const commands = await CommandManager.getInstance(tempTestDataPath);
  app = createApp(
    new MockAuthProvider(),
    ProjectRegistry.fromCommandManager(commands),
  );
});

afterEach(async () => {
  await cleanupTempTestData(tempTestDataPath);
});

describe('Project endpoints', () => {
  test('GET /api/project returns project info', async () => {
    const response = await app.request('/api/projects/test/project');
    expect(response.status).toBe(200);
    const result = (await response.json()) as ProjectResponse;

    expect(result.name).toBeTruthy();
    expect(result.cardKeyPrefix).toBeTruthy();
    expect(Array.isArray(result.modules)).toBe(true);
  });

  test('PATCH /api/project updates name and prefix', async () => {
    const response = await app.request('/api/projects/test/project', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Updated Project Name',
        cardKeyPrefix: 'projtest',
      }),
    });

    expect(response.status).toBe(200);
    const result = (await response.json()) as ProjectResponse;
    expect(result.name).toBe('Updated Project Name');
    expect(result.cardKeyPrefix).toBe('projtest');
  });

  test('PATCH /api/projects/:projectPrefix/project updates description and category', async () => {
    const response = await app.request('/api/projects/test/project', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        description: 'A project for testing',
        category: 'Testing',
      }),
    });

    expect(response.status).toBe(200);
    const result = (await response.json()) as ProjectResponse;
    expect(result.description).toBe('A project for testing');
    expect(result.category).toBe('Testing');
  });

  test('PATCH /api/projects/:projectPrefix/project clears description and category with empty string', async () => {
    await app.request('/api/projects/test/project', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ description: 'set', category: 'set' }),
    });

    const response = await app.request('/api/projects/test/project', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ description: '', category: '' }),
    });

    expect(response.status).toBe(200);
    const result = (await response.json()) as ProjectResponse;
    expect(result.description).toBe('');
    expect(result.category).toBe('');
  });

  test('GET /api/project/modules/importable returns the importable modules', async () => {
    const response = await app.request(
      '/api/projects/test/project/modules/importable',
    );
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result).toHaveLength(HUB_PAYLOAD.modules.length);
  });

  test('POST /api/project/modules returns 400 for missing source', async () => {
    const response = await app.request('/api/projects/test/project/modules', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(response.status).toBe(400);
  });

  test('POST /api/project/modules returns 400 for non-git source', async () => {
    const response = await app.request('/api/projects/test/project/modules', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source: 'not-a-git-url' }),
    });
    expect(response.status).toBe(400);
  });
});

describe('Hub endpoints', () => {
  type HubResponse = {
    location: string;
    displayName?: string;
    description?: string;
    modules: {
      name: string;
      displayName?: string;
      location: string;
      imported: boolean;
    }[];
  }[];

  test('GET /api/project/hubs returns configured hubs with modules', async () => {
    const response = await app.request('/api/projects/test/project/hubs');
    expect(response.status).toBe(200);
    const result = (await response.json()) as HubResponse;

    expect(result).toHaveLength(1);
    expect(result[0].location).toBe(FIXTURE_HUB);
    expect(result[0].modules).toHaveLength(HUB_PAYLOAD.modules.length);
    expect(result[0].modules.every((mod) => !mod.imported)).toBe(true);
  });

  test('POST and DELETE /api/project/hubs add and remove a hub', async () => {
    const location = 'https://example.com/test-hub';
    // Locations are stored as a directory URL, whichever form they arrive in.
    const stored = `${location}/`;

    const addResponse = await app.request('/api/projects/test/project/hubs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ location }),
    });
    expect(addResponse.status).toBe(200);

    const listResponse = await app.request('/api/projects/test/project/hubs');
    const hubs = (await listResponse.json()) as HubResponse;
    expect(hubs).toHaveLength(2);
    const addedHub = hubs.find((hub) => hub.location === stored);
    expect(addedHub).toBeDefined();
    // Hub is not reachable, so it has no modules.
    expect(addedHub?.modules).toHaveLength(0);

    const deleteResponse = await app.request(
      `/api/projects/test/project/hubs?location=${encodeURIComponent(location)}`,
      { method: 'DELETE' },
    );
    expect(deleteResponse.status).toBe(200);

    const afterDelete = (await (
      await app.request('/api/projects/test/project/hubs')
    ).json()) as HubResponse;
    expect(afterDelete).toHaveLength(1);
  });

  test.each([
    ['a non-HTTP scheme', 'ftp://example.com/hub'],
    ['a bare scheme', 'https://'],
    ['a string with no scheme', 'not-a-url'],
  ])('POST /api/project/hubs returns 400 for %s', async (_name, location) => {
    const response = await app.request('/api/projects/test/project/hubs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ location }),
    });
    expect(response.status).toBe(400);
  });

  test('POST /api/project/hubs returns 500 for duplicate hub', async () => {
    const response = await app.request('/api/projects/test/project/hubs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        location: FIXTURE_HUB,
      }),
    });
    expect(response.status).toBe(500);
  });

  test('DELETE /api/project/hubs returns 400 when location is missing', async () => {
    const response = await app.request('/api/projects/test/project/hubs', {
      method: 'DELETE',
    });
    expect(response.status).toBe(400);
  });

  test('GET /api/project/hubs serves cached data without contacting the hub', async () => {
    // First read populates the cache; the ones after it must not go out again.
    await app.request('/api/projects/test/project/hubs');
    hubFetch.mockClear();

    const response = await app.request('/api/projects/test/project/hubs');
    expect(response.status).toBe(200);
    const result = (await response.json()) as HubResponse;
    expect(result[0].modules).toHaveLength(HUB_PAYLOAD.modules.length);
    expect(hubFetch).not.toHaveBeenCalled();
  });

  test('an unreachable hub is reported but leaves the working ones usable', async () => {
    const broken = 'https://example.com/not-a-hub/';
    const addResponse = await app.request('/api/projects/test/project/hubs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ location: broken }),
    });
    expect(addResponse.status).toBe(200);
    const added = (await addResponse.json()) as {
      unreachable: { location: string }[];
    };
    expect(added.unreachable.map((hub) => hub.location)).toEqual([broken]);

    // The working hub still lists its modules...
    const hubs = (await (
      await app.request('/api/projects/test/project/hubs')
    ).json()) as HubResponse;
    expect(hubs.find((hub) => hub.location === broken)?.modules).toHaveLength(
      0,
    );
    expect(hubs.find((hub) => hub.location !== broken)?.modules).toHaveLength(
      4,
    );

    // ...and they are still importable, which the broken hub used to prevent.
    const importable = await app.request(
      '/api/projects/test/project/modules/importable',
    );
    expect(importable.status).toBe(200);
    expect((await importable.json()) as unknown[]).toHaveLength(
      HUB_PAYLOAD.modules.length,
    );

    const fetchResponse = await app.request(
      '/api/projects/test/project/hubs/fetch',
      { method: 'POST' },
    );
    expect(fetchResponse.status).toBe(200);
    const fetched = (await fetchResponse.json()) as {
      unreachable: { location: string }[];
    };
    expect(fetched.unreachable.map((hub) => hub.location)).toEqual([broken]);
  });

  test('POST /api/project/hubs/fetch refetches hub data', async () => {
    const response = await app.request(
      '/api/projects/test/project/hubs/fetch',
      { method: 'POST' },
    );
    expect(response.status).toBe(200);
  });
});
