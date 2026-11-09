// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { Checkout } from '../../state/checkout/checkout.js';
import type { MacroError } from '../exceptions/index.js';
import type { LogicError } from '../../infra/logic/logic-backend.js';
import type { Context, QueryResult } from '@cyberismo/model';

export type Mode = 'validate' | 'static' | 'inject' | 'staticSite';

export interface MacroGenerationContext {
  context: Context;
  checkout: Checkout;
  mode: Mode;
  cardKey: string;
  maxTries?: number;
  // Card query results by card key, shared by one evaluation and its nested ones
  cardQueries?: Map<string, Promise<QueryResult<'card'>[]>>;
}

export interface MacroTaskState {
  globalId: string;
  localId: number;
  promise: Promise<void>;
  placeholder: string;
  promiseResult: string | null;
  macro: string;
  parameters: string;
  // A logic backend that cannot answer now is kept as it is.
  error: MacroError | LogicError | null;
}

// Handlebars options is not documented
// It contains various context specific parameters
export interface HandlebarsOptions {
  fn: (arg0: unknown) => string;
}
