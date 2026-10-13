/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026

  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.

  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

// Smoke tests for every MCP write tool under autocommit: the write lands, makes
// exactly the expected commits with the expected author, and leaves the tree clean.

import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { resourceName, type Workspace } from '@cyberismo/data-handler';
import { createMcpServer, singleProjectProvider } from '../src/server.js';
import {
  buildProject,
  type BuiltProject,
} from '../../data-handler/test/helpers/project-builder.js';
import { openTestWorkspace } from './helpers/open-test-workspace.js';

// Author of MCP autocommits today.
const COMMIT_AUTHOR = 'Cyberismo Bot <bot@cyberismo.com>';
const COMMIT_TRAILERS = 'Cyberismo-Actor: system:cyberismo';

const run = promisify(execFile);

let project: BuiltProject;
let ws: Workspace;
const savedEnv = new Map<string, string | undefined>();
let configDir: string;
let client: Client;
// Root card keys: alpha (with child), beta, gamma and labelled.
let alpha: string, child: string, beta: string, gamma: string;
let labelled: string;

// The Bot author must not depend on the developer's git environment: drop the
// author/committer/config-injection env and system config, and pin global
// config to a file without user.*.
beforeEach(async () => {
  configDir = await mkdtemp(join(tmpdir(), 'cyberismo-gitconfig-'));
  await writeFile(join(configDir, 'gitconfig'), '');
  for (const name of Object.keys(process.env)) {
    if (/^GIT_(AUTHOR|COMMITTER|CONFIG)_/.test(name)) {
      savedEnv.set(name, process.env[name]);
      delete process.env[name];
    }
  }
  for (const name of ['GIT_CONFIG_GLOBAL', 'GIT_CONFIG_NOSYSTEM']) {
    if (!savedEnv.has(name)) savedEnv.set(name, process.env[name]);
  }
  process.env.GIT_CONFIG_NOSYSTEM = '1';
  process.env.GIT_CONFIG_GLOBAL = join(configDir, 'gitconfig');
  project = await buildProject({
    git: true,
    templates: [{ name: 'page', cards: [{ title: 'Template page' }] }],
    calculations: { extra: '' },
    cards: [
      { title: 'Alpha', children: [{ title: 'Child' }] },
      { title: 'Beta' },
      { title: 'Gamma' },
      { title: 'Labelled', labels: ['keep', 'drop'] },
    ],
  });
  [alpha, child, beta, gamma, labelled] = project.keys;
  ws = await openTestWorkspace(project.path, { autocommit: true });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await createMcpServer(singleProjectProvider(ws.checkout)).connect(
    serverTransport,
  );
  client = new Client({ name: 'test-client', version: '1.0.0' });
  await client.connect(clientTransport);
});

afterEach(async () => {
  for (const [name, value] of savedEnv) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  savedEnv.clear();
  await client.close();
  ws.checkout.dispose();
  await project.cleanup();
  await rm(configDir, { recursive: true, force: true });
});

const git = async (...args: string[]) =>
  (await run('git', args, { cwd: project.path })).stdout.trim();
const commitCount = async () =>
  Number(await git('rev-list', '--count', 'HEAD'));

// Calls a tool with the fixture's prefix; returns the raw MCP result.
const callTool = (name: string, args: Record<string, unknown> = {}) =>
  client.callTool({ name, arguments: { projectPrefix: 'test', ...args } });

// Calls a tool that must succeed and returns its parsed JSON payload.
async function call(name: string, args: Record<string, unknown> = {}) {
  const result = await callTool(name, args);
  const text = (result.content as { text: string }[])[0].text;
  expect(result.isError, text).toBeFalsy();
  return JSON.parse(text);
}

// Calls a write tool and checks its commits, their author and trailers, and a
// clean tree.
async function write(name: string, args: Record<string, unknown>, commits = 1) {
  const before = await commitCount();
  const payload = await call(name, args);
  expect(await commitCount()).toBe(before + commits);
  const authors = await git(
    'log',
    `-${commits}`,
    '--format=%an <%ae> %(trailers:only,unfold,separator=%x2C)',
  );
  expect(authors.split('\n')).toEqual(
    Array(commits).fill(`${COMMIT_AUTHOR} ${COMMIT_TRAILERS}`),
  );
  expect(await git('status', '--porcelain')).toBe('');
  return payload;
}

