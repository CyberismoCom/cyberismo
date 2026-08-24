import { beforeEach, afterEach, describe, expect, test } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { CommandManager } from '@cyberismo/data-handler';
import { deploymentSettingsFile } from '../src/deployment-settings.js';
import { createApp } from '../src/app.js';
import { ProjectRegistry } from '../src/project-registry.js';
import { MockAuthProvider, MOCK_ROLE_COOKIE } from '../src/auth/mock.js';
import { cleanupTempTestData, createTempTestData } from './test-utils.js';

let app: ReturnType<typeof createApp>;
let tempTestDataPath: string;

const asRole = (role: string) => ({ cookie: `${MOCK_ROLE_COOKIE}=${role}` });

const setReadOnly = (enabled: boolean, role = 'admin') =>
  app.request('/api/projects/decision/project/deployment-settings', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...asRole(role) },
    body: JSON.stringify({ readOnly: { enabled } }),
  });

const settingsFile = () => deploymentSettingsFile(tempTestDataPath);

const readSettingsFile = () =>
  JSON.parse(readFileSync(settingsFile(), 'utf-8'));

/** Rebuild the app over the same project directory, as a restart would. */
const restart = async () => {
  const commands = await CommandManager.getInstance(tempTestDataPath);
  app = createApp(
    new MockAuthProvider(),
    ProjectRegistry.fromCommandManager(commands),
  );
};

// Any editor-gated write serves to show the cap applies to every route, since
// they all gate through the same requireRole/context user.
const editorWrite = (role = 'editor') =>
  app.request('/api/projects/decision/cards/decision_5', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...asRole(role) },
    body: JSON.stringify({ metadata: { title: 'Written while read-only' } }),
  });

beforeEach(async () => {
  tempTestDataPath = await createTempTestData('decision-records');
  const commands = await CommandManager.getInstance(tempTestDataPath);
  app = createApp(
    new MockAuthProvider(),
    ProjectRegistry.fromCommandManager(commands),
  );
});

afterEach(async () => {
  await cleanupTempTestData(tempTestDataPath);
});

describe('read-only mode', () => {
  test('is off by default and reported by the project endpoint', async () => {
    const response = await app.request('/api/projects/decision/project');
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      deployment: { readOnly: { enabled: false } },
    });
  });

  test('an admin can turn it on and the project endpoint reflects it', async () => {
    expect((await setReadOnly(true)).status).toBe(200);

    const response = await app.request('/api/projects/decision/project');
    expect(await response.json()).toMatchObject({
      deployment: { readOnly: { enabled: true } },
    });
  });

  test('a non-admin cannot turn it on', async () => {
    expect((await setReadOnly(true, 'editor')).status).toBe(403);
    expect((await setReadOnly(true, 'reader')).status).toBe(403);

    const response = await app.request('/api/projects/decision/project');
    expect(await response.json()).toMatchObject({
      deployment: { readOnly: { enabled: false } },
    });
  });

  test('editors may write while it is off', async () => {
    expect((await editorWrite()).status).toBe(200);
  });

  test('editors are refused while it is on', async () => {
    await setReadOnly(true);

    expect((await editorWrite()).status).toBe(403);
  });

  test('editors may read while it is on', async () => {
    await setReadOnly(true);

    const response = await app.request(
      '/api/projects/decision/cards/decision_5',
      {
        headers: asRole('editor'),
      },
    );
    expect(response.status).toBe(200);
  });

  test('an empty patch is refused', async () => {
    const response = await app.request(
      '/api/projects/decision/project/deployment-settings',
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', ...asRole('admin') },
        body: JSON.stringify({}),
      },
    );

    expect(response.status).toBe(400);
  });

  // Admins keep their permissions, which is what stops the mode from becoming
  // irreversible: the only role allowed to turn it off is the only role the
  // mode does not downgrade.
  test('admins keep writing while it is on, and can turn it off again', async () => {
    await setReadOnly(true);

    expect((await editorWrite('admin')).status).toBe(200);

    expect((await setReadOnly(false)).status).toBe(200);
    expect((await editorWrite()).status).toBe(200);
  });
});

describe('read-only mode persistence', () => {
  test('is stored in the project deployment settings file', async () => {
    await setReadOnly(true);

    expect(readSettingsFile()).toEqual({ readOnly: { enabled: true } });
  });

  // The point of the file: a restarted server must not silently reopen a
  // project the admin locked.
  test('survives a restart', async () => {
    await setReadOnly(true);

    await restart();

    const response = await app.request('/api/projects/decision/project');
    expect(await response.json()).toMatchObject({
      deployment: { readOnly: { enabled: true } },
    });
    expect((await editorWrite()).status).toBe(403);
  });

  test('turning it off again survives a restart', async () => {
    await setReadOnly(true);
    await setReadOnly(false);

    await restart();

    expect((await editorWrite()).status).toBe(200);
  });

  // The stored object is loose so that an update of one setting does not drop
  // keys written by another feature or a newer build.
  test('keeps settings it does not know about', async () => {
    mkdirSync(dirname(settingsFile()), { recursive: true });
    writeFileSync(settingsFile(), JSON.stringify({ somethingElse: 'keep me' }));
    await restart();

    await setReadOnly(true);

    expect(readSettingsFile()).toEqual({
      somethingElse: 'keep me',
      readOnly: { enabled: true },
    });
  });

  // A file that cannot be parsed must not stop the project from loading; the
  // mode falls back to off, which an admin can set again.
  test('falls back to defaults on an unreadable file', async () => {
    mkdirSync(dirname(settingsFile()), { recursive: true });
    writeFileSync(settingsFile(), 'not json');

    await restart();

    const response = await app.request('/api/projects/decision/project');
    expect(await response.json()).toMatchObject({
      deployment: { readOnly: { enabled: false } },
    });
  });
});
