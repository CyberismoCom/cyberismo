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
import { Calculate } from '../../commands/index.js';
import type { MacroOptions } from '../index.js';
import { createImage, validateMacroContent } from '../index.js';
import Handlebars from 'handlebars';
import { join } from 'node:path';
import { logger } from '../../utils/log-utils.js';
import type { MacroGenerationContext } from '../../interfaces/macros.js';
import macroMetadata from './metadata.js';
import { pathExists } from '../../utils/file-utils.js';
import { Project } from '../../containers/project.js';
import { readFile } from 'node:fs/promises';
import { resourceName } from '../../utils/resource-utils.js';
import type { Schema } from 'jsonschema';
import { validateJson } from '../../utils/validate.js';
import type TaskQueue from '../task-queue.js';

export interface GraphOptions extends MacroOptions {
  model: string;
  view: string;
}

class ReportMacro extends BaseMacro {
  constructor(tasksQueue: TaskQueue) {
    super(macroMetadata, tasksQueue);
  }

  handleValidate = (input: unknown) => {
    this.parseOptions(input);
  };

  handleStatic = async (context: MacroGenerationContext, input: unknown) => {
    return this.handleInject(context, input);
  };

  handleInject = async (context: MacroGenerationContext, input: unknown) => {
    const project = new Project(context.projectPath);
    const calculate = new Calculate(project);

    const resourceNameToPath = (name: string, fileName: string) => {
      const { identifier, prefix, type } = resourceName(name);
      if (prefix === project.projectPrefix) {
        return join(project.paths.resourcesFolder, type, identifier, fileName);
      }
      return join(
        project.paths.modulesFolder,
        prefix,
        type,
        identifier,
        fileName,
      );
    };

    const options = this.parseOptions(input);

    let schema: Schema | null = null;
    try {
      schema = JSON.parse(
        await readFile(
          resourceNameToPath(options.view, 'parameterSchema.json'),
          { encoding: 'utf-8' },
        ),
      );
    } catch (err) {
      logger.trace(
        err,
        'Graph schema not found or failed to read, skipping validation',
      );
    }

    if (schema) {
      validateJson(options, {
        schema,
      });
    }

    const modelLocation = resourceNameToPath(options.model, 'model.lp');
    const viewLocation = resourceNameToPath(options.view, 'view.lp.hbs');

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
    const result = await calculate.runGraph({
      query: view + '\n' + modelContent,
    });

    if (typeof result !== 'string') {
      throw new Error(
        'Graph macro expected a string from clingo, but received an object',
      );
    }
    return createImage(result);
  };

  private parseOptions(input: unknown): GraphOptions {
    return validateMacroContent<GraphOptions>(this.metadata, input);
  }
}

export default ReportMacro;
