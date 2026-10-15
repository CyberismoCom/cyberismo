/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { simpleGit } from 'simple-git';
import { getStaticDirectoryPath } from '@cyberismo/assets';

import type { CreateParamsByType } from '@cyberismo/model';

import type { Workspace } from '../src/api/workspace.js';
import { openTestWorkspace } from './helpers/open-test-workspace.js';

const fixture = join(import.meta.dirname, 'test-data/valid/decision-records');

// Resource folders created by copying a static directory.
const staticSources: Record<string, string> = {
  graphViews: 'defaultGraphView',
  reports: 'defaultReport',
  skills: 'defaultSkill',
};

const templateContent = {
  name: 'decision/templates/goldenTemplateContent',
  displayName: 'Golden template',
  description: 'From content',
  category: 'golden',
};

const workflowContent = {
  name: 'decision/workflows/goldenWorkflowContent',
  displayName: 'Golden workflow',
  states: [
    { name: 'Open', category: 'initial' },
    { name: 'Done', category: 'closed' },
  ],
  transitions: [
    { name: 'Create', fromState: [''], toState: 'Open' },
    { name: 'Finish', fromState: ['Open'], toState: 'Done' },
  ],
};

// The files and commit of each resource create, pinned before the creates
// moved behind one door.
describe('resource create (golden)', () => {
  let dir: string;
  let staticDir: string;
  let ws: Workspace;

  beforeAll(async () => {
    // Outside the monorepo, so the project gets its own repository.
    dir = await mkdtemp(join(tmpdir(), 'create-golden-'));
    await cp(fixture, dir, { recursive: true });
    staticDir = await getStaticDirectoryPath();
    ws = await openTestWorkspace(dir, { autocommit: true });
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  // name, identifier, type, params
  const creates: [string, string, keyof CreateParamsByType, object][] = [
    [
      'cardType',
      'goldenCardType',
      'cardTypes',
      { workflow: 'decision/workflows/decision' },
    ],
    ['fieldType', 'goldenEnum', 'fieldTypes', { dataType: 'enum' }],
    ['template', 'goldenTemplate', 'templates', { content: undefined }],
    [
      'template with content',
      'goldenTemplateContent',
      'templates',
      { content: templateContent },
    ],
    ['workflow', 'goldenWorkflow', 'workflows', { content: undefined }],
    [
      'workflow with content',
      'goldenWorkflowContent',
      'workflows',
      { content: workflowContent },
    ],
    ['linkType', 'goldenLinkType', 'linkTypes', {}],
    ['calculation', 'goldenCalculation', 'calculations', {}],
    ['graphModel', 'goldenGraphModel', 'graphModels', {}],
    ['graphView', 'goldenGraphView', 'graphViews', {}],
    ['report', 'goldenReport', 'reports', {}],
    ['skill', 'goldenSkill', 'skills', {}],
  ];

  it.each(creates)('%s', async (_, name, type, params) => {
    await ws.resources.create(name, type, params as never);

    const git = simpleGit(dir);
    expect((await git.status()).isClean()).toBe(true);
    const subject = (await git.raw(['log', '-1', '--format=%s'])).trim();
    const paths = (await git.raw(['show', '--name-only', '--format=', 'HEAD']))
      .split('\n')
      .filter(Boolean)
      .sort();

    const files: Record<string, string> = {};
    for (const path of paths) {
      const content = await readFile(join(dir, path), 'utf-8');
      const [, , type, identifier, ...rest] = path.split('/');
      const source = staticSources[type];
      if (source && identifier === name && rest.length > 0) {
        const sourcePath = join(staticDir, source, ...rest);
        expect(content).toBe(await readFile(sourcePath, 'utf-8'));
        files[path] = `<copy of ${source}/${rest.join('/')}>`;
      } else {
        files[path] = content;
      }
    }
    expect({ subject, files }).toMatchSnapshot();
  });
});
