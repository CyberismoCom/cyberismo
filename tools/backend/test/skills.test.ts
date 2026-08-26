import { expect, test, beforeEach, afterEach } from 'vitest';
import { CommandManager } from '@cyberismo/data-handler';
import { createApp } from '../src/app.js';
import { ProjectRegistry } from '../src/project-registry.js';
import { MockAuthProvider, MOCK_ROLE_COOKIE } from '../src/auth/mock.js';
import { createTempTestData, cleanupTempTestData } from './test-utils.js';

let app: ReturnType<typeof createApp>;
let tempTestDataPath: string;

const PREVIEW_URL =
  '/api/projects/decision/resources/decision/skills/test-skill/preview';

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

async function createSkill(identifier = 'test-skill') {
  const response = await app.request('/api/projects/decision/skills', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier }),
  });
  expect(response.status).toBe(200);
  return response;
}

async function preview(body: unknown, url = PREVIEW_URL) {
  return app.request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

interface PreviewResponse {
  instructions?: string;
  error?: string;
}

// The resource tree is deliberately loosely typed on the wire; the config
// editor casts it on the client side too.
interface TreeNode {
  name: string;
  type: string;
  fileName?: string;
  children?: TreeNode[];
}

async function previewBody(response: Response): Promise<PreviewResponse> {
  return (await response.json()) as PreviewResponse;
}

test('POST /api/skills creates a skill successfully', async () => {
  const response = await createSkill();
  const result = (await response.json()) as { message: string };
  expect(result.message).toBe('Skill created successfully');
});

test('POST /api/skills rejects an invalid identifier', async () => {
  const response = await app.request('/api/projects/decision/skills', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'not a valid identifier!' }),
  });
  expect(response.status).toBe(400);
});

test('POST /api/skills blocks non-admin roles', async () => {
  const response = await app.request('/api/projects/decision/skills', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: `${MOCK_ROLE_COOKIE}=editor`,
    },
    body: JSON.stringify({ identifier: 'blocked-skill' }),
  });
  expect(response.status).toBe(403);
});

test('a created skill appears in the resource tree with its content files', async () => {
  await createSkill();
  const response = await app.request('/api/projects/decision/resources/tree');
  expect(response.status).toBe(200);

  const tree = (await response.json()) as TreeNode[];
  const skillsGroup = tree.find((node) => node.name === 'skills');
  expect(skillsGroup).toBeDefined();
  const skill = skillsGroup?.children?.[0].children?.find(
    (node) => node.name === 'decision/skills/test-skill',
  );
  expect(skill).toBeDefined();

  // File children are keyed by content property name, not filename, and their
  // order follows the on-disk read order.
  const files = skill?.children ?? [];
  expect(files.map((child) => child.fileName).sort()).toEqual([
    'skillContent',
    'skillQuery',
  ]);
  expect(files.every((child) => child.type === 'file')).toBe(true);
});

test('preview renders unsaved skill content', async () => {
  await createSkill();
  const response = await preview({
    skillContent: '# Draft\n\nStill being written.\n',
  });
  expect(response.status).toBe(200);

  const result = await previewBody(response);
  expect(result.instructions).toContain('# Draft');
  expect(result.instructions).toContain('Still being written.');
});

test('preview applies Handlebars templating with an unsaved query', async () => {
  await createSkill();
  const response = await preview({
    skillQuery: 'result(decision_5).\n',
    skillContent: '{{#each results}}Found {{key}}.{{/each}}',
  });
  expect(response.status).toBe(200);

  const result = await previewBody(response);
  expect(result.instructions).toContain('Found decision_5.');
});

test('preview passes the card key to the template', async () => {
  await createSkill();
  const response = await preview({
    skillContent: 'Applies to {{cardKey}}.',
    cardKey: 'decision_5',
  });
  expect(response.status).toBe(200);

  const result = await previewBody(response);
  expect(result.instructions).toContain('Applies to decision_5.');
});

test('preview returns 404 for an unknown skill', async () => {
  const response = await preview(
    { skillContent: 'anything' },
    '/api/projects/decision/resources/decision/skills/does-not-exist/preview',
  );
  expect(response.status).toBe(404);

  const result = await previewBody(response);
  expect(result.error).toContain('not found');
});

test('preview returns 404 for an unknown card', async () => {
  await createSkill();
  const response = await preview({
    skillContent: 'anything',
    cardKey: 'decision_does_not_exist',
  });
  expect(response.status).toBe(404);
});

test('preview returns 400 with the error when the query is broken', async () => {
  await createSkill();
  const response = await preview({
    skillContent: 'anything',
    skillQuery: 'this is not a logic program',
  });
  expect(response.status).toBe(400);

  const result = await previewBody(response);
  expect(result.error).toBeTruthy();
});

test('preview blocks non-admin roles', async () => {
  await createSkill();
  const response = await app.request(PREVIEW_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: `${MOCK_ROLE_COOKIE}=editor`,
    },
    body: JSON.stringify({ skillContent: 'anything' }),
  });
  expect(response.status).toBe(403);
});
