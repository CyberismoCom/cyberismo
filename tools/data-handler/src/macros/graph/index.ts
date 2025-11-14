/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2024
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import BaseMacro from '../base-macro.js';
import { createImage, validateMacroContent } from '../index.js';
import Handlebars from 'handlebars';
import macroMetadata from './metadata.js';
import { ClingoError } from '@cyberismo/node-clingo';

import type { GraphOptions } from './types.js';
import type { MacroGenerationContext } from '../../interfaces/macros.js';
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

    const modelResource = context.project.resources.byType(
      options.model,
      'graphModels',
    );
    const modelContent = modelResource.contentData();

    const viewResource = context.project.resources.byType(
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
    const view = handlebars.compile(viewContent.viewTemplate)(
      handlebarsContext,
    );

    let result: string;
    try {
      result = await context.project.calculationEngine.runGraph(
        modelContent.model,
        view,
        context.context,
      );
    } catch (error) {
      if (error instanceof ClingoError) {
        throw new Error(
          `Error running graph in view '${options.view}' in model '${options.model}': ${error.details.errors.join('\n')}`,
        );
      }
      throw error;
    }

    if (typeof result !== 'string') {
      throw new Error(
        'Graph macro expected a string from clingo, but received an object',
      );
    }
    return createImage(result);
  };

  private parseOptions(
    input: unknown,
    context: MacroGenerationContext,
  ): GraphOptions {
    const options = validateMacroContent<GraphOptions>(this.metadata, input);

    // Get schema from view resource content if available
    const resource = context.project.resources.byType(
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
