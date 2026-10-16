// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { UserInfo } from '../types.js';

export interface AuthResult extends UserInfo {
  /** Credential deadline (epoch seconds). Always present: a provider whose
   * sessions do not expire says so with a deadline far enough out to be
   * inert, rather than leaving every consumer to handle its absence. */
  exp: number;
}

export interface AuthProvider {
  authenticate(req: Request): Promise<AuthResult | null>;
}
