// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import BaseMacro from '../base-macro.js';
import { createImage, validateMacroContent } from '../registry.js';
import macroMetadata from '@cyberismo/model/macros/graph/metadata';
import { graphViewSchema, renderGraph } from '../../queries/graph.js';
import { svgBase64 } from '../../../shared/utils/sanitize-svg.js';

import type { GraphOptions } from '@cyberismo/model';
import type { MacroGenerationContext } from '../../../shared/interfaces/macros.js';
import type TaskQueue from '../task-queue.js';

class GraphMacro extends BaseMacro {
  constructor(tasksQueue: TaskQueue) {
    super(macroMetadata, tasksQueue);
  }

  handleValidate = (context: MacroGenerationContext, input: unknown) => {
    this.parseOptions(input, context);
  };

  handleStatic = async (context: MacroGenerationContext, input: unknown) => {
    const options = this.parseOptions(input, context);
    const result = await renderGraph(
      context.checkout,
      options,
      context.cardKey,
      context.context,
    );
    return createImage(svgBase64(result), context.mode);
  };

  // Checks the macro options, and the view's own parameters against the
  // view's schema if it has one.
  private parseOptions(
    input: unknown,
    context: MacroGenerationContext,
  ): GraphOptions {
    const options = validateMacroContent<GraphOptions>(this.metadata, input);
    const schema = graphViewSchema(context.checkout, options.view);
    if (schema) {
      validateMacroContent(this.metadata, input, schema);
    }
    return options;
  }
}

export default GraphMacro;
