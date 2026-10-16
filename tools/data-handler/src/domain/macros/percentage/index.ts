// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { createImage, validateMacroContent } from '../registry.js';

import type { MacroGenerationContext } from '../../../shared/interfaces/macros.js';
import macroMetadata from '@cyberismo/model/macros/percentage/metadata';
import type { PercentageOptions } from '@cyberismo/model';
import BaseMacro from '../base-macro.js';
import type TaskQueue from '../task-queue.js';
import { percentage } from '../../../shared/svg/index.js';
import { sanitizeSvgBase64 } from '../../../shared/utils/sanitize-svg.js';

class PercentageMacro extends BaseMacro {
  constructor(tasksQueue: TaskQueue) {
    super(macroMetadata, tasksQueue);
  }
  handleValidate = (_: MacroGenerationContext, data: string) => {
    this.validate(data);
  };

  handleStatic = async (context: MacroGenerationContext, input: unknown) => {
    const options = this.validate(input);
    return createImage(
      await sanitizeSvgBase64(percentage(options), { removeSize: false }),
      context.mode,
      false,
    );
  };

  private validate(input: unknown): PercentageOptions {
    return validateMacroContent<PercentageOptions>(this.metadata, input);
  }
}

export default PercentageMacro;
