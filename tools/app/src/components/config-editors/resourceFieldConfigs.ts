/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2025
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import type {
  AnyNode,
  ResourceNode,
  NodeKey,
  NodeTypeMap,
} from '@/lib/api/types';
import { DATA_TYPES } from '@/lib/constants';

export type FieldType =
  | 'identifier'
  | 'text'
  | 'textarea'
  | 'select'
  | 'multiselect'
  | 'boolean'
  | 'cardFields'
  | 'enumValues';

export interface FieldConfig {
  key: string;
  type: FieldType;
  label: string;
  options?: (
    resourceTree: AnyNode[],
    currentNode: ResourceNode,
  ) => Array<{ id: string; displayName: string }>;
  staticOptions?: Array<{ id: string; displayName: string }>;
}

const commonFields: FieldConfig[] = [
  { key: 'name', type: 'identifier', label: 'identifier' },
  { key: 'displayName', type: 'text', label: 'displayName' },
  { key: 'description', type: 'textarea', label: 'description' },
];

const dataTypeOptions = DATA_TYPES.map((dt) => ({ id: dt, displayName: dt }));

type NodeByType<T extends NodeKey> = NodeTypeMap[T];

const collectByType = <T extends NodeKey>(
  nodes: AnyNode[],
  type: T,
): NodeByType<T>[] =>
  nodes.flatMap((node) =>
    node.type === type
      ? [node as NodeByType<T>]
      : node.children
        ? collectByType(node.children, type)
        : [],
  );

// Helper functions for options
const getWorkflowOptions = (resourceTree: AnyNode[]) =>
  collectByType(resourceTree, 'workflows').map((w) => ({
    id: w.name,
    displayName: w.data.displayName || w.name,
  }));

export const getFieldTypeOptions = (resourceTree: AnyNode[]) =>
  collectByType(resourceTree, 'fieldTypes').map((f) => ({
    id: f.name,
    displayName: f.data.displayName || f.name,
  }));

const getCardTypeOptions = (resourceTree: AnyNode[]) =>
  collectByType(resourceTree, 'cardTypes').map((c) => ({
    id: c.name,
    displayName: c.data.displayName || c.name,
  }));

export const resourceFieldConfigs: Record<ResourceNode['type'], FieldConfig[]> =
  {
    cardTypes: [
      ...commonFields,
      {
        key: 'workflow',
        type: 'select',
        label: 'workflow',
        options: getWorkflowOptions,
      },
      {
        key: 'customFields',
        type: 'cardFields',
        label: 'customFields',
      },
    ],
    fieldTypes: [
      ...commonFields,
      {
        key: 'dataType',
        type: 'select',
        label: 'dataType',
        staticOptions: dataTypeOptions,
      },
      {
        key: 'enumValues',
        type: 'enumValues',
        label: 'enumValues',
      },
    ],
    linkTypes: [
      ...commonFields,
      {
        key: 'outboundDisplayName',
        type: 'text',
        label: 'outboundDisplayName',
      },
      { key: 'inboundDisplayName', type: 'text', label: 'inboundDisplayName' },
      {
        key: 'enableLinkDescription',
        type: 'boolean',
        label: 'enableLinkDescription',
      },
      {
        key: 'sourceCardTypes',
        type: 'multiselect',
        label: 'sourceCardTypes',
        options: getCardTypeOptions,
      },
      {
        key: 'destinationCardTypes',
        type: 'multiselect',
        label: 'destinationCardTypes',
        options: getCardTypeOptions,
      },
    ],
    calculations: [...commonFields],
    graphModels: [...commonFields],
    graphViews: [...commonFields],
    reports: [...commonFields],
    templates: [...commonFields],
    workflows: [...commonFields],
  };
