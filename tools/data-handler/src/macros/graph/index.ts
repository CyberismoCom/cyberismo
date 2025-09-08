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
import type { MacroGenerationContext } from '../../interfaces/macros.js';
import macroMetadata from './metadata.js';
import { pathExists } from '../../utils/file-utils.js';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import type { Schema } from 'jsonschema';
import type TaskQueue from '../task-queue.js';
import { ClingoError } from '@cyberismo/node-clingo';
import { resourceFilePath } from '../../utils/resource-utils.js';
import { resourceName } from '../../utils/resource-utils.js';

export interface GraphOptions {
  model: string;
  view: string;
}

class ReportMacro extends BaseMacro {
  constructor(tasksQueue: TaskQueue) {
    super(macroMetadata, tasksQueue);
  }

  handleValidate = (context: MacroGenerationContext, input: unknown) => {
    this.parseOptions(input, context);
  };

  handleStatic = async (context: MacroGenerationContext, input: unknown) => {
    const options = this.parseOptions(input, context);

    const modelLocation = resourceFilePath(
      context.project,
      resourceName(options.model),
      'model.lp',
    );
    const viewLocation = resourceFilePath(
      context.project,
      resourceName(options.view),
      'view.lp.hbs',
    );

    if (!pathExists(modelLocation)) {
      throw new Error(`Graph: Model ${options.model} does not exist`);
    }

    let viewContent = '';
    try {
      viewContent = await readFile(viewLocation, { encoding: 'utf-8' });
    } catch {
      throw new Error(`Graph: View ${options.view} does not exist`);
    }
    const handlebarsContext = {
      cardKey: context.cardKey,
      ...options,
    };

    const handlebars = Handlebars.create();
    const view = handlebars.compile(viewContent)(handlebarsContext);

    const modelContent = await readFile(modelLocation, { encoding: 'utf-8' });
    let result: string;
    try {
      result = await context.project.calculationEngine.runGraph(
        modelContent,
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

    let schema: Schema | null = null;
    try {
      schema = JSON.parse(
        readFileSync(
          resourceFilePath(
            context.project,
            resourceName(options.view),
            'parameterSchema.json',
          ),
          { encoding: 'utf-8' },
        ),
      );
    } catch (err) {
      this.logger.trace(
        err,
        'Graph schema not found or failed to read, skipping validation',
      );
    }

    if (schema) {
      validateMacroContent(this.metadata, input, schema);
    }

    return options;
  }
}

export default ReportMacro;
