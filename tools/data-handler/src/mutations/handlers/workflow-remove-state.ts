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
import { resolveCardTypeRename } from '../handler.js';
import type { EditInput } from '../types.js';
import { resourceNameToString } from '../../utils/resource-utils.js';
import { isModuleCard } from '../../utils/card-utils.js';
import type { RemoveOperation } from '../../resources/resource-object.js';
import type { Card } from '../../interfaces/project-interfaces.js';
import type { WorkflowState } from '../../interfaces/resource-interfaces.js';

/**
 * Removing a state from a workflow is a breaking change.
 *
 * Transition rewriting (dropping transitions that reference the removed state,
 * or re-pointing them at the replacement) is intra-resource definition
 * consistency and stays in WorkflowResource.update. The cross-resource part —
 * migrating every card in the removed state to the replacement, or to the
 * new-card state when none is given — lives here. The handler calls `resource.update()`
 * (which removes the state and rewrites transitions) and then performs the card
 * migration. Marked breaking so the engine records a log entry.
 */
export class WorkflowRemoveStateHandler implements Handler<EditInput> {
  async apply(ctx: MutationContext<EditInput>): Promise<void> {
    const name = resourceNameToString(ctx.input.target);
    const resource = ctx.project.resources.byType(name, 'workflows');
    if (!resource) {
      throw new Error(`Workflow '${name}' not found`);
    }

    // Remove the state and rewrite the workflow's own transitions. The
    // unknown-replacement-state guard lives in WorkflowResource.update and
    // fires here.
    await resource.update(ctx.input.updateKey, ctx.input.operation);

    await this.applyCascade(ctx);
  }

  // Cascade: migrate every card in the removed state to the replacement, or
  // — when none was recorded — to the workflow's new-card state.
  async applyCascade(ctx: MutationContext<EditInput>): Promise<void> {
    const name = resourceNameToString(ctx.input.target);
    const op = ctx.input.operation as RemoveOperation<WorkflowState>;
    const stateName = ((op.target as { name?: string }).name ??
      op.target) as string;
    const replacement = op.replacementValue as WorkflowState | undefined;

    // The author's recorded choice wins; with none, cards fall back to the
    // state a new card would get rather than being left in a removed state.
    const effective = replacement?.name ?? this.initialState(ctx, name);
    if (effective) {
      for (const card of this.cardsInState(ctx, name, stateName)) {
        card.metadata!.workflowState = effective;
        await ctx.project.updateCardMetadata(card, card.metadata!);
      }
    }
  }

  // The state a newly created card gets: the toState of the initial
  // transition (fromState contains ''). In the authoring path apply() runs
  // resource.update() first, so this reads the POST-update workflow.
  // Undefined when the workflow is missing (deleted later in a replay chain)
  // or the initial transition is gone (e.g. its target was the removed
  // state); affected cards are then left for final validation to report.
  private initialState(
    ctx: MutationContext,
    workflowName: string,
  ): string | undefined {
    const workflow = ctx.project.resources.byType(
      workflowName,
      'workflows',
    )?.data;
    return workflow?.transitions.find((t) => t.fromState.includes(''))?.toState;
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

    // Resolve the card's type through pending renames: it still carries its
    // old type when this (earlier) seal replays.
    const usesWorkflow = (cardType: string): boolean =>
      cardTypeNames.has(cardType) ||
      cardTypeNames.has(resolveCardTypeRename(cardType, ctx.cardTypeRenames));

    const matches = (card: Card): boolean =>
      !!card.metadata?.cardType &&
      usesWorkflow(card.metadata.cardType) &&
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
