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

import type { Handler, MutationContext } from '../handler.js';
import { resourceNameToString } from '../../utils/resource-utils.js';
import { isModuleCard } from '../../utils/card-utils.js';
import type { ChangeOperation } from '../../resources/resource-object.js';
import type { Card } from '../../interfaces/project-interfaces.js';
import type { WorkflowState } from '../../interfaces/resource-interfaces.js';

/**
 * Renaming a workflow state (a 'change' on 'states' whose target name differs
 * from the new name) is a breaking change: the state name is the array
 * identity, so every transition referencing it and every card in that state
 * must be rewritten.
 *
 * Transition rewriting is intra-resource definition consistency and stays in
 * WorkflowResource.update. The cross-resource part — remapping the
 * `workflowState` of every card sitting in the renamed state — lives here. The
 * handler calls `resource.update()` (which renames the state and rewrites
 * transitions) and then performs the card migration. Marked breaking so the
 * engine records a log entry.
 *
 * A 'change' that only edits non-identity state properties (e.g. category) is
 * NOT matched here; it falls through to DefaultNoCascadeHandler, which runs the
 * same update without recording a (non-breaking) log entry.
 */
export class WorkflowRenameStateHandler implements Handler {
  readonly isBreaking = true;

  matches(ctx: MutationContext): boolean {
    if (ctx.input.kind !== 'edit') return false;
    if (ctx.input.target.type !== 'workflows') return false;
    if (ctx.input.updateKey.key !== 'states') return false;
    if (ctx.input.operation.name !== 'change') return false;

    // Only a state rename (identity change) routes here. The discriminator is
    // that `to.name` differs from `target.name`.
    const op = ctx.input.operation as ChangeOperation<unknown>;
    const targetName = (op.target as { name?: string }).name;
    const toName = (op.to as { name?: string }).name;
    return (
      typeof targetName === 'string' &&
      typeof toName === 'string' &&
      targetName !== toName
    );
  }

  async apply(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'edit') {
      throw new Error('WorkflowRenameStateHandler: non-edit input');
    }
    const name = resourceNameToString(ctx.input.target);
    const resource = ctx.project.resources.byType(name, 'workflows');
    if (!resource) {
      throw new Error(`Workflow '${name}' not found`);
    }

    // Rename the state and rewrite the workflow's own transitions. The state
    // validation (must carry 'name' and 'category') lives in
    // WorkflowResource.update and fires here.
    await resource.update(ctx.input.updateKey, ctx.input.operation);

    await this.applyCascade(ctx);
  }

  // Cascade: remap the workflowState of every card in the renamed state.
  async applyCascade(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'edit') {
      throw new Error('WorkflowRenameStateHandler: non-edit input');
    }
    const name = resourceNameToString(ctx.input.target);
    const op = ctx.input.operation as ChangeOperation<WorkflowState>;
    const oldState = (op.target as { name?: string }).name as string;
    const newState = op.to.name;

    for (const card of this.cardsInState(ctx, name, oldState)) {
      card.metadata!.workflowState = newState;
      await ctx.project.updateCardMetadata(card, card.metadata!);
    }
  }

  // Cards using this workflow (via their card type) that are currently in the
  // given state: local project cards plus local template cards.
  private cardsInState(
    ctx: MutationContext,
    workflowName: string,
    state: string,
  ): Card[] {
    const cardTypeNames = new Set(
      ctx.project.resources
        .cardTypes()
        .filter((ct) => ct.data?.workflow === workflowName)
        .map((ct) => ct.data!.name),
    );
    if (cardTypeNames.size === 0) return [];

    const matches = (card: Card): boolean =>
      !!card.metadata?.cardType &&
      cardTypeNames.has(card.metadata.cardType) &&
      card.metadata.workflowState === state;

    const projectCards = ctx.project
      .cards(ctx.project.paths.cardRootFolder)
      .filter(matches);
    const templateCards = ctx.project
      .allTemplateCards()
      .filter((card) => !isModuleCard(card))
      .filter(matches);
    return [...projectCards, ...templateCards];
  }
}
