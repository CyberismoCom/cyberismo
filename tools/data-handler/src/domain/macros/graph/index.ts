// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import BaseMacro from '../base-macro.js';
import { createImage, validateMacroContent } from '../registry.js';
import { registerComparisonHelpers } from '../../queries/handlebars-helpers.js';
import Handlebars from 'handlebars';
import macroMetadata from '@cyberismo/model/macros/graph/metadata';
import { ClingoError } from '@cyberismo/node-clingo';

import type { GraphOptions } from '@cyberismo/model';
import type { MacroGenerationContext } from '../../../shared/interfaces/macros.js';
import type TaskQueue from '../task-queue.js';

class GraphMacro extends BaseMacro {
  constructor(tasksQueue: TaskQueue) {
    super(macroMetadata, tasksQueue);
  }

  handleValidate = (context: MacroGenerationContext, input: unknown) => {
    this.parseOptions(input, context);
  };

  handleStatic = async (context: MacroGenerationContext, input: unknown) => {
    const options = this.parseOptions(input, context);

    const modelResource = context.checkout.resources.byType(
      options.model,
      'graphModels',
    );
    const modelContent = modelResource.contentData();

    const viewResource = context.checkout.resources.byType(
      options.view,
      'graphViews',
    );
    const viewContent = viewResource.contentData();
    if (!viewContent.viewTemplate) {
      throw new Error(`Graph: View ${options.view} has no view template`);
    }

    const handlebarsContext = {
      cardKey: context.cardKey,
      ...options,
    };

    const handlebars = Handlebars.create();
    registerComparisonHelpers(handlebars);
    const view = handlebars.compile(viewContent.viewTemplate)(
      handlebarsContext,
    );

    let result: string;
    try {
      result = await context.checkout.calculationEngine.runGraph(
        modelContent.model,
        view,
        context.context,
      );
    } catch (error) {
      if (error instanceof ClingoError) {
        throw new Error(
          `Error running graph in view '${options.view}' in model '${options.model}': ${error.details.errors.join('\n')}`,
          { cause: error },
        );
      }
      throw error;
    }

    if (typeof result !== 'string') {
      throw new Error(
        'Graph macro expected a string from clingo, but received an object',
      );
    }
    return createImage(result, context.mode);
  };

  private parseOptions(
    input: unknown,
    context: MacroGenerationContext,
  ): GraphOptions {
    const options = validateMacroContent<GraphOptions>(this.metadata, input);

    // Get schema from view resource content if available
    const resource = context.checkout.resources.byType(
      options.view,
      'graphViews',
    );
    const content = resource.contentData();
    const schema = content.schema;

    if (schema) {
      validateMacroContent(this.metadata, input, schema);
    }

    return options;
  }
}

export default GraphMacro;
