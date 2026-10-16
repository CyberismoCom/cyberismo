// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { MacroGenerationContext } from '../../../shared/interfaces/macros.js';
import BaseMacro from '../base-macro.js';
import macroMetadata from '@cyberismo/model/macros/vega/metadata';
import type TaskQueue from '../task-queue.js';
import {
  createHtmlPlaceholder,
  createImage,
  validateMacroContent,
} from '../registry.js';
import { sanitizeSvgBase64 } from '../../../shared/utils/sanitize-svg.js';
import type { VegaMacroInput } from '@cyberismo/model';

class VegaMacro extends BaseMacro {
  constructor(tasksQueue: TaskQueue) {
    super(macroMetadata, tasksQueue);
  }

  handleValidate = (_: MacroGenerationContext, input: unknown) => {
    this.validate(input);
  };

  handleStatic = async (context: MacroGenerationContext, input: unknown) => {
    const options = this.validate(input) as VegaMacroInput;
    const vega = await import('vega');
    const view = new vega.View(vega.parse(options.spec), { renderer: 'none' });
    const svg = await view.toSVG();
    return createImage(await sanitizeSvgBase64(svg), context.mode, false);
  };

  handleInject = async (_: MacroGenerationContext, input: unknown) => {
    const options = this.validate(input) as VegaMacroInput;
    return createHtmlPlaceholder(this.metadata, options);
  };

  private validate(input: unknown): VegaMacroInput {
    return validateMacroContent<VegaMacroInput>(this.metadata, input);
  }
}

export default VegaMacro;
