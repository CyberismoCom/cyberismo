// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import Handlebars from 'handlebars';
import macroMetadata from '@cyberismo/model/macros/graph/metadata';

import type { Context, GraphOptions } from '@cyberismo/model';
import type { Checkout } from '../../../state/checkout/checkout.js';
import { ResourceNotFoundError } from '../../../shared/exceptions/index.js';
import { validateMacroContent } from '../registry.js';
import {
  LogicError,
  LogicUnavailableError,
} from '../../../infra/logic/logic-backend.js';
import { registerComparisonHelpers } from '../../queries/handlebars-helpers.js';

/**
 * Checks graph options against the graph macro schema and, if the view
 * has one, the view's own schema.
 * @param input Graph options: model and view names and any view parameters.
 * @throws if the view does not exist or the options do not validate.
 */
export function validateGraphOptions(
  checkout: Checkout,
  input: unknown,
): GraphOptions {
  const options = validateMacroContent<GraphOptions>(macroMetadata, input);
  const schema = graphView(checkout, options.view).contentData().schema;
  if (schema) {
    validateMacroContent(macroMetadata, input, schema);
  }
  return options;
}

/**
 * Renders a graph from a graph model and a graph view resource.
 * The view template is compiled with the card key and the options, so a
 * view can refer to `{{cardKey}}` and to its own parameters.
 * @param options Validated graph options (see validateGraphOptions).
 * @param cardKey Card the graph is drawn for, if any. Reaches the logic
 *   program as is, so the caller must make sure the card exists.
 * @returns base64-encoded sanitized SVG.
 * @throws if a resource is missing, the view has no template or the logic
 *   program fails.
 */
export async function renderGraph(
  checkout: Checkout,
  options: GraphOptions,
  cardKey: string | undefined,
  context: Context,
): Promise<string> {
  const model = graphModel(checkout, options.model).contentData().model;
  const viewTemplate = graphView(checkout, options.view).contentData()
    .viewTemplate;
  if (!viewTemplate) {
    throw new Error(`Graph: View ${options.view} has no view template`);
  }

  const handlebars = Handlebars.create();
  registerComparisonHelpers(handlebars);
  const view = handlebars.compile(viewTemplate)({ cardKey, ...options });

  try {
    return await checkout.calculationEngine.runGraph(
      model ?? '',
      view,
      context,
    );
  } catch (error) {
    // A backend that cannot answer now fails the whole render.
    if (
      !(error instanceof LogicError) ||
      error instanceof LogicUnavailableError
    ) {
      throw error;
    }
    const hint = cardKey ? '' : ' (the view may need a cardKey)';
    throw new Error(
      `Error running graph in view '${options.view}' in model '${options.model}'${hint}: ${error.errors.join('\n')}`,
      { cause: error },
    );
  }
}

// The resource cache hands out an empty resource for an unknown name, so
// check that the resource exists before reading it.
function graphModel(checkout: Checkout, name: string) {
  const resource = checkout.resources.byType(name, 'graphModels');
  if (!resource.data) {
    throw new ResourceNotFoundError(name);
  }
  return resource;
}

function graphView(checkout: Checkout, name: string) {
  const resource = checkout.resources.byType(name, 'graphViews');
  if (!resource.data) {
    throw new ResourceNotFoundError(name);
  }
  return resource;
}