const card = async (cardKey: string) =>
  (await call('get_card', { cardKey, raw: true })).card;

interface TreeNode {
  key: string;
  children?: TreeNode[];
}
const rootKeys = async () =>
  ((await call('list_cards')).cards as TreeNode[]).map((node) => node.key);
const childKeys = async (key: string) =>
  ((await call('list_cards')).cards as TreeNode[])
    .find((node) => node.key === key)
    ?.children?.map((node) => node.key) ?? [];

const resourceNames = (type: string) => ws.showCmd.showResources(type);
const resource = (name: string) => ws.showCmd.showResource(name);

async function addLinkType(description = false) {
  await ws.createCmd.createLinkType('related');
  if (description) {
    await ws.updateCmd.apply({
      kind: 'edit',
      target: resourceName('test/linkTypes/related'),
      updateKey: { key: 'enableLinkDescription' },
      operation: { name: 'change', target: false, to: true },
    });
  }
  return 'test/linkTypes/related';
}

describe('MCP card write tools', () => {
  test('create_card', async () => {
    const { created } = await write('create_card', {
      template: 'test/templates/page',
    });
    expect(created).toHaveLength(1);
    expect((await card(created[0].key)).metadata.title).toBe('Template page');
    expect(await rootKeys()).toContain(created[0].key);
  });

  test('edit_card_content', async () => {
    await write('edit_card_content', { cardKey: beta, content: 'Edited' });
    expect((await card(beta)).content).toBe('Edited');
  });

  test('edit_card_metadata', async () => {
    await write('edit_card_metadata', {
      cardKey: beta,
      field: 'title',
      value: 'Renamed',
    });
    expect((await card(beta)).metadata.title).toBe('Renamed');
  });

  test('transition_card', async () => {
    await write('transition_card', {
      cardKey: beta,
      transition: 'To In Progress',
    });
    expect((await card(beta)).metadata.workflowState).toBe('In Progress');
  });

  test('move_card', async () => {
    await write('move_card', { cardKey: beta, destinationKey: alpha });
    expect(await childKeys(alpha)).toContain(beta);
    expect(await rootKeys()).not.toContain(beta);
  });

  test('remove_card', async () => {
    await write('remove_card', { cardKey: alpha });
    expect(await rootKeys()).toEqual([beta, gamma, labelled]);
    expect((await callTool('get_card', { cardKey: child })).isError).toBe(true);
  });

  test('create_link', async () => {
    const linkType = await addLinkType();
    await write('create_link', {
      sourceKey: alpha,
      destinationKey: beta,
      linkType,
    });
    expect((await card(alpha)).metadata.links).toEqual([
      { cardKey: beta, linkType },
    ]);
  });

  test('remove_link', async () => {
    const linkType = await addLinkType();
    await ws.createCmd.createLink(alpha, beta, linkType);
    await write('remove_link', {
      sourceKey: alpha,
      destinationKey: beta,
      linkType,
    });
    expect((await card(alpha)).metadata.links).toEqual([]);
  });

  test('remove_link cannot remove a link that has a description', async () => {
    // Current behaviour: the tool takes no description, so it can match only
    // links without one; the call fails and nothing is committed.
    const linkType = await addLinkType(true);
    await ws.createCmd.createLink(alpha, beta, linkType, 'why');
    const before = await commitCount();
    const result = await callTool('remove_link', {
      sourceKey: alpha,
      destinationKey: beta,
      linkType,
    });
    expect(result.isError).toBe(true);
    expect(await commitCount()).toBe(before);
    expect((await card(alpha)).metadata.links).toHaveLength(1);
  });

  test('create_label', async () => {
    await write('create_label', { cardKey: beta, label: 'urgent' });
    expect((await card(beta)).metadata.labels).toEqual(['urgent']);
    expect((await call('list_labels')).labels).toContain('urgent');
  });

  test('remove_label', async () => {
    await write('remove_label', { cardKey: labelled, label: 'drop' });
    expect((await card(labelled)).metadata.labels).toEqual(['keep']);
  });

  test('remove_label of a missing label removes the only label', async () => {
    // Current behaviour: a card with exactly one label loses it whatever
    // label is named.
    await ws.removeCmd.remove('label', labelled, 'drop');
    await write('remove_label', { cardKey: labelled, label: 'missing' });
    expect((await card(labelled)).metadata.labels).toEqual([]);
  });

  test('create_attachment', async () => {
    await write('create_attachment', {
      cardKey: beta,
      filename: 'note.txt',
      content: Buffer.from('hello').toString('base64'),
    });
    const attachments = (await card(beta)).attachments;
    expect(attachments.map((a: { fileName: string }) => a.fileName)).toEqual([
      'note.txt',
    ]);
  });

  test('remove_attachment', async () => {
    await ws.createCmd.createAttachment(beta, 'note.txt', Buffer.from('hi'));
    await write('remove_attachment', { cardKey: beta, filename: 'note.txt' });
    expect((await card(beta)).attachments).toEqual([]);
  });

  test('rank_card_first', async () => {
    await write('rank_card_first', { cardKey: gamma });
    expect(await rootKeys()).toEqual([gamma, alpha, beta, labelled]);
  });

  test('rank_card_after', async () => {
    await write('rank_card_after', { cardKey: alpha, afterCardKey: gamma });
    expect(await rootKeys()).toEqual([beta, gamma, alpha, labelled]);
  });

  test('rank_card_by_index', async () => {
    await write('rank_card_by_index', { cardKey: labelled, index: 1 });
    expect(await rootKeys()).toEqual([alpha, labelled, beta, gamma]);
  });
});

