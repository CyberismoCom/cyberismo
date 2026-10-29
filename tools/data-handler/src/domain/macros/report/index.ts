// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { validateMacroContent } from '../registry.js';

import type { MacroGenerationContext } from '../../../shared/interfaces/macros.js';
import macroMetadata from '@cyberismo/model/macros/report/metadata';
import BaseMacro from '../base-macro.js';
import { validateJson } from '../../../shared/utils/validate.js';
import type TaskQueue from '../task-queue.js';
import { generateReportContent } from '../../queries/report.js';
import { ClingoError } from '@cyberismo/node-clingo';
import type { ReportOptions } from '@cyberismo/model';

class ReportMacro extends BaseMacro {
  constructor(tasks: TaskQueue) {
    super(macroMetadata, tasks);
  }
  handleValidate = (_: MacroGenerationContext, input: unknown) => {
    this.validate(input);
  };

  handleStatic = async (context: MacroGenerationContext, data: unknown) => {
    const options = this.validate(data);
    const report = context.checkout.resources
      .byType(options.name, 'reports')
      .show();

    if (report.content.schema) {
      validateJson(options, {
        schema: report.content.schema,
      });
    }
    try {
      return await generateReportContent({
        calculate: context.checkout.calculationEngine,
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
          { cause: error },
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
