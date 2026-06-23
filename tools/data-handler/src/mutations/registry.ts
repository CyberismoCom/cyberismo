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

import type { Handler } from './handler.js';
import type { RouteKey } from './route.js';
import type {
  DeleteInput,
  EditInput,
  ProjectRenameInput,
  RenameInput,
} from './types.js';

import { PlainHandler, PlainDeleteHandler } from './handlers/plain-handler.js';
import { CardTypeAddCustomFieldHandler } from './handlers/card-type-add-custom-field.js';
import { CardTypeRemoveCustomFieldHandler } from './handlers/card-type-remove-custom-field.js';
import { CardTypeWorkflowChangeHandler } from './handlers/card-type-workflow-change.js';
import { CardTypeRenameHandler } from './handlers/card-type-rename.js';
import { CardTypeDeleteHandler } from './handlers/card-type-delete.js';
import { FieldTypeDataTypeHandler } from './handlers/field-type-data-type.js';
import { FieldTypeEnumRemoveHandler } from './handlers/field-type-enum-remove.js';
import { FieldTypeEnumRenameHandler } from './handlers/field-type-enum-rename.js';
import { FieldTypeRenameHandler } from './handlers/field-type-rename.js';
import { FieldTypeDeleteHandler } from './handlers/field-type-delete.js';
import { WorkflowRemoveStateHandler } from './handlers/workflow-remove-state.js';
import { WorkflowRenameStateHandler } from './handlers/workflow-rename-state.js';
import { WorkflowRenameHandler } from './handlers/workflow-rename.js';
import { WorkflowDeleteHandler } from './handlers/workflow-delete.js';
import { LinkTypeRenameHandler } from './handlers/link-type-rename.js';
import { LinkTypeDeleteHandler } from './handlers/link-type-delete.js';
import { LeafResourceRenameHandler } from './handlers/leaf-resource-rename.js';
import { ProjectRenameHandler } from './handlers/project-rename.js';

/**
 * A route → handler pair. Discriminated by `route.kind`: each member ties the
 * handler to the input variant its route is guaranteed to dispatch, so pairing
 * a route with a handler built for a different variant (e.g. a `rename` route
 * with a `Handler<EditInput>`) is a compile error. The array below is therefore
 * plain data — the kind mismatch is caught structurally, with no helper.
 */
export type Registration =
  | {
      route: RouteKey & { kind: 'edit' };
      handler: Handler<EditInput>;
      breaking: boolean;
    }
  | {
      route: RouteKey & { kind: 'delete' };
      handler: Handler<DeleteInput>;
      breaking: boolean;
    }
  | {
      route: RouteKey & { kind: 'rename' };
      handler: Handler<RenameInput>;
      breaking: boolean;
    }
  | {
      route: RouteKey & { kind: 'project_rename' };
      handler: Handler<ProjectRenameInput>;
      breaking: boolean;
    };

const plain = new PlainHandler();
const plainDelete = new PlainDeleteHandler();

const cardTypeAddCustomField = new CardTypeAddCustomFieldHandler();
const cardTypeRemoveCustomField = new CardTypeRemoveCustomFieldHandler();
const cardTypeWorkflowChange = new CardTypeWorkflowChangeHandler();
const cardTypeRename = new CardTypeRenameHandler();
const cardTypeDelete = new CardTypeDeleteHandler();
const fieldTypeDataType = new FieldTypeDataTypeHandler();
const fieldTypeEnumRemove = new FieldTypeEnumRemoveHandler();
const fieldTypeEnumRename = new FieldTypeEnumRenameHandler();
const fieldTypeRename = new FieldTypeRenameHandler();
const fieldTypeDelete = new FieldTypeDeleteHandler();
const workflowRemoveState = new WorkflowRemoveStateHandler();
const workflowRenameState = new WorkflowRenameStateHandler();
const workflowRename = new WorkflowRenameHandler();
const workflowDelete = new WorkflowDeleteHandler();
const linkTypeRename = new LinkTypeRenameHandler();
const linkTypeDelete = new LinkTypeDeleteHandler();
const projectRename = new ProjectRenameHandler();

// Key-wildcard plain edit rows: route.op = undefined, breaking: false.
function plainEdit(type: string, key: string): Registration {
  return {
    route: { kind: 'edit', type, key },
    handler: plain,
    breaking: false,
  };
}

const wildcardEditKeys: Record<string, string[]> = {
  cardTypes: [
    'displayName',
    'description',
    'category',
    'workflow',
    'customFields',
    'alwaysVisibleFields',
    'optionallyVisibleFields',
  ],
  fieldTypes: [
    'displayName',
    'description',
    'category',
    'dataType',
    'enumValues',
  ],
  workflows: [
    'displayName',
    'description',
    'category',
    'states',
    'transitions',
  ],
  linkTypes: [
    'displayName',
    'description',
    'category',
    'outboundDisplayName',
    'inboundDisplayName',
    'sourceCardTypes',
    'destinationCardTypes',
    'destinationConnectors',
    'enableLinkDescription',
  ],
  templates: ['displayName', 'description', 'category'],
  calculations: [
    'displayName',
    'description',
    'category',
    'calculation',
    'content',
  ],
  reports: ['displayName', 'description', 'category', 'content'],
  graphModels: ['displayName', 'description', 'category', 'content'],
  graphViews: ['displayName', 'description', 'category', 'content'],
  skills: ['displayName', 'description', 'category', 'relatedTools', 'content'],
};