describe('MCP resource write tools', () => {
  test('create_card_type', async () => {
    await write('create_card_type', {
      name: 'task',
      workflowName: 'test/workflows/default',
    });
    expect(await resource('test/cardTypes/task')).toMatchObject({
      name: 'test/cardTypes/task',
      workflow: 'test/workflows/default',
    });
  });

  test('create_field_type', async () => {
    await write('create_field_type', { name: 'size', dataType: 'integer' });
    expect(await resource('test/fieldTypes/size')).toMatchObject({
      name: 'test/fieldTypes/size',
      dataType: 'integer',
    });
  });

  test('create_workflow', async () => {
    await write('create_workflow', { name: 'flow' });
    expect(await resourceNames('workflows')).toContain('test/workflows/flow');
  });

  test('create_link_type', async () => {
    await write('create_link_type', { name: 'blocks' });
    expect(await resourceNames('linkTypes')).toContain('test/linkTypes/blocks');
  });

  test('create_template', async () => {
    await write('create_template', { name: 'form' });
    const { templates } = await call('list_templates');
    expect(templates.map((t: { name: string }) => t.name)).toContain(
      'test/templates/form',
    );
  });

  test('add_template_cards', async () => {
    const { created } = await write('add_template_cards', {
      templateName: 'test/templates/page',
      cardTypeName: 'test/cardTypes/page',
      count: 2,
    });
    expect(created).toHaveLength(2);
    for (const key of created) {
      expect((await card(key)).metadata.cardType).toBe('test/cardTypes/page');
    }
  });

  test('create_calculation', async () => {
    await write('create_calculation', { name: 'more' });
    expect(await resourceNames('calculations')).toContain(
      'test/calculations/more',
    );
  });

  test('create_report', async () => {
    await write('create_report', { name: 'summary' });
    expect(await resourceNames('reports')).toContain('test/reports/summary');
  });

  test('create_graph_model', async () => {
    await write('create_graph_model', { name: 'model' });
    expect(await resourceNames('graphModels')).toContain(
      'test/graphModels/model',
    );
  });

  test('create_graph_view', async () => {
    await write('create_graph_view', { name: 'view' });
    expect(await resourceNames('graphViews')).toContain('test/graphViews/view');
  });

  test('delete_resource', async () => {
    await write('delete_resource', {
      resourceType: 'calculation',
      name: 'test/calculations/extra',
    });
    expect(await resourceNames('calculations')).not.toContain(
      'test/calculations/extra',
    );
  });

  test('update_file_resource', async () => {
    await write('update_file_resource', {
      resource: 'test/workflows/default',
      key: 'displayName',
      operation: { name: 'change', target: 'default', to: 'Default flow' },
    });
    expect(await resource('test/workflows/default')).toMatchObject({
      displayName: 'Default flow',
    });
  });

  test('update_folder_resource', async () => {
    await write('update_folder_resource', {
      resource: 'test/templates/page',
      query: {
        key: 'displayName',
        operation: { name: 'change', target: 'page', to: 'Page' },
      },
    });
    expect(await resource('test/templates/page')).toMatchObject({
      displayName: 'Page',
    });
  });
});
