/**
 * Types for query result
 */

import { workflowCategory } from '../interfaces/project-interfaces.js';

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

export const queries = ['tree'] as const;

export type QueryName = (typeof queries)[number];

export type QueryMap = {
  tree: TreeQueryResult;
};
export type QueryResult<T extends QueryName> = QueryMap[T];

/**
 * Define all the queries below
 */
interface TreeQueryResult extends BaseResult {
  'base/fieldtypes/progress'?: string;
  rank: string;
  title: string;
  workflowStateCategory?: workflowCategory;
  results: TreeQueryResult[];
}
