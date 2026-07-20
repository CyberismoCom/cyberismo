/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026

  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import type { Project } from '../containers/project.js';
import type { MutationInput } from './types.js';

export type MutationOrigin =
  { kind: 'local' } | { kind: 'replay'; modulePrefix: string };

/**
 * Context handed to a handler. Generic over the input variant: the dispatcher
 * routes each mutation to a handler registered for its kind, so a handler can
 * fix `I` to the precise {@link MutationInput} variant it handles (e.g.
 * `RenameInput`) and read `ctx.input` without re-narrowing the union.
 */
export interface MutationContext<I extends MutationInput = MutationInput> {
  project: Project;
  input: I;
}

export interface Handler<I extends MutationInput = MutationInput> {
  /** Apply the resource-definition change and the cascade (authoring path). */
  apply(ctx: MutationContext<I>): Promise<void>;

  /**
   * Apply only the cascade: rewrites of LOCAL resources, cards and content
   * that follow from this mutation. Called by apply() internally and alone
   * by module-update replay. Must derive everything from ctx.input,
   * tolerate zero matches, and never require the target resource to exist.
   * Cascades may write directly to disk; the replay orchestrator is
   * responsible for refreshing project caches after a replay batch.
   */
  applyCascade(ctx: MutationContext<I>): Promise<void>;
}
