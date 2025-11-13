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
import BaseMacro from '../base-macro.js';
import { validateJson } from '../../utils/validate.js';
import type TaskQueue from '../task-queue.js';
import { generateReportContent } from '../../utils/report.js';
import { ClingoError } from '@cyberismo/node-clingo';
import type { ReportOptions } from './types.js';

class ReportMacro extends BaseMacro {
  constructor(tasks: TaskQueue) {
    super(macroMetadata, tasks);
  }
  handleValidate = (_: MacroGenerationContext, input: unknown) => {
    this.validate(input);
  };

  handleStatic = async (context: MacroGenerationContext, data: unknown) => {
    const options = this.validate(data);
    const report = await context.project.resources
      .byType(options.name, 'reports')
      .show();

    if (report.content.schema) {
      validateJson(options, {
        schema: report.content.schema,
      });
    }
    try {
      return await generateReportContent({
        calculate: context.project.calculationEngine,
        contentTemplate: report.content.contentTemplate,
        queryTemplate: report.content.queryTemplate,
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
