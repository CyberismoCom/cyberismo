import { expect, test, beforeEach, afterEach, describe } from 'vitest';
import { createApp } from '../src/app.js';
import { createTempTestData, cleanupTempTestData } from './test-utils.js';
import { execSync } from 'node:child_process';

let app: ReturnType<typeof createApp>;
let tempTestDataPath: string;

describe('sessions API', () => {
  beforeEach(async () => {
    tempTestDataPath = await createTempTestData('decision-records');
    // Initialize git repo since edit sessions require Git
    execSync('git init', { cwd: tempTestDataPath, stdio: 'pipe' });
    execSync('git add -A', { cwd: tempTestDataPath, stdio: 'pipe' });
    execSync('git commit -m "Initial commit"', {
      cwd: tempTestDataPath,
      stdio: 'pipe',
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'Test',
        GIT_AUTHOR_EMAIL: 'test@test.com',
        GIT_COMMITTER_NAME: 'Test',
        GIT_COMMITTER_EMAIL: 'test@test.com',
      },
    });
    app = createApp(tempTestDataPath);
  });

  afterEach(async () => {
    await cleanupTempTestData(tempTestDataPath);
  });

  // Basic endpoint tests - verify the API is wired up correctly

  test('GET /api/sessions returns array', async () => {
    const response = await app.request('/api/sessions', {
      method: 'GET',
    });

    expect(response).not.toBe(null);
    expect(response.status).toBe(200);

    const result = await response.json();
    expect(Array.isArray(result)).toBe(true);
  });

  test('POST /api/sessions returns 400 for missing cardKey', async () => {
    const response = await app.request('/api/sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(400);
    const result = await response.json();
    expect(result).toHaveProperty('error');
  });

  test('POST /api/sessions returns 400 for non-existent card', async () => {
    const response = await app.request('/api/sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        cardKey: 'non_existent_card_key',
      }),
    });

    expect(response.status).toBe(400);
    const result = await response.json();
    expect(result).toHaveProperty('error');
  });

  test('GET /api/sessions/:id returns 404 for non-existent session', async () => {
    const response = await app.request('/api/sessions/non-existent-id', {
      method: 'GET',
    });

    expect(response.status).toBe(404);
    const result = await response.json();
    expect(result).toHaveProperty('error');
  });

  test('POST /api/sessions/:id/save returns 400 for non-existent session', async () => {
    const response = await app.request('/api/sessions/non-existent-id/save', {
      method: 'POST',
    });

    expect(response.status).toBe(400);
    const result = await response.json();
    expect(result).toHaveProperty('error');
  });

  test('POST /api/sessions/:id/publish returns 400 for non-existent session', async () => {
    const response = await app.request('/api/sessions/non-existent-id/publish', {
      method: 'POST',
    });

    expect(response.status).toBe(400);
    const result = await response.json();
    expect(result).toHaveProperty('error');
  });

  test('DELETE /api/sessions/:id returns 404 for non-existent session', async () => {
    const response = await app.request('/api/sessions/non-existent-id', {
      method: 'DELETE',
    });

    expect(response.status).toBe(404);
    const result = await response.json();
    expect(result).toHaveProperty('error');
  });

  test('POST /api/sessions/cleanup returns success', async () => {
    const response = await app.request('/api/sessions/cleanup', {
      method: 'POST',
    });

    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result).toHaveProperty('message', 'Cleanup completed');
  });

  test('GET /api/sessions/card/:cardKey returns hasSession false for card without session', async () => {
    const response = await app.request('/api/sessions/card/some_card_key', {
      method: 'GET',
    });

    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result).toHaveProperty('hasSession', false);
    expect(result).toHaveProperty('session', null);
  });

  test('GET /api/sessions?cardKey returns empty array for card without session', async () => {
    const response = await app.request('/api/sessions?cardKey=some_card_key', {
      method: 'GET',
    });

    expect(response.status).toBe(200);
    const result = await response.json();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });
});
