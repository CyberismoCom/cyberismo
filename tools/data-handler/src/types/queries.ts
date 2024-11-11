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

import { WorkflowCategory } from '../interfaces/resource-interfaces.js';

export interface CalculationLink {
  key: string;
  linkType: string;
  displayName: string;
  linkDescription?: string;
}

export interface PolicyCheckCollection {
  successes: { testSuite: string; testCase: string }[];
  failures: { testSuite: string; testCase: string; errorMessage: string }[];
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
  policyChecks: PolicyCheckCollection;
  deniedOperations: DeniedOperationCollection;
  results: BaseResult[]; // Nested results
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
  workflowStateCategory?: WorkflowCategory;
  results: TreeQueryResult[];
}

interface CardQueryResult extends BaseResult {
  'base/fieldTypes/progress'?: string;
  rank: string;
  title: string;
  workflowState: string;
  lastUpdated: string;
  results: [];
}
