/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import type { Checkout } from '../infra/checkout.js';
import type { MacroError } from '../exceptions/index.js';
import type { Context } from '@cyberismo/model';

export type Mode = 'validate' | 'static' | 'inject' | 'staticSite';

export interface MacroGenerationContext {
  context: Context;
  checkout: Checkout;
  mode: Mode;
  cardKey: string;
  maxTries?: number;
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
