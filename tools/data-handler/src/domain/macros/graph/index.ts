// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import BaseMacro from '../base-macro.js';
import { createImage } from '../registry.js';
import macroMetadata from '@cyberismo/model/macros/graph/metadata';
import { renderGraph, validateGraphOptions } from './render.js';

import type { MacroGenerationContext } from '../../../shared/interfaces/macros.js';
import type TaskQueue from '../task-queue.js';

class GraphMacro extends BaseMacro {
  constructor(tasksQueue: TaskQueue) {
    super(macroMetadata, tasksQueue);
  }

  handleValidate = (context: MacroGenerationContext, input: unknown) => {
    validateGraphOptions(context.checkout, input);
  };

  handleStatic = async (context: MacroGenerationContext, input: unknown) => {
    const options = validateGraphOptions(context.checkout, input);
    const result = await renderGraph(
      context.checkout,
      options,
      context.cardKey,
      context.context,
    );
    return createImage(result, context.mode);
  };
}

export default GraphMacro;
