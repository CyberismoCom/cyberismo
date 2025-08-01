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

import { validateMacroContent } from '../index.js';

import type { MacroGenerationContext } from '../../interfaces/macros.js';
import macroMetadata from './metadata.js';
import type { Calculate } from '../../commands/index.js';
import BaseMacro from '../base-macro.js';
import { validateJson } from '../../utils/validate.js';
import type TaskQueue from '../task-queue.js';
import { ReportResource } from '../../resources/report-resource.js';
import { resourceName } from '../../utils/resource-utils.js';
import { generateReportContent } from '../../utils/report.js';
import { ClingoError } from '@cyberismo/node-clingo';

export interface ReportOptions {
  name: string;
}

class ReportMacro extends BaseMacro {
  constructor(
    tasks: TaskQueue,
    private readonly calculate: Calculate,
  ) {
    super(macroMetadata, tasks);
  }
  handleValidate = (input: unknown) => {
    this.validate(input);
  };

  handleStatic = async (context: MacroGenerationContext, data: unknown) => {
    return this.handleInject(context, data);
  };

  handleInject = async (context: MacroGenerationContext, data: unknown) => {
    const options = this.validate(data);
    const resource = new ReportResource(
      context.project,
      resourceName(options.name),
    );
    const report = await resource.show();

    if (!report) throw new Error(`Report ${options.name} does not exist`);

    if (report.schema) {
      validateJson(options, {
        schema: report.schema,
      });
    }
    try {
      return await generateReportContent({
        calculate: this.calculate,
        contentTemplate: report.contentTemplate,
        queryTemplate: report.queryTemplate,
        options: {
          cardKey: context.cardKey,
          ...options,
        },
        context: context.context,
      });
    } catch (error) {
      if (error instanceof ClingoError) {
        throw new Error(
          `Error running logic program in report '${options.name}':${error.details.errors.join('\n')}`,
        );
      }
      throw error;
    }
  };

  private validate(data: unknown): ReportOptions {
    return validateMacroContent<ReportOptions>(this.metadata, data);
  }
}

export default ReportMacro;
