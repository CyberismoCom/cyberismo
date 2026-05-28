import type { Handler, MutationContext } from '../handler.js';
import type { CascadePreview } from '../types.js';
import { resourceNameToString } from '../../utils/resource-utils.js';
import type {
  Operation,
  RemoveOperation,
} from '../../resources/resource-object.js';
import type {
  Workflow,
  WorkflowState,
} from '../../interfaces/resource-interfaces.js';
import { ResourcesFrom } from '../../containers/project/resources-from.js';

export class WorkflowRemoveStateHandler implements Handler {
  readonly isBreaking = true;

  matches(ctx: MutationContext): boolean {
    return (
      ctx.input.kind === 'edit' &&
      ctx.input.target.type === 'workflows' &&
      ctx.input.updateKey.key === 'states' &&
      ctx.input.operation.name === 'remove'
    );
  }

  async preview(ctx: MutationContext): Promise<CascadePreview> {
    if (ctx.input.kind !== 'edit') {
      throw new Error('WorkflowRemoveStateHandler: non-edit input');
    }
    const wfName = resourceNameToString(ctx.input.target);
    const stateName = this.targetStateName(ctx.input.operation);
    const removeOp = ctx.input.operation as RemoveOperation<WorkflowState>;
    const replacement = removeOp.replacementValue?.name;

    const affectedCards = await this.cardsInState(ctx, wfName, stateName);
    const dataLoss = !replacement; // no explicit replacement = data loss
    const replacementText = replacement
      ? `moved to '${replacement}'`
      : 'moved to the workflow\'s first remaining state (data loss)';
    return {
      affectedCardCount: affectedCards.length,
      affectedLinkCount: 0,
      affectedCalculationCount: 0,
      affectedHandlebarFileCount: 0,
      dataLossExpected: dataLoss,
      summary: `Removes state '${stateName}' from ${wfName}; ${affectedCards.length} card(s) ${replacementText}.`,
    };
  }

  async applyCascade(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'edit') {
      throw new Error('WorkflowRemoveStateHandler: non-edit input');
    }
    const wfName = resourceNameToString(ctx.input.target);
    const stateName = this.targetStateName(ctx.input.operation);
    const removeOp = ctx.input.operation as RemoveOperation<WorkflowState>;

    // Determine the replacement state name from the operation.
    // Note: for foreign workflows, the workflow resource may not be locally
    // available; we fall back gracefully using the operation's replacementValue.
    const explicit = removeOp.replacementValue?.name;

    // Try to get remaining states from local workflow resource.
    const resource = ctx.project.resources.byType(wfName, 'workflows');
    let replacementName: string | undefined;
    if (explicit) {
      replacementName = explicit;
    } else if (resource) {
      const wf = resource.data as Workflow | undefined;
      if (wf) {
        const remainingStates = wf.states.filter((s) => s.name !== stateName);
        if (remainingStates.length > 0) {
          replacementName = remainingStates[0].name;
        }
      }
    }

    if (!replacementName) {
      // Can't migrate cards without a target state; skip silently in cascade-only path.
      return;
    }

    // Move every local card currently in the removed state.
    const affectedCards = await this.cardsInState(ctx, wfName, stateName);
    for (const card of affectedCards) {
      if (card.metadata) {
        card.metadata.workflowState = replacementName;
        await ctx.project.updateCardMetadata(card, card.metadata);
      }
    }
  }

  async applyResourceOp(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'edit') {
      throw new Error('WorkflowRemoveStateHandler: non-edit input');
    }
    const wfName = resourceNameToString(ctx.input.target);
    const resource = ctx.project.resources.byType(wfName, 'workflows');
    if (!resource) {
      throw new Error(`Workflow '${wfName}' not found`);
    }
    const stateName = this.targetStateName(ctx.input.operation);
    const removeOp = ctx.input.operation as RemoveOperation<WorkflowState>;

    // Validate that we're not removing the only remaining state.
    const wf = resource.data as Workflow | undefined;
    if (!wf) throw new Error(`Workflow '${wfName}' has no data`);
    const remainingStates = wf.states.filter((s) => s.name !== stateName);
    if (remainingStates.length === 0) {
      throw new Error(
        `Cannot remove the only state of workflow '${wfName}'.`,
      );
    }
    const explicit = removeOp.replacementValue?.name;
    if (explicit && !remainingStates.some((s) => s.name === explicit)) {
      throw new Error(
        `Replacement state '${explicit}' is not a state of workflow '${wfName}'.`,
      );
    }

    // Perform the actual `states` remove. WorkflowResource.update
    // internally rewrites transitions (removes or substitutes references
    // depending on whether a replacementValue is present) and removes
    // the state.
    await resource.update(
      { key: 'states' },
      ctx.input.operation as Operation<WorkflowState>,
    );
  }

  async affectedFilePaths(ctx: MutationContext): Promise<string[]> {
    if (ctx.input.kind !== 'edit') return [];
    const wfName = resourceNameToString(ctx.input.target);
    const stateName = this.targetStateName(ctx.input.operation);
    const cards = await this.cardsInState(ctx, wfName, stateName);
    return cards.map((c) => `${c.path}/index.json`);
  }

  private targetStateName(op: Operation<unknown>): string {
    const t = op.target as { name?: string } | string;
    if (typeof t === 'string') return t;
    if (t && typeof t === 'object' && typeof t.name === 'string') return t.name;
    throw new Error('WorkflowRemoveStateHandler: target has no state name');
  }

  private async cardsInState(
    ctx: MutationContext,
    workflowName: string,
    stateName: string,
  ) {
    const cardTypes = ctx.project.resources
      .cardTypes(ResourcesFrom.localOnly)
      .filter((ct) => ct.data?.workflow === workflowName);
    const cardTypeNames = new Set(cardTypes.map((ct) => ct.data!.name));
    const allCards = ctx.project.cards(undefined);
    return allCards.filter(
      (c) =>
        c.metadata &&
        cardTypeNames.has(c.metadata.cardType) &&
        c.metadata.workflowState === stateName,
    );
  }
}
