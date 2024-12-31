/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { createImage, validateMacroContent } from '../index.js';

import { MacroGenerationContext } from '../../interfaces/macros.js';
import macroMetadata from './metadata.js';
import { Project } from '../../containers/project.js';
import { Calculate } from '../../calculate.js';
import Handlebars from 'handlebars';
import BaseMacro from '../BaseMacro.js';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { resourceNameParts } from '../../utils/resource-utils.js';
import { logger } from '../../utils/log-utils.js';
import { validateJson } from '../../utils/validate.js';
import { Schema } from 'jsonschema';
import { pathExists } from '../../utils/file-utils.js';

export interface GraphOptions extends Record<string, string> {
  model: string;
  view: string;
}

class ReportMacro extends BaseMacro {
  constructor() {
    super(macroMetadata);
  }

  handleValidate = (data: string) => {
    this.validate(data);
  };

  handleStatic = async (context: MacroGenerationContext, data: string) => {
    return this.handleInject(context, data);
  };

  handleInject = async (context: MacroGenerationContext, data: string) => {
    const project = new Project(context.projectPath);
    const calculate = new Calculate(project);

    const resourceNameToPath = (name: string, ending: string) => {
      const { identifier, prefix, type } = resourceNameParts(name);
      if (prefix === project.projectPrefix) {
        return join(project.paths.resourcesFolder, type, identifier, ending);
      }
      return join(
        project.paths.modulesFolder,
        prefix,
        type,
        identifier,
        ending,
      );
    };

    const options = this.validate(data);

    let schema: Schema | null = null;
    try {
      schema = JSON.parse(
        await readFile(
          resourceNameToPath(options.view, 'parameterSchema.json'),
          { encoding: 'utf-8' },
        ),
      );
    } catch (err) {
      logger.debug(
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

    if (!pathExists(viewLocation)) {
      throw new Error(`Graph: View ${options.view} does not exist`);
    }

    const viewContent = await readFile(viewLocation, { encoding: 'utf-8' });
    const handlebarsContext = {
      cardKey: context.cardKey,
      ...options,
    };

    const handlebars = Handlebars.create();
    const view = handlebars.compile(viewContent)(handlebarsContext);

    const result = await calculate.runGraph({
      query: view,
      file: modelLocation,
    });

    if (typeof result !== 'string') {
      throw new Error(
        'Graph macro expected a string from clingo, but received an object',
      );
    }
    return createImage(result);
  };

  private validate(data: string): GraphOptions {
    if (!data || typeof data !== 'string') {
      throw new Error('Graph macro requires a JSON object as data');
    }

    return validateMacroContent<GraphOptions>(this.metadata, data);
  }
}

export default ReportMacro;
