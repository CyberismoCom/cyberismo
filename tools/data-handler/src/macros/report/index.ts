/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { registerEmptyMacros, validateMacroContent } from '../index.js';

import type { MacroGenerationContext } from '../../interfaces/macros.js';
import macroMetadata from './metadata.js';
import { Project } from '../../containers/project.js';
import { Calculate } from '../../commands/index.js';
import Handlebars from 'handlebars';
import BaseMacro from '../base-macro.js';
import { validateJson } from '../../utils/validate.js';
import type TaskQueue from '../task-queue.js';
import { ReportResource } from '../../resources/report-resource.js';
import { resourceName } from '../../utils/resource-utils.js';

export interface ReportOptions extends Record<string, string> {
  name: string;
}

class ReportMacro extends BaseMacro {
  constructor(tasksQueue: TaskQueue) {
    super(macroMetadata, tasksQueue);
  }
  handleValidate = (input: unknown) => {
    this.validate(input);
  };

  handleStatic = async (context: MacroGenerationContext, data: unknown) => {
    return this.handleInject(context, data);
  };

  handleInject = async (context: MacroGenerationContext, data: unknown) => {
    const options = this.validate(data);
    const project = new Project(context.projectPath);
    const resource = new ReportResource(project, resourceName(options.name));
    const report = await resource.show();

    if (!report) throw new Error(`Report ${options} does not exist`);

    if (report.schema) {
      validateJson(options, {
        schema: report.schema,
      });
    }

    const handlebarsContext = {
      cardKey: context.cardKey,
      ...options,
    };

    const handlebars = Handlebars.create();

    const template = handlebars.compile(report.queryTemplate, {
      strict: true,
    });

    const calculate = new Calculate(project);
    const result = await calculate.runLogicProgram({
      query: template(handlebarsContext),
    });
    if (result.error) {
      throw new Error(result.error);
    }
    // register empty macros so that other macros aren't touched yet
    registerEmptyMacros(handlebars);

    return handlebars.compile(report.contentTemplate)({
      ...handlebarsContext,
      ...result,
    });
  };

  private validate(data: unknown): ReportOptions {
    return validateMacroContent<ReportOptions>(this.metadata, data);
  }
}

export default ReportMacro;
