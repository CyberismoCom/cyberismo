import { join } from 'node:path';

import type { Handler, MutationContext } from '../handler.js';
import type { CascadePreview } from '../types.js';
import { resourceNameToString } from '../../utils/resource-utils.js';
import type { Card } from '../../interfaces/project-interfaces.js';
import type { ChangeOperation } from '../../resources/resource-object.js';

export class CardTypeWorkflowChangeHandler implements Handler {
  readonly isBreaking = true;

  matches(ctx: MutationContext): boolean {
    if (ctx.input.kind !== 'edit') return false;
    if (ctx.input.target.type !== 'cardTypes') return false;
    return (
      ctx.input.updateKey.key === 'workflow' &&
      ctx.input.operation.name === 'change'
    );
  }

  async preview(ctx: MutationContext): Promise<CascadePreview> {
    const { mapping } = this.deconstruct(ctx);
    const cards = this.affectedCards(ctx);
    const dataLoss = Object.keys(mapping).length === 0 && cards.length > 0;
    return {
      affectedCardCount: cards.length,
      affectedLinkCount: 0,
      affectedCalculationCount: 0,
      affectedHandlebarFileCount: 0,
      dataLossExpected: dataLoss,
      summary: dataLoss
        ? `Resets workflowState on ${cards.length} cards to the first state of the new workflow.`
        : `Re-maps workflowState on ${cards.length} cards via state mapping.`,
    };
  }

  async apply(ctx: MutationContext): Promise<void> {
    const { op, mapping, newWorkflowName, cardTypeName } = this.deconstruct(ctx);

    // 1. Validate mapping when provided.
    if (Object.keys(mapping).length > 0) {
      this.verifyStateMapping(ctx, mapping, op);
    }

    // 2. Update the card type's workflow reference via the existing resource update.
    const resource = ctx.project.resources.byType(cardTypeName, 'cardTypes');
    if (!resource) throw new Error(`CardType '${cardTypeName}' not found`);
    // Pass through with mapping stripped so the existing card-type-resource.update
    // (post-trim) doesn't double-fire the cascade. We rewrite cards here.
    const updateOp: ChangeOperation<string> = {
      name: 'change',
      target: op.target as string,
      to: op.to as string,
    } as ChangeOperation<string>;
    await resource.update({ key: 'workflow' }, updateOp);

    // 3. Walk the affected cards.
    const cards = this.affectedCards(ctx);
    const newWorkflow = ctx.project.resources
      .byType(newWorkflowName, 'workflows')
      .show();
    if (!newWorkflow) {
      throw new Error(`Workflow '${newWorkflowName}' does not exist`);
    }
    const firstState = newWorkflow.states[0]?.name;
    if (!firstState) {
      throw new Error(`Workflow '${newWorkflowName}' has no states`);
    }

    for (const card of cards) {
      const metadata = card.metadata;
      if (!metadata) continue;
      const current = metadata.workflowState;
      const next =
        Object.keys(mapping).length > 0 ? mapping[current] ?? firstState : firstState;
      if (next !== current) {
        metadata.workflowState = next;
        await ctx.project.updateCardMetadata(card, metadata);
      }
    }
  }

  async affectedFilePaths(ctx: MutationContext): Promise<string[]> {
    return this.affectedCards(ctx).map((c) => join(c.path, 'index.json'));
  }

  private deconstruct(ctx: MutationContext) {
    if (ctx.input.kind !== 'edit') {
      throw new Error('CardTypeWorkflowChangeHandler called with non-edit input');
    }
    const op = ctx.input.operation as ChangeOperation<string>;
    const mapping = op.mappingTable?.stateMapping ?? {};
    return {
      op,
      mapping,
      cardTypeName: resourceNameToString(ctx.input.target),
      newWorkflowName: op.to as string,
    };
  }

  private affectedCards(ctx: MutationContext): Card[] {
    if (ctx.input.kind !== 'edit') return [];
    const cardTypeName = resourceNameToString(ctx.input.target);
    return [...ctx.project.cards(undefined)].filter(
      (c) => c.metadata?.cardType === cardTypeName,
    );
  }

  // Ported from CardTypeResource.verifyStateMapping.
  private verifyStateMapping(
    ctx: MutationContext,
    mapping: Record<string, string>,
    op: ChangeOperation<string>,
  ) {
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
    const currentStates = currentWorkflow.states.map((s) => s.name);
    const mappedSources = Object.keys(mapping);
    const unmappedSources = currentStates.filter(
      (s) => !mappedSources.includes(s),
    );
    if (unmappedSources.length > 0) {
      throw new Error(
        `State mapping validation failed: The following states exist in the current workflow '${currentWorkflowName}' ` +
          `but are not mapped from in the state mapping JSON file: ${unmappedSources.join(', ')}. ` +
          `Please ensure all states in the current workflow are accounted for in the mapping to ensure all cards are properly updated.`,
      );
    }
    const newStates = newWorkflow.states.map((s) => s.name);
    const invalidTargets = Object.values(mapping).filter(
      (s) => !newStates.includes(s),
    );
    if (invalidTargets.length > 0) {
      throw new Error(
        `State mapping validation failed: The following target states in the mapping do not exist in the new workflow '${op.to}': ${invalidTargets.join(', ')}.`,
      );
    }
  }
}
