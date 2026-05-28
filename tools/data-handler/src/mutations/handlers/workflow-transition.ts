import type { Handler, MutationContext } from '../handler.js';
import type { CascadePreview } from '../types.js';
import { resourceNameToString } from '../../utils/resource-utils.js';

export class WorkflowTransitionHandler implements Handler {
  readonly isBreaking = false;

  matches(ctx: MutationContext): boolean {
    return (
      ctx.input.kind === 'edit' &&
      ctx.input.target.type === 'workflows' &&
      ctx.input.updateKey.key === 'transitions' &&
      ['add', 'remove', 'change'].includes(ctx.input.operation.name)
    );
  }

  async preview(): Promise<CascadePreview> {
    return {
      affectedCardCount: 0,
      affectedLinkCount: 0,
      affectedCalculationCount: 0,
      affectedHandlebarFileCount: 0,
      dataLossExpected: false,
      summary: 'Transition definition change (non-breaking).',
    };
  }

  /** No consumer cascade — transitions are workflow-internal. */
  async applyCascade(): Promise<void> {
    // Nothing to cascade.
  }

  async applyResourceOp(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'edit') {
      throw new Error('WorkflowTransitionHandler: non-edit input');
    }
    const name = resourceNameToString(ctx.input.target);
    const resource = ctx.project.resources.byType(name, 'workflows');
    if (!resource) throw new Error(`Workflow '${name}' not found`);
    await resource.update(ctx.input.updateKey, ctx.input.operation);
  }

  async affectedFilePaths(): Promise<string[]> {
    return [];
  }
}