export const ROUTES: Registration[] = [
  // EDIT — specific (exact op) rows.
  {
    route: { kind: 'edit', type: 'cardTypes', key: 'customFields', op: 'add' },
    handler: cardTypeAddCustomField,
    breaking: true,
  },
  {
    route: {
      kind: 'edit',
      type: 'cardTypes',
      key: 'customFields',
      op: 'remove',
    },
    handler: cardTypeRemoveCustomField,
    breaking: true,
  },
  {
    route: { kind: 'edit', type: 'cardTypes', key: 'workflow', op: 'change' },
    handler: cardTypeWorkflowChange,
    breaking: true,
  },
  {
    route: { kind: 'edit', type: 'fieldTypes', key: 'dataType', op: 'change' },
    handler: fieldTypeDataType,
    breaking: true,
  },
  {
    route: {
      kind: 'edit',
      type: 'fieldTypes',
      key: 'enumValues',
      op: 'remove',
    },
    handler: fieldTypeEnumRemove,
    breaking: true,
  },
  {
    route: {
      kind: 'edit',
      type: 'fieldTypes',
      key: 'enumValues',
      op: 'rename-member',
    },
    handler: fieldTypeEnumRename,
    breaking: true,
  },
  {
    route: { kind: 'edit', type: 'workflows', key: 'states', op: 'remove' },
    handler: workflowRemoveState,
    breaking: true,
  },
  {
    route: {
      kind: 'edit',
      type: 'workflows',
      key: 'states',
      op: 'rename-member',
    },
    handler: workflowRenameState,
    breaking: true,
  },

  // EDIT — key-wildcard plain rows.
  ...Object.entries(wildcardEditKeys).flatMap(([type, keys]) =>
    keys.map((key) => plainEdit(type, key)),
  ),

  // RENAME rows.
  {
    route: { kind: 'rename', type: 'cardTypes' },
    handler: cardTypeRename,
    breaking: true,
  },
  {
    route: { kind: 'rename', type: 'fieldTypes' },
    handler: fieldTypeRename,
    breaking: true,
  },
  {
    route: { kind: 'rename', type: 'linkTypes' },
    handler: linkTypeRename,
    breaking: true,
  },
  {
    route: { kind: 'rename', type: 'workflows' },
    handler: workflowRename,
    breaking: true,
  },
  {
    route: { kind: 'rename', type: 'templates' },
    handler: new LeafResourceRenameHandler('templates', 'Template'),
    breaking: true,
  },
  {
    route: { kind: 'rename', type: 'calculations' },
    handler: new LeafResourceRenameHandler('calculations', 'Calculation'),
    breaking: true,
  },
  {
    route: { kind: 'rename', type: 'reports' },
    handler: new LeafResourceRenameHandler('reports', 'Report'),
    breaking: true,
  },
  {
    route: { kind: 'rename', type: 'graphModels' },
    handler: new LeafResourceRenameHandler('graphModels', 'Graph model'),
    breaking: true,
  },
  {
    route: { kind: 'rename', type: 'graphViews' },
    handler: new LeafResourceRenameHandler('graphViews', 'Graph view'),
    breaking: true,
  },
  {
    route: { kind: 'rename', type: 'skills' },
    handler: new LeafResourceRenameHandler('skills', 'Skill'),
    breaking: true,
  },

  // DELETE rows.
  {
    route: { kind: 'delete', type: 'cardTypes' },
    handler: cardTypeDelete,
    breaking: true,
  },
  {
    route: { kind: 'delete', type: 'linkTypes' },
    handler: linkTypeDelete,
    breaking: true,
  },
  {
    route: { kind: 'delete', type: 'fieldTypes' },
    handler: fieldTypeDelete,
    breaking: true,
  },
  {
    route: { kind: 'delete', type: 'workflows' },
    handler: workflowDelete,
    breaking: true,
  },
  {
    route: { kind: 'delete', type: 'templates' },
    handler: plainDelete,
    breaking: false,
  },
  {
    route: { kind: 'delete', type: 'calculations' },
    handler: plainDelete,
    breaking: false,
  },
  {
    route: { kind: 'delete', type: 'reports' },
    handler: plainDelete,
    breaking: false,
  },
  {
    route: { kind: 'delete', type: 'graphModels' },
    handler: plainDelete,
    breaking: false,
  },
  {
    route: { kind: 'delete', type: 'graphViews' },
    handler: plainDelete,
    breaking: false,
  },
  {
    route: { kind: 'delete', type: 'skills' },
    handler: plainDelete,
    breaking: false,
  },

  // PROJECT_RENAME row.
  { route: { kind: 'project_rename' }, handler: projectRename, breaking: true },
];
