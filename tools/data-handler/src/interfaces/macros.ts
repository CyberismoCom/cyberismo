/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import type { macroMetadata } from '../macros/common.js';
import type { Project } from '../containers/project.js';
import type { MacroError } from '../exceptions/index.js';
import type { Context } from './project-interfaces.js';

export type Mode = 'validate' | 'static' | 'inject' | 'staticSite';

export interface MacroGenerationContext {
  context: Context;
  project: Project;
  mode: Mode;
  cardKey: string;
  maxTries?: number;
}

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

export interface MacroTaskState {
  globalId: string;
  localId: number;
  promise: Promise<void>;
  placeholder: string;
  promiseResult: string | null;
  macro: string;
  parameters: string;
  error: MacroError | null;
}

// Handlebars options is not documented
// It contains various context specific parameters
export interface HandlebarsOptions {
  fn: (arg0: unknown) => string;
}

export type MacroName = keyof typeof macroMetadata;
