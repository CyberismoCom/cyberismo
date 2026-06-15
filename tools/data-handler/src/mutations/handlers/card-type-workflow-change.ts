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
import { ResourcesFrom } from '../../containers/project/resources-from.js';
import { getChildLogger } from '../../utils/log-utils.js';
import type { Card } from '../../interfaces/project-interfaces.js';
import type {
  ChangeOperation,
  Operation,
} from '../../resources/resource-object.js';

/**
 * Changing a card type's workflow is a breaking change: cards of the type get
 * their workflowState re-mapped to the new workflow. The cascade lives here:
 * the handler validates the state mapping, applies the workflow change to the
 * card type resource and then re-maps each affected card's workflowState.
 */
export class CardTypeWorkflowChangeHandler implements Handler {
  async apply(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'edit') {
      throw new Error(
        'CardTypeWorkflowChangeHandler called with non-edit input',
      );
    }
    const cardTypeName = resourceNameToString(ctx.input.target);
    const resource = ctx.project.resources.byType(cardTypeName, 'cardTypes');
    if (!resource) throw new Error(`CardType '${cardTypeName}' not found`);

    const changeOp = ctx.input.operation as ChangeOperation<string>;
    const stateMapping = changeOp.mappingTable?.stateMapping || {};

    // Validate the mapping BEFORE writing the resource: an incomplete or
    // invalid mapping must reject without changing the card type on disk.
    if (Object.keys(stateMapping).length > 0) {
      this.verifyStateMapping(ctx, stateMapping, changeOp);
    }

    // Apply the workflow change to the card type resource (content + write).
    await resource.update(
      ctx.input.updateKey,
      ctx.input.operation as Operation<unknown>,
    );

    await this.applyCascade(ctx);
  }

  // Cascade: re-map each affected card's workflowState per the operation's
  // state mapping. Without a mapping no cards are touched.
  async applyCascade(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'edit') {
      throw new Error(
        'CardTypeWorkflowChangeHandler called with non-edit input',
      );
    }
    const cardTypeName = resourceNameToString(ctx.input.target);
    const changeOp = ctx.input.operation as ChangeOperation<string>;
    const stateMapping = changeOp.mappingTable?.stateMapping || {};

    if (Object.keys(stateMapping).length > 0) {
      await this.applyStateMapping(ctx, cardTypeName, stateMapping);
    }
  }

  // Cards using this card type: local project cards plus local template cards
  // (matches CardTypeResource's collectCards scoping).
  private affectedCards(ctx: MutationContext, cardTypeName: string): Card[] {
    const project = [...ctx.project.cards(undefined)];
    const templates = ctx.project.resources
      .templates(ResourcesFrom.localOnly)
      .flatMap((t) => t.templateObject().cards());
    return [...project, ...templates].filter(
      (c) => c.metadata?.cardType === cardTypeName,
    );
  }

  // Apply state mapping to all cards using this card type.
  private async applyStateMapping(
    ctx: MutationContext,
    cardTypeName: string,
    stateMapping: Record<string, string>,
  ): Promise<void> {
    const logger = getChildLogger({ module: 'card-type-workflow-change' });
    const cards = this.affectedCards(ctx, cardTypeName);
    const unmappedStates: string[] = [];

    const updatePromises = cards.map(async (card) => {
      if (card.metadata && card.metadata.workflowState) {
        const currentState = card.metadata.workflowState;
        const newState = stateMapping[currentState];

        if (newState && newState !== currentState) {
          logger.info(
            `Updating card '${card.key}': ${currentState} -> ${newState}`,
          );
          card.metadata.workflowState = newState;
          await ctx.project.updateCardMetadata(card, card.metadata);
        } else if (!newState && !unmappedStates.includes(currentState)) {
          unmappedStates.push(currentState);
        }
      }
    });

    await Promise.all(updatePromises);

    if (unmappedStates.length > 0) {
      logger.warn(
        `Found unmapped states that were not updated: ${unmappedStates.join(', ')}`,
      );
    }
  }

  // Verifies that:
  // - all states in the current workflow are covered in the state mapping
  // - the mapped target states all exist in the new workflow
  private verifyStateMapping(
    ctx: MutationContext,
    stateMapping: Record<string, string>,
    op: ChangeOperation<string>,
  ): void {
    const currentWorkflowName = op.target as string;
    const currentWorkflow = ctx.project.resources
      .byType(currentWorkflowName, 'workflows')
      .show();
    if (!currentWorkflow) {
      throw new Error(
        `Workflow '${currentWorkflowName}' does not exist in the project`,
      );
    }

    const newWorkflow = ctx.project.resources
      .byType(op.to as string, 'workflows')
      .show();
    if (!newWorkflow) {
      throw new Error(`Workflow '${op.to}' does not exist in the project`);
    }

    const currentWorkflowStates = currentWorkflow.states.map(
      (state) => state.name,
    );
    const mappedSourceStates = Object.keys(stateMapping);
    const unmappedCurrentStates = currentWorkflowStates.filter(
      (stateName) => !mappedSourceStates.includes(stateName),
    );

    if (unmappedCurrentStates.length > 0) {
      throw new Error(
        `State mapping validation failed: The following states exist in the current workflow '${currentWorkflowName}' ` +
          `but are not mapped from in the state mapping JSON file: ${unmappedCurrentStates.join(', ')}. ` +
          `Please ensure all states in the current workflow are accounted for in the mapping to ensure all cards are properly updated.`,
      );
    }

    const newWorkflowStates = newWorkflow.states.map((state) => state.name);
    const mappedTargetStates = Object.values(stateMapping);
    const invalidTargetStates = mappedTargetStates.filter(
      (stateName) => !newWorkflowStates.includes(stateName),
    );

    if (invalidTargetStates.length > 0) {
      throw new Error(
        `State mapping validation failed: The following target states in the mapping do not exist in the new workflow '${op.to}': ${invalidTargetStates.join(', ')}.`,
      );
    }
  }
}
