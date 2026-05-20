// tools/data-handler/src/mutations/handlers/default-no-cascade.ts

import type { Handler, MutationContext } from '../handler.js';
import type { CascadePreview } from '../types.js';

export class DefaultNoCascadeHandler implements Handler {
  readonly isBreaking = false;

  matches(ctx: MutationContext): boolean {
    // Catch-all: dispatcher consults specific handlers first.
    return ctx.input.kind === 'edit';
  }

  async preview(_ctx: MutationContext): Promise<CascadePreview> {
    return {
      affectedCardCount: 0,
      affectedLinkCount: 0,
      affectedCalculationCount: 0,
      affectedHandlebarFileCount: 0,
      dataLossExpected: false,
      summary: '(no cascade effects)',
    };
  }

  async apply(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'edit') {
      throw new Error('DefaultNoCascadeHandler only supports edits');
    }
    const { target, updateKey, operation } = ctx.input;
    const type = ctx.project.resources.extractType(
      `${target.prefix}/${target.type}/${target.identifier}`,
    );
    const resource = ctx.project.resources.byType(
      `${target.prefix}/${target.type}/${target.identifier}`,
      type,
    );
    if (!resource) {
      throw new Error('Resource not found');
    }
    await resource.update(updateKey, operation);
  }
}
