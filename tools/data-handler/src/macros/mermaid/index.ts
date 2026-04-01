/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2025

  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/
import type { MacroGenerationContext } from '../../interfaces/macros.js';
import BaseMacro from '../base-macro.js';
import macroMetadata from './metadata.js';
import type TaskQueue from '../task-queue.js';
import {
  createHtmlPlaceholder,
  createImage,
  validateMacroContent,
} from '../index.js';
import { renderMermaidToSvg } from '../../utils/mermaid-renderer.js';
import { sanitizeSvgBase64 } from '../../utils/sanitize-svg.js';
import type { MermaidMacroInput } from './types.js';

class MermaidMacro extends BaseMacro {
  constructor(tasksQueue: TaskQueue) {
    super(macroMetadata, tasksQueue);
  }

  handleValidate = (_: MacroGenerationContext, input: unknown) => {
    this.validate(input);
  };

  handleStatic = async (_: MacroGenerationContext, input: unknown) => {
    const options = this.validate(input);
    const svg = await renderMermaidToSvg(options.code);
    return createImage(sanitizeSvgBase64(svg), false);
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
