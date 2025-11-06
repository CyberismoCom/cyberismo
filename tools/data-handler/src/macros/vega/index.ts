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
import type { MacroGenerationContext } from '../../interfaces/macros.js';
import BaseMacro from '../base-macro.js';
import macroMetadata from './metadata.js';
import type TaskQueue from '../task-queue.js';
import {
  createHtmlPlaceholder,
  createImage,
  validateMacroContent,
} from '../index.js';
import * as vega from 'vega';
import type { VegaMacroInput } from './types.js';

class VegaMacro extends BaseMacro {
  constructor(tasksQueue: TaskQueue) {
    super(macroMetadata, tasksQueue);
  }

  handleValidate = (_: MacroGenerationContext, input: unknown) => {
    this.validate(input);
  };

  handleStatic = async (_: MacroGenerationContext, input: unknown) => {
    const options = this.validate(input) as VegaMacroInput;
    const view = new vega.View(vega.parse(options.spec), { renderer: 'none' });
    const svg = await view.toSVG();
    return createImage(Buffer.from(svg).toString('base64'), false);
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
