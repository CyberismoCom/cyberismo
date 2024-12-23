/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

/**
 * Types for query result
 */

import {
  DataType,
  WorkflowCategory,
} from '../interfaces/resource-interfaces.js';

export interface CalculationLink {
  displayName: string;
  key: string;
  linkType: string;
  title: string; // title of the other card
  linkDescription?: string;
  direction: 'inbound' | 'outbound';
}

export interface Notification {
  key: string;
  category: string;
  title: string;
  message: string;
}

export interface PolicyCheckCollection {
  successes: { category: string; title: string }[];
  failures: { category: string; title: string; errorMessage: string }[];
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

export const queries = ['tree', 'card'] as const;

export type QueryName = (typeof queries)[number];

export type QueryMap = {
  tree: TreeQueryResult;
  card: CardQueryResult;
};
export type QueryResult<T extends QueryName> = QueryMap[T];

/**
 * Define all the queries below
 */
interface TreeQueryResult extends BaseResult {
  'base/fieldTypes/progress'?: string;
  rank: string;
  title: string;
  cardType: string;
  workflowStateCategory?: WorkflowCategory;
  children?: TreeQueryResult[];
}

interface CardQueryResult extends BaseResult {
  'base/fieldTypes/progress'?: string;
  rank: string;
  title: string;
  cardType: string;
  workflowState: string;
  lastUpdated: string;
  fields?: CardQueryField[];
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
  isEditable: boolean;
  value: string | number | boolean | null | EnumValue | ListValueItem[];
  enumValues: EnumDefinition[];
}

export interface EnumDefinition extends BaseResult {
  index: number;
  enumDisplayValue: string;
  enumDescription: string;
  enumValue: string;
}
