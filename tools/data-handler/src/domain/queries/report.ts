// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import Handlebars, { type HelperOptions } from 'handlebars';
import type { CalculationEngine } from '../../state/engine/calculation-engine.js';
import {
  createInlineHtmlPlaceholder,
  registerEmptyMacros,
  validateMacroContent,
} from '../macros/registry.js';
import type {
  ActionButtonOptions,
  ActionMacroOptions,
  Context,
} from '@cyberismo/model';
import actionMetadata from '@cyberismo/model/macros/action/metadata';
import {
  registerClingoHelpers,
  registerComparisonHelpers,
  registerMathHelpers,
  registerQuotedHelper,
  registerReportHelpers,
} from './handlebars-helpers.js';
import { DHValidationError } from '../../shared/exceptions/index.js';
import { LogicInvalidError } from '../../infra/logic/logic-backend.js';

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
  /**
   * The card the report is rendered on, given only when action buttons are
   * rendered. Inside an `action` block, `cardKey` is this card, whatever the
   * report parameters say. Without it, an action block renders nothing.
   */
  actionCardKey?: string;
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
    actionCardKey,
  } = params;

  const handlebars = Handlebars.create();
  registerComparisonHelpers(handlebars);
  registerMathHelpers(handlebars);
  registerQuotedHelper(handlebars);
  registerClingoHelpers(handlebars);

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
      ? new LogicInvalidError(result.error)
      : new Error(result.error);
  }
  // register empty macros so that other macros aren't touched yet
  registerEmptyMacros(handlebars);
  registerReportHelpers(handlebars);
  // Inside an action block, `{{{cardKey}}}` is the action card; elsewhere
  // it is what the context holds, as without the helper. The context itself
  // is left as it is.
  let inAction = false;
  handlebars.registerHelper('cardKey', function (this: unknown) {
    return inAction
      ? actionCardKey
      : (this as { cardKey?: unknown } | null | undefined)?.cardKey;
  });
  // Replaces the re-emitting helper: an action block never leaves a report.
  handlebars.registerHelper(
    actionMetadata.name,
    function (this: unknown, options: HelperOptions) {
      // Without the card, nothing is rendered, whatever the body would be.
      if (!actionCardKey) return '';
      let body: string;
      inAction = true;
      try {
        body = options.fn(this);
      } finally {
        inAction = false;
      }
      let input: unknown;
      try {
        input = JSON.parse(`{${body}}`);
      } catch (error) {
        throw new Error(
          `${actionMetadata.name} macro JSON error: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        );
      }
      const { buttonLabel, actions } = validateMacroContent<ActionMacroOptions>(
        actionMetadata,
        input,
      );
      return createInlineHtmlPlaceholder(actionMetadata, {
        buttonLabel,
        cardKey: actionCardKey,
        programs: actions,
      } satisfies ActionButtonOptions);
    },
  );

  return render(contentTemplate, { ...options, ...result }, contentRequested);
}
