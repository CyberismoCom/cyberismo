// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { Checkout } from '../../state/checkout/checkout.js';
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
