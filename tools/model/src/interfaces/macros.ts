// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { macroMetadata } from '../macros/common.js';

export interface MacroMetadata {
  /**
   * The name of the macro. This is the name that will be used in the content
   */
  name: string;
  /**
   * The tag name of the macro. This is the name that will be used in the HTML. This is separated for clarity since tags cannot have uppercase letters
   */
  tagName: string;

  /**
   * The schema of the macro. This is used to validate the data passed to the macro
   */
  schema?: string;
}

export type MacroName = keyof typeof macroMetadata;
