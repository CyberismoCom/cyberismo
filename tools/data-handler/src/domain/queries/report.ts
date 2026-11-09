// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import Handlebars from 'handlebars';
import type { CalculationEngine } from '../../state/engine/calculation-engine.js';
import { registerEmptyMacros } from '../macros/registry.js';
import type { Context } from '@cyberismo/model';
import {
  registerComparisonHelpers,
  registerMathHelpers,
  registerQuotedHelper,
  registerReportHelpers,
} from './handlebars-helpers.js';
import { DHValidationError } from '../../shared/exceptions/index.js';
import { LogicError } from '../../infra/logic/logic-backend.js';

/**
 * Parameters for the core generation function
 */
interface GenerateReportContentParams {
  calculate: CalculationEngine;
  contentTemplate: string;
  queryTemplate: string;
  options: Record<string, string | number | boolean | undefined>;
  context: Context;
  /**
   * The query template comes with the request, not from the project: one
   * that does not render fails as a validation error, and a query that is
   * wrong as an invalid logic failure.
   */
  requested?: boolean;
  /**
   * The content template comes with the request: one that does not render
   * fails as a validation error.
   */
  contentRequested?: boolean;
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
  const {
    calculate,
    contentTemplate,
    queryTemplate,
    options,
    context,
    requested,
    contentRequested,
  } = params;

  const handlebars = Handlebars.create();
  registerComparisonHelpers(handlebars);
  registerMathHelpers(handlebars);
  registerQuotedHelper(handlebars);

  const render = (
    template: string,
    data: object,
    fromRequest: boolean | undefined,
    strict = false,
  ) => {
    try {
      return handlebars.compile(template, { strict })(data);
    } catch (error) {
      if (fromRequest && error instanceof Error) {
        throw new DHValidationError(error.message);
      }
      throw error;
    }
  };

  // When the query is empty, skip the logic program entirely and render the
  // content template using only the macro parameter context.
  const result =
    (queryTemplate ?? '').trim() === ''
      ? { results: [], error: null }
      : await calculate.runLogicProgram(
          render(queryTemplate, options, requested, true),
          context,
          requested,
        );

  if (result.error) {
    throw requested
      ? new LogicError('invalid', result.error)
      : new Error(result.error);
  }
  // register empty macros so that other macros aren't touched yet
  registerEmptyMacros(handlebars);
  registerReportHelpers(handlebars);

  return render(contentTemplate, { ...options, ...result }, contentRequested);
}
