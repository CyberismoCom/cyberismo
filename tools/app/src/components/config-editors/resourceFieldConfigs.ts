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

import type { AnyNode, ResourceNode } from '@/lib/api/types';
import type { CardType } from '@cyberismo/data-handler/interfaces/resource-interfaces';

export type FieldType =
  | 'identifier'
  | 'text'
  | 'textarea'
  | 'select'
  | 'multiselect'
  | 'boolean';

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

const dataTypeOptions = [
  'boolean',
  'date',
  'dateTime',
  'enum',
  'integer',
  'list',
  'longText',
  'number',
  'person',
  'shortText',
].map((dt) => ({ id: dt, displayName: dt }));

// Helper functions for options
const getWorkflowOptions = (resourceTree: AnyNode[]) =>
  resourceTree
    .flatMap((group) => group.children || [])
    .filter((g) => g.type === 'workflows')
    .map((w) => ({ id: w.name, displayName: w.data.displayName || w.name }));

const getFieldTypeOptions = (resourceTree: AnyNode[]) =>
  resourceTree
    .flatMap((group) => group.children || [])
    .filter((g) => g.type === 'fieldTypes')
    .map((f) => ({ id: f.name, displayName: f.data.displayName || f.name }));

const getCardTypeOptions = (resourceTree: AnyNode[]) =>
  resourceTree
    .flatMap((group) => group.children || [])
    .filter((g) => g.type === 'cardTypes')
    .map((c) => ({ id: c.name, displayName: c.data.displayName || c.name }));

// Get only field types that are defined in customFields for this card type
const getCustomFieldOptions = (
  resourceTree: AnyNode[],
  currentNode: ResourceNode,
) => {
  if (currentNode.type !== 'cardTypes' || !('data' in currentNode)) return [];

  const cardTypeData = currentNode.data as CardType;
  const customFieldNames = (cardTypeData.customFields || []).map(
    (cf) => cf.name,
  );

  return getFieldTypeOptions(resourceTree).filter((option) =>
    customFieldNames.includes(option.id),
  );
};

// Get custom field options for alwaysVisibleFields (exclude optionallyVisibleFields)
const getAlwaysVisibleFieldOptions = (
  resourceTree: AnyNode[],
  currentNode: ResourceNode,
) => {
  if (currentNode.type !== 'cardTypes' || !('data' in currentNode)) return [];

  const cardTypeData = currentNode.data as CardType;
  const optionallyVisible = cardTypeData.optionallyVisibleFields || [];

  return getCustomFieldOptions(resourceTree, currentNode).filter(
    (option) => !optionallyVisible.includes(option.id),
  );
};

// Get custom field options for optionallyVisibleFields (exclude alwaysVisibleFields)
const getOptionallyVisibleFieldOptions = (
  resourceTree: AnyNode[],
  currentNode: ResourceNode,
) => {
  if (currentNode.type !== 'cardTypes' || !('data' in currentNode)) return [];

  const cardTypeData = currentNode.data as CardType;
  const alwaysVisible = cardTypeData.alwaysVisibleFields || [];

  return getCustomFieldOptions(resourceTree, currentNode).filter(
    (option) => !alwaysVisible.includes(option.id),
  );
};

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
        key: 'alwaysVisibleFields',
        type: 'multiselect',
        label: 'alwaysVisibleFields',
        options: getAlwaysVisibleFieldOptions,
      },
      {
        key: 'optionallyVisibleFields',
        type: 'multiselect',
        label: 'optionallyVisibleFields',
        options: getOptionallyVisibleFieldOptions,
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
