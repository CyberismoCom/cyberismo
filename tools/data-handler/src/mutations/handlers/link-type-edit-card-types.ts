// tools/data-handler/src/mutations/handlers/link-type-edit-card-types.ts

import type { Handler, MutationContext } from '../handler.js';
import type { CascadePreview } from '../types.js';
import { resourceNameToString } from '../../utils/resource-utils.js';
import type { AddOperation, Operation } from '../../resources/resource-object.js';

/**
 * Handles edits to link-type `sourceCardTypes` and `destinationCardTypes` arrays.
 *
 * Validates that any card type being added actually exists in the project
 * (local or any installed module). Emits no cascade — updating these arrays
 * does not affect existing card data.
 */
export class LinkTypeEditCardTypesHandler implements Handler {
  readonly isBreaking = false;

  matches(ctx: MutationContext): boolean {
    if (ctx.input.kind !== 'edit') return false;
    if (ctx.input.target.type !== 'linkTypes') return false;
    const key = ctx.input.updateKey.key;
    return key === 'sourceCardTypes' || key === 'destinationCardTypes';
  }

  async validate(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'edit') return;
    const op = ctx.input.operation as AddOperation<string>;
    // Only 'add' operations introduce a new card type reference.
    if (op.name !== 'add') return;
    const cardTypeName = typeof op.target === 'string' ? op.target : String(op.target);
    if (!ctx.project.resources.exists(cardTypeName)) {
      throw new Error(
        `Card type '${cardTypeName}' does not exist in the project`,
      );
    }
  }

  async preview(): Promise<CascadePreview> {
    return {
      affectedCardCount: 0,
      affectedLinkCount: 0,
      affectedCalculationCount: 0,
      affectedHandlebarFileCount: 0,
      dataLossExpected: false,
      summary: '(no cascade effects)',
    };
  }

  async applyResourceOp(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'edit') {
      throw new Error('LinkTypeEditCardTypesHandler called with non-edit input');
    }
    const name = resourceNameToString(ctx.input.target);
    const resource = ctx.project.resources.byType(name, 'linkTypes');
    if (!resource) throw new Error(`Link type '${name}' not found`);
    await resource.update(ctx.input.updateKey, ctx.input.operation as Operation<unknown>);
  }

  async affectedFilePaths(): Promise<string[]> {
    return [];
  }
}
