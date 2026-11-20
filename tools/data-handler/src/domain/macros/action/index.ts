// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import macroMetadata from '@cyberismo/model/macros/action/metadata';
import BaseMacro from '../base-macro.js';
import type TaskQueue from '../task-queue.js';

/**
 * The action macro in card content, where it is always refused: action
 * buttons are rendered only from report templates, by the report's own
 * `action` helper. Validation fails; a rendered card shows the refusal as a
 * macro error (handleMacroError) in every mode.
 */
class ActionMacro extends BaseMacro {
  constructor(tasksQueue: TaskQueue) {
    super(macroMetadata, tasksQueue);
  }

  handleValidate = () => {
    throw refusal();
  };

  handleStatic = async (): Promise<string> => {
    throw refusal();
  };
}

function refusal() {
  return new Error(
    'The action macro can be used only in report templates, not in card content',
  );
}

export default ActionMacro;
