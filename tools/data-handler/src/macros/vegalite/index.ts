/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2025
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/
import type { MacroGenerationContext } from '../../interfaces/macros.js';
import BaseMacro from '../base-macro.js';
import macroMetadata from './metadata.js';
import type TaskQueue from '../task-queue.js';
import * as vegaLite from 'vega-lite';
import { createMacro, validateMacroContent } from '../index.js';
import VegaMacro from '../vega/index.js';

export interface VegaLiteMacroInput {
  spec: vegaLite.TopLevelSpec;
}

class VegaLiteMacro extends BaseMacro {
  constructor(tasksQueue: TaskQueue) {
    super(macroMetadata, tasksQueue);
  }

  handleValidate = (input: unknown) => {
    this.validate(input);
  };

  handleStatic = async (_: MacroGenerationContext, input: unknown) => {
    const options = this.validate(input) as VegaLiteMacroInput;
    const compiled = vegaLite.compile(options.spec).spec;
    return createMacro('vega', {
      spec: compiled,
    });
  };

  handleInject = async (context: MacroGenerationContext, input: unknown) => {
    return this.handleStatic(context, input);
  };

  private validate(input: unknown): VegaLiteMacroInput {
    return validateMacroContent<VegaLiteMacroInput>(this.metadata, input);
  }
}

export default VegaLiteMacro;
