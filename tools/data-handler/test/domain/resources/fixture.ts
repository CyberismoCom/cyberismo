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

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type {
  CreateParamsByType,
  UpdateKey,
  Operation,
} from '@cyberismo/model';
import { resourceName } from '../../../src/shared/utils/resource-utils.js';
import type { Workspace } from '../../../src/api/workspace/workspace.js';
import type { ProjectSpec } from '../../helpers/project-builder.js';

export { expectRefused, projects, snapshot } from '../cards/fixture.js';

// A path inside the project's own resources (.cards/local).
export const local = (dir: string, ...parts: string[]) =>
  join(dir, '.cards', 'local', ...parts);

export const readJson = (path: string) =>
  JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>;

// Params that create a resource of each type.
export const newParams: {
  [T in keyof CreateParamsByType]: CreateParamsByType[T];
} = {
  workflows: {},
  cardTypes: { workflow: 'test/workflows/flow' },
  fieldTypes: { dataType: 'enum' },
  linkTypes: {},
  templates: {},
  calculations: {},
  reports: {},
  graphModels: {},
  graphViews: {},
  skills: {},
};
export const resourceTypes = Object.keys(
  newParams,
) as (keyof typeof newParams)[];

// Applies an edit of the resource called `name`.
export const edit = (
  ws: Workspace,
  name: string,
  key: UpdateKey | string,
  operation: Operation<unknown>,
) =>
  ws.changes.apply({
    kind: 'edit',
    target: resourceName(name),
    updateKey: typeof key === 'string' ? { key } : key,
    operation,
  });

export const rename = (ws: Workspace, name: string, newIdentifier: string) =>
  ws.changes.apply({
    kind: 'rename',
    target: resourceName(name),
    newIdentifier,
  });

export const remove = (ws: Workspace, name: string) =>
  ws.changes.apply({ kind: 'delete', target: resourceName(name) });

// Two workflows (Open, In Progress, Closed), card types and field types over
// them, a link type, a template, a calculation and a module with a workflow;
// cards C0 (all fields set, linking C1, naming the template) over C1.
export const spec = {
  workflows: [{ name: 'flow' }, { name: 'other' }],
  fieldTypes: [
    { name: 'size', dataType: 'integer' },
    { name: 'note', dataType: 'shortText' },
    { name: 'level', dataType: 'enum', enumValues: ['low', 'high'] },
    { name: 'spare', dataType: 'shortText' },
  ],
  cardTypes: [
    {
      name: 'page',
      workflow: 'flow',
      customFields: [{ name: 'size' }, { name: 'note' }, { name: 'level' }],
    },
    { name: 'bare', workflow: 'other', customFields: [{ name: 'size' }] },
  ],
  linkTypes: [{ name: 'rel', sourceCardTypes: ['page'] }],
  templates: [{ name: 'tpl', cards: [{ title: 'T1' }] }],
  calculations: { calc: 'fact(1).\n' },
  cards: [
    {
      title: 'C0',
      content: 'See test/templates/tpl.',
      fields: {
        'test/fieldTypes/size': 3,
        'test/fieldTypes/note': 'n',
        'test/fieldTypes/level': 'low',
      },
      links: [{ linkType: 'rel', to: 1 }],
      children: [
        {
          title: 'C1',
          workflowState: 'In Progress',
          fields: { 'test/fieldTypes/level': 'high' },
        },
      ],
    },
    // Holds a value no card type declares.
    {
      title: 'C2',
      cardType: 'bare',
      fields: { 'test/fieldTypes/spare': 'kept' },
    },
  ],
  modules: [
    {
      prefix: 'mod',
      workflows: [{ name: 'mflow' }],
      fieldTypes: [{ name: 'mfield', dataType: 'integer' }],
    },
  ],
} satisfies ProjectSpec;
