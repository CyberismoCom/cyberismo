/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2024
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/**
 * Types for query result
 */

import type {
  DataType,
  WorkflowCategory,
} from '../interfaces/resource-interfaces.js';

export type LinkDirection = 'inbound' | 'outbound';

export type StatusIndicator = WorkflowCategory | 'error';

export interface CalculationLink {
  displayName: string;
  key: string;
  linkType: string;
  title: string; // title of the other card
  linkDescription?: string;
  direction: LinkDirection;
  linkSource: 'user' | 'calculated';
}

export interface Notification {
  key: string;
  category: string;
  title: string;
  message: string;
}

export interface PolicyCheckCollection {
  successes: { category: string; title: string }[];
  failures: {
    category: string;
    title: string;
    errorMessage: string;
    fieldName?: string;
  }[];
}

export interface DeniedOperationCollection {
  transition: { transitionName: string; errorMessage: string }[];
  move: { errorMessage: string }[];
  delete: { errorMessage: string }[];
  editField: { fieldName: string; errorMessage: string }[];
  editContent: { errorMessage: string }[];
}

export interface BaseResult extends Record<string, unknown> {
  key: string;
  labels: string[];
  links: CalculationLink[];
  notifications: Notification[];
  policyChecks: PolicyCheckCollection;
  deniedOperations: DeniedOperationCollection;
}

export interface ParseResult<T extends BaseResult> {
  results: T[];
  error: string | null;
}

/**
 * Generic types for named queries
 */

export const queries = ['card', 'onCreation', 'onTransition', 'tree'] as const;

export type QueryName = (typeof queries)[number];

export type QueryMap = {
  card: CardQueryResult;
  onCreation: FieldsToUpdateQueryResult;
  onTransition: FieldsToUpdateQueryResult;
  tree: TreeQueryResult;
};
export type QueryResult<T extends QueryName> = QueryMap[T];

/**
 * Define all the queries below
 */
interface CardQueryResult extends BaseResult {
  progress?: string;
  rank: string;
  title: string;
  cardType: string;
  workflowState: string;
  lastUpdated: string;
  fields?: CardQueryField[];
}
interface FieldsToUpdateQueryResult extends BaseResult {
  updateFields: UpdateField[];
}
interface TreeQueryResult extends BaseResult {
  progress?: string;
  rank: string;
  title: string;
  cardType: string;
  statusIndicator?: StatusIndicator;
  children?: TreeQueryResult[];
}

export interface UpdateField {
  card: string;
  field: string;
  newValue: string;
}

interface EnumValue {
  index?: number;
  displayValue?: string;
  value: string;
}

interface ListValueItem {
  index?: number;
  displayValue?: string;
  value: string;
}

interface CardQueryField extends BaseResult {
  visibility: 'always' | 'optional';
  index: number;
  fieldDisplayName: string;
  fieldDescription: string;
  dataType: DataType;
  isCalculated: boolean;
  value: string | number | boolean | null | EnumValue | ListValueItem[];
  enumValues: EnumDefinition[];
}

export interface EnumDefinition extends BaseResult {
  index: number;
  enumDisplayValue: string;
  enumDescription: string;
  enumValue: string;
}
