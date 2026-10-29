// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { MacroGenerationContext } from '../../../shared/interfaces/macros.js';
import BaseMacro from '../base-macro.js';
import macroMetadata from '@cyberismo/model/macros/vegalite/metadata';
import type TaskQueue from '../task-queue.js';
import { createMacro, validateMacroContent } from '../registry.js';
import type { VegaLiteMacroInput } from '@cyberismo/model';

class VegaLiteMacro extends BaseMacro {
  constructor(tasksQueue: TaskQueue) {
    super(macroMetadata, tasksQueue);
  }

  handleValidate = (_: MacroGenerationContext, input: unknown) => {
    this.validate(input);
  };

  handleStatic = async (_: MacroGenerationContext, input: unknown) => {
    const options = this.validate(input) as VegaLiteMacroInput;
    const vegaLite = await import('vega-lite');
    const compiled = vegaLite.compile(options.spec).spec;
    return createMacro('vega', {
      spec: compiled,
    });
  };

  private validate(input: unknown): VegaLiteMacroInput {
    return validateMacroContent<VegaLiteMacroInput>(this.metadata, input);
  }
}

export default VegaLiteMacro;
