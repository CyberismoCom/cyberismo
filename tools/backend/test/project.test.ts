import { beforeEach, afterEach, describe, expect, test } from 'vitest';
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
    expect(result).toHaveLength(4);
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
    expect(result[0].location).toBe(
      'https://raw.githubusercontent.com/CyberismoCom/cyberismo/main/tools/assets/src/hub/',
    );
    expect(result[0].modules).toHaveLength(4);
    expect(result[0].modules.every((mod) => !mod.imported)).toBe(true);
  });

  test('POST and DELETE /api/project/hubs add and remove a hub', async () => {
    const location = 'https://example.com/test-hub';

    const addResponse = await app.request('/api/projects/test/project/hubs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ location }),
    });
    expect(addResponse.status).toBe(200);

    const listResponse = await app.request('/api/projects/test/project/hubs');
    const hubs = (await listResponse.json()) as HubResponse;
    expect(hubs).toHaveLength(2);
    const addedHub = hubs.find((hub) => hub.location === location);
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

  test('POST /api/project/hubs returns 400 for non-HTTP location', async () => {
    const response = await app.request('/api/projects/test/project/hubs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ location: 'ftp://example.com/hub' }),
    });
    expect(response.status).toBe(400);
  });

  test('POST /api/project/hubs returns 500 for duplicate hub', async () => {
    const response = await app.request('/api/projects/test/project/hubs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        location:
          'https://raw.githubusercontent.com/CyberismoCom/cyberismo/main/tools/assets/src/hub/',
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

  test('POST /api/project/hubs/fetch refetches hub data', async () => {
    const response = await app.request(
      '/api/projects/test/project/hubs/fetch',
      { method: 'POST' },
    );
    expect(response.status).toBe(200);
  });
});
