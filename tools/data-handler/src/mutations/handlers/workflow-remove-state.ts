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
import type { RemoveOperation } from '../../resources/resource-object.js';
import type { Card } from '../../interfaces/project-interfaces.js';
import type { WorkflowState } from '../../interfaces/resource-interfaces.js';

/**
 * Removing a state from a workflow is a breaking change.
 *
 * Transition rewriting (dropping transitions that reference the removed state,
 * or re-pointing them at the replacement) is intra-resource definition
 * consistency and stays in WorkflowResource.update. The cross-resource part —
 * migrating every card in the removed state to the replacement, when a
 * replacementValue is given — lives here. The handler calls `resource.update()`
 * (which removes the state and rewrites transitions) and then performs the card
 * migration. Marked breaking so the engine records a log entry.
 */
export class WorkflowRemoveStateHandler implements Handler {
  async apply(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'edit') {
      throw new Error('WorkflowRemoveStateHandler: non-edit input');
    }
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

  // Cascade: with a replacement, migrate every card in the removed state to
  // it. Without a replacement no cards are migrated (they keep their now-
  // removed state value).
  async applyCascade(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'edit') {
      throw new Error('WorkflowRemoveStateHandler: non-edit input');
    }
    const name = resourceNameToString(ctx.input.target);
    const op = ctx.input.operation as RemoveOperation<WorkflowState>;
    const stateName = ((op.target as { name?: string }).name ??
      op.target) as string;
    const replacement = op.replacementValue as WorkflowState | undefined;

    if (replacement) {
      for (const card of this.cardsInState(ctx, name, stateName)) {
        card.metadata!.workflowState = replacement.name;
        await ctx.project.updateCardMetadata(card, card.metadata!);
      }
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
