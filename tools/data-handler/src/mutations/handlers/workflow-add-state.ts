// tools/data-handler/src/mutations/handlers/workflow-add-state.ts

import type { Handler, MutationContext } from '../handler.js';
import type { CascadePreview } from '../types.js';
import { resourceNameToString } from '../../utils/resource-utils.js';

export class WorkflowAddStateHandler implements Handler {
  readonly isBreaking = false;

  matches(ctx: MutationContext): boolean {
    return (
      ctx.input.kind === 'edit' &&
      ctx.input.target.type === 'workflows' &&
      ctx.input.updateKey.key === 'states' &&
      ctx.input.operation.name === 'add'
    );
  }

  async preview(): Promise<CascadePreview> {
    return {
      affectedCardCount: 0,
      affectedLinkCount: 0,
      affectedCalculationCount: 0,
      affectedHandlebarFileCount: 0,
      dataLossExpected: false,
      summary: 'Adds a new state (additive change).',
    };
  }

  /** No cascade — adding a state affects no consumers. */
  async applyCascade(_ctx: MutationContext): Promise<void> {
    // Nothing to cascade.
  }

  async applyResourceOp(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'edit') {
      throw new Error('WorkflowAddStateHandler called with non-edit input');
    }
    const name = resourceNameToString(ctx.input.target);
    const resource = ctx.project.resources.byType(name, 'workflows');
    if (!resource) {
      throw new Error(`Workflow '${name}' not found`);
    }
    await resource.update(ctx.input.updateKey, ctx.input.operation);
  }

  async affectedFilePaths(): Promise<string[]> {
    return [];
  }
}
