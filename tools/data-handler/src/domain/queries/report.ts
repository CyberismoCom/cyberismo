// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import Handlebars from 'handlebars';
import type { CalculationEngine } from '../../state/engine/calculation-engine.js';
import { registerEmptyMacros } from '../macros/registry.js';
import type { BaseResult, Context, ParseResult } from '@cyberismo/model';
import {
  registerComparisonHelpers,
  registerMathHelpers,
  registerQuotedHelper,
  registerReportHelpers,
} from './handlebars-helpers.js';

/**
 * Parameters for the core generation function
 */
interface GenerateReportContentParams {
  calculate: CalculationEngine;
  contentTemplate: string;
  queryTemplate: string;
  options: Record<string, string | number | boolean | undefined>;
  context: Context;
}

type ReportQueryParams = Omit<GenerateReportContentParams, 'contentTemplate'>;

function createHandlebars() {
  const handlebars = Handlebars.create();
  registerComparisonHelpers(handlebars);
  registerMathHelpers(handlebars);
  registerQuotedHelper(handlebars);
  return handlebars;
}

/**
 * Runs the query of a report. An empty query skips the logic program and
 * gives no results.
 * @throws Error if the logic program fails.
 */
export async function runReportQuery(
  params: ReportQueryParams,
): Promise<ParseResult<BaseResult>> {
  const { calculate, queryTemplate, options, context } = params;
  // When the query is empty, skip the logic program entirely and render the
  // content template using only the macro parameter context.
  const result =
    (queryTemplate ?? '').trim() === ''
      ? { results: [], error: null }
      : await calculate.runLogicProgram(
          createHandlebars().compile(queryTemplate, { strict: true })(options),
          context,
        );

  if (result.error) {
    throw new Error(result.error);
  }
  return result;
}

/**
 * Renders the content template of a report with the results of its query.
 * Macros in the template are left for a later pass.
 */
export function renderReportContent(
  contentTemplate: string,
  options: GenerateReportContentParams['options'],
  result: ParseResult<BaseResult>,
): string {
  const handlebars = createHandlebars();
  // register empty macros so that other macros aren't touched yet
  registerEmptyMacros(handlebars);
  registerReportHelpers(handlebars);

  return handlebars.compile(contentTemplate)({
    ...options,
    ...result,
  });
}

/**
 * Generates report content based on a report definition, project context, and options,
 * by utilizing the ReportRunner class.
 *
 * @param params - The parameters for report generation.
 * @returns The rendered report content as a string.
 * @throws Error if the report definition is invalid, schema validation fails, or logic program execution fails.
 */
export async function generateReportContent(
  params: GenerateReportContentParams,
): Promise<string> {
  return renderReportContent(
    params.contentTemplate,
    params.options,
    await runReportQuery(params),
  );
}
