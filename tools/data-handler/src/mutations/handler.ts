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
  | { kind: 'local' }
  | {
      kind: 'replay';
      modulePrefix: string;
      /**
       * Card-type renames in the batch (old name -> new). A card keeps its old
       * type until the rename entry applies, so name-based card selection
       * resolves through this.
       */
      cardTypeRenames?: ReadonlyMap<string, string>;
    };

/** Follow card-type renames (old -> new) to the final name; identity when absent. */
export function resolveCardTypeRename(
  name: string,
  renames?: ReadonlyMap<string, string>,
): string {
  if (!renames) return name;
  let current = name;
  const seen = new Set<string>();
  while (renames.has(current) && !seen.has(current)) {
    seen.add(current);
    current = renames.get(current)!;
  }
  return current;
}

/**
 * Context handed to a handler. Generic over the input variant: the dispatcher
 * routes each mutation to a handler registered for its kind, so a handler can
 * fix `I` to the precise {@link MutationInput} variant it handles (e.g.
 * `RenameInput`) and read `ctx.input` without re-narrowing the union.
 */
export interface MutationContext<I extends MutationInput = MutationInput> {
  project: Project;
  input: I;
  /** Card-type renames in the active replay batch; absent when authoring. */
  cardTypeRenames?: ReadonlyMap<string, string>;
}

export interface Handler<I extends MutationInput = MutationInput> {
  /** Apply the resource-definition change and the cascade (authoring path). */
  apply(ctx: MutationContext<I>): Promise<void>;

  /**
   * Apply only the cascade: rewrites of LOCAL resources, cards and content
   * that follow from this mutation. Called by apply() internally and alone
   * by module-update replay. Must derive everything from ctx.input,
   * tolerate zero matches, and never require the target resource to exist.
   * Cascades may write directly to disk; the replay orchestrator
   * refreshes project caches once after a replay batch. A handler whose
   * cascade rewrites files that LATER entries in the same batch read
   * through caches must refresh eagerly itself (see ProjectRenameHandler).
   */
  applyCascade(ctx: MutationContext<I>): Promise<void>;
}
