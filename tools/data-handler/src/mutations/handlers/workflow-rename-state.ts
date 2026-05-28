import type { Handler, MutationContext } from '../handler.js';
import type { CascadePreview } from '../types.js';
import { resourceNameToString } from '../../utils/resource-utils.js';
import type {
  ChangeOperation,
  Operation,
} from '../../resources/resource-object.js';
import type {
  Workflow,
  WorkflowState,
} from '../../interfaces/resource-interfaces.js';
import { ResourcesFrom } from '../../containers/project/resources-from.js';

export class WorkflowRenameStateHandler implements Handler {
  readonly isBreaking = true;

  matches(ctx: MutationContext): boolean {
    if (ctx.input.kind !== 'edit') return false;
    if (ctx.input.target.type !== 'workflows') return false;
    if (ctx.input.updateKey.key !== 'states') return false;
    if (ctx.input.operation.name !== 'change') return false;

    // Differentiate a state rename from a state category change. The
    // discriminator: `to.name` must differ from `target.name`.
    const op = ctx.input.operation as ChangeOperation<unknown>;
    const targetName = (op.target as { name?: string }).name;
    const toName = (op.to as { name?: string }).name;
    return typeof targetName === 'string' && typeof toName === 'string' && targetName !== toName;
  }

  async preview(ctx: MutationContext): Promise<CascadePreview> {
    if (ctx.input.kind !== 'edit') {
      throw new Error('WorkflowRenameStateHandler: non-edit input');
    }
    const wfName = resourceNameToString(ctx.input.target);
    const op = ctx.input.operation as ChangeOperation<WorkflowState>;
    const oldName = (op.target as { name: string }).name;
    const affected = await this.cardsInState(ctx, wfName, oldName);
    return {
      affectedCardCount: affected.length,
      affectedLinkCount: 0,
      affectedCalculationCount: 0,
      affectedHandlebarFileCount: 0,
      dataLossExpected: false,
      summary: `Renames state '${oldName}' to '${op.to.name}' on ${affected.length} card(s) and across all transitions.`,
    };
  }

  async applyCascade(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'edit') {
      throw new Error('WorkflowRenameStateHandler: non-edit input');
    }
    const wfName = resourceNameToString(ctx.input.target);
    const op = ctx.input.operation as ChangeOperation<WorkflowState>;
    const oldName = (op.target as { name: string }).name;
    const newName = op.to.name;

    // Rewrite workflowState on every local card in the old state.
    const affected = await this.cardsInState(ctx, wfName, oldName);
    for (const card of affected) {
      if (card.metadata) {
        card.metadata.workflowState = newName;
        await ctx.project.updateCardMetadata(card, card.metadata);
      }
    }
  }

  async applyResourceOp(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'edit') {
      throw new Error('WorkflowRenameStateHandler: non-edit input');
    }
    const wfName = resourceNameToString(ctx.input.target);
    const resource = ctx.project.resources.byType(wfName, 'workflows');
    if (!resource) throw new Error(`Workflow '${wfName}' not found`);
    const op = ctx.input.operation as ChangeOperation<WorkflowState>;
    const oldName = (op.target as { name: string }).name;
    const newName = op.to.name;
    if (op.to.category === undefined) {
      throw new Error(
        `Cannot change state '${oldName}': missing 'category' in target value.`,
      );
    }

    // Rename the state itself via the resource's existing array-handling path.
    await resource.update({ key: 'states' }, ctx.input.operation as Operation<WorkflowState>);

    // Rewrite every transition's fromState / toState.
    const wf = resource.data as Workflow;
    for (const transition of [...wf.transitions]) {
      const touchesOld =
        transition.toState === oldName || transition.fromState.includes(oldName);
      if (!touchesOld) continue;
      const updated = {
        ...transition,
        toState: transition.toState === oldName ? newName : transition.toState,
        fromState: transition.fromState.map((s) => (s === oldName ? newName : s)),
      };
      await resource.update(
        { key: 'transitions' },
        { name: 'change', target: transition, to: updated },
      );
    }
  }

  async affectedFilePaths(ctx: MutationContext): Promise<string[]> {
    if (ctx.input.kind !== 'edit') return [];
    const wfName = resourceNameToString(ctx.input.target);
    const op = ctx.input.operation as ChangeOperation<WorkflowState>;
    const oldName = (op.target as { name: string }).name;
    const cards = await this.cardsInState(ctx, wfName, oldName);
    return cards.map((c) => `${c.path}/index.json`);
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
    return ctx.project
      .cards(undefined)
      .filter(
        (c) =>
          c.metadata &&
          cardTypeNames.has(c.metadata.cardType) &&
          c.metadata.workflowState === stateName,
      );
  }
}
