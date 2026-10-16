// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { MacroGenerationContext } from '../../../shared/interfaces/macros.js';
import BaseMacro from '../base-macro.js';
import macroMetadata from '@cyberismo/model/macros/mermaid/metadata';
import type TaskQueue from '../task-queue.js';
import {
  createHtmlPlaceholder,
  createImage,
  validateMacroContent,
} from '../registry.js';
import { renderMermaidToSvg } from '../../../shared/utils/mermaid-renderer.js';
import { sanitizeSvgBase64 } from '../../../shared/utils/sanitize-svg.js';
import type { MermaidMacroInput } from '@cyberismo/model';

class MermaidMacro extends BaseMacro {
  constructor(tasksQueue: TaskQueue) {
    super(macroMetadata, tasksQueue);
  }

  handleValidate = (_: MacroGenerationContext, input: unknown) => {
    this.validate(input);
  };

  handleStatic = async (context: MacroGenerationContext, input: unknown) => {
    const options = this.validate(input);
    const svg = await renderMermaidToSvg(options.code);
    return createImage(await sanitizeSvgBase64(svg), context.mode, false);
  };

  handleInject = async (_: MacroGenerationContext, input: unknown) => {
    const options = this.validate(input);
    return createHtmlPlaceholder(this.metadata, options);
  };

  private validate(input: unknown): MermaidMacroInput {
    return validateMacroContent<MermaidMacroInput>(this.metadata, input);
  }
}

export default MermaidMacro;
