// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import Handlebars from 'handlebars';
import type { CalculationEngine } from '../../state/engine/calculation-engine.js';
import { registerEmptyMacros } from '../macros/registry.js';
import type { Context } from '@cyberismo/model';
import {
  registerComparisonHelpers,
  registerMathHelpers,
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
  const { calculate, contentTemplate, queryTemplate, options, context } =
    params;

  const handlebars = Handlebars.create();
  registerComparisonHelpers(handlebars);
  registerMathHelpers(handlebars);

  // When the query is empty, skip the logic program entirely and render the
  // content template using only the macro parameter context.
  const result =
    (queryTemplate ?? '').trim() === ''
      ? { results: [], error: null }
      : await calculate.runLogicProgram(
          handlebars.compile(queryTemplate, { strict: true })(options),
          context,
        );

  if (result.error) {
    throw new Error(result.error);
  }
  // register empty macros so that other macros aren't touched yet
  registerEmptyMacros(handlebars);
  registerReportHelpers(handlebars);

  return handlebars.compile(contentTemplate)({
    ...options,
    ...result,
  });
}
