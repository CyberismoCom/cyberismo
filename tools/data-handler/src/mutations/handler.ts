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
      /**
       * Workflow-state successions in the batch. A card-type workflow change
       * maps a card sitting in a state removed or renamed before its mapping
       * was authored (the removal or rename cascade skipped the card) through
       * these.
       */
      stateSuccessions?: StateSuccessions;
    };

/** Workflow-state successions recorded in a replay batch. */
export interface StateSuccessions {
  /** Workflow renames in the batch (old name -> new). */
  workflowRenames: ReadonlyMap<string, string>;
  /**
   * Per final workflow name: state -> the state that took its place, which is
   * a removal's recorded replacement or a legacy rename's new name.
   */
  successors: ReadonlyMap<string, ReadonlyMap<string, string>>;
}

/** Follow renames (old -> new) to the final name; identity when absent. */
export function resolveRename(
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

/** The name a recorded workflow-state value carries: a bare string or a state object. */
export function stateNameOf(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  const name = (value as { name?: unknown } | null | undefined)?.name;
  return typeof name === 'string' ? name : undefined;
}

/**
 * A state followed by each state that succeeded it in the batch, in order,
 * stopping at a cycle. Just the state itself when nothing succeeded it.
 */
export function stateSuccessionChain(
  workflow: string | undefined,
  state: string,
  successions?: StateSuccessions,
): string[] {
  const chain = [state];
  if (workflow === undefined || !successions) return chain;
  const successors = successions.successors.get(
    resolveRename(workflow, successions.workflowRenames),
  );
  let current = state;
  while (successors?.has(current)) {
    current = successors.get(current)!;
    if (chain.includes(current)) break;
    chain.push(current);
  }
  return chain;
}

export interface MutationContext<I extends MutationInput = MutationInput> {
  project: Project;
  input: I;
  /** Card-type renames in the active replay batch; absent when authoring. */
  cardTypeRenames?: ReadonlyMap<string, string>;
  /** Workflow-state successions in the active replay batch; absent when authoring. */
  stateSuccessions?: StateSuccessions;
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
   * through caches must refresh eagerly itself.
   */
  applyCascade(ctx: MutationContext<I>): Promise<void>;
}
