import { beforeEach, afterEach, describe, expect, test } from 'vitest';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { CommandManager } from '@cyberismo/data-handler';
import { projectSettingsFile } from '../src/project-settings.js';
import { createApp } from '../src/app.js';
import { ProjectRegistry } from '../src/project-registry.js';
import { MockAuthProvider, MOCK_ROLE_COOKIE } from '../src/auth/mock.js';
import { cleanupTempTestData, createTempTestData } from './test-utils.js';

let app: ReturnType<typeof createApp>;
let tempTestDataPath: string;

const asRole = (role: string) => ({ cookie: `${MOCK_ROLE_COOKIE}=${role}` });

const setReadOnly = (readOnlyMode: boolean, role = 'admin') =>
  app.request('/api/projects/decision/project/read-only', {
    method: 'PUT',
    headers: { 'content-type': 'application/json', ...asRole(role) },
    body: JSON.stringify({ readOnlyMode }),
  });

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
    expect(await response.json()).toMatchObject({ readOnlyMode: false });
  });

  test('an admin can turn it on and the project endpoint reflects it', async () => {
    expect((await setReadOnly(true)).status).toBe(200);

    const response = await app.request('/api/projects/decision/project');
    expect(await response.json()).toMatchObject({ readOnlyMode: true });
  });

  test('a non-admin cannot turn it on', async () => {
    expect((await setReadOnly(true, 'editor')).status).toBe(403);
    expect((await setReadOnly(true, 'reader')).status).toBe(403);

    const response = await app.request('/api/projects/decision/project');
    expect(await response.json()).toMatchObject({ readOnlyMode: false });
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
  const settingsFile = () => projectSettingsFile(tempTestDataPath);

  const writeSettings = (contents: string) => {
    mkdirSync(dirname(settingsFile()), { recursive: true });
    writeFileSync(settingsFile(), contents);
  };

  /** Rebuild the app over the same project directory, as a restart would. */
  const restart = async () => {
    const commands = await CommandManager.getInstance(tempTestDataPath);
    app = createApp(
      new MockAuthProvider(),
      ProjectRegistry.fromCommandManager(commands),
    );
  };

  test('is stored in the project settings file', async () => {
    await setReadOnly(true);

    expect(JSON.parse(readFileSync(settingsFile(), 'utf-8'))).toEqual({
      readOnlyMode: true,
    });
  });

  test('survives a restart', async () => {
    await setReadOnly(true);
    await restart();

    const response = await app.request('/api/projects/decision/project');
    expect(await response.json()).toMatchObject({ readOnlyMode: true });
    expect((await editorWrite()).status).toBe(403);
  });

  test('turning it off again survives a restart', async () => {
    await setReadOnly(true);
    await setReadOnly(false);
    await restart();

    expect((await editorWrite()).status).toBe(200);
  });

  test('keeps settings it does not know about', async () => {
    writeSettings(JSON.stringify({ somethingElse: 'keep me' }));
    await restart();

    await setReadOnly(true);

    expect(JSON.parse(readFileSync(settingsFile(), 'utf-8'))).toEqual({
      somethingElse: 'keep me',
      readOnlyMode: true,
    });
  });

  test('falls back to off on an unreadable file', async () => {
    writeSettings('not json');
    await restart();

    const response = await app.request('/api/projects/decision/project');
    expect(await response.json()).toMatchObject({ readOnlyMode: false });
  });
});
