// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { validateMacroContent } from '../registry.js';

import type { MacroGenerationContext } from '../../../shared/interfaces/macros.js';
import macroMetadata from '@cyberismo/model/macros/field/metadata';
import type { FieldMacroOptions } from '@cyberismo/model';
import BaseMacro from '../base-macro.js';
import type TaskQueue from '../task-queue.js';

// implemented in U6
export default class FieldMacro extends BaseMacro {
  constructor(tasksQueue: TaskQueue) {
    super(macroMetadata, tasksQueue);
  }

  handleValidate = (_: MacroGenerationContext, input: unknown) => {
    validateMacroContent<FieldMacroOptions>(this.metadata, input);
  };

  handleStatic = async (): Promise<string> => {
    throw new Error('field macro not implemented');
  };
}
