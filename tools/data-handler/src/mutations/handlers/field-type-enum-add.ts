// tools/data-handler/src/mutations/handlers/field-type-enum-add.ts

import type { Handler, MutationContext } from '../handler.js';
import type { CascadePreview } from '../types.js';
import { resourceNameToString } from '../../utils/resource-utils.js';

export class FieldTypeEnumAddHandler implements Handler {
  readonly isBreaking = false;

  matches(ctx: MutationContext): boolean {
    return (
      ctx.input.kind === 'edit' &&
      ctx.input.target.type === 'fieldTypes' &&
      ctx.input.updateKey.key === 'enumValues' &&
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
      summary: 'Adds a new enum value (no cascade effects).',
    };
  }

  /**
   * Adding an enum value has no consumer-side cascade: existing cards keep
   * their current values and are unaffected by the new option.
   */
  async applyCascade(): Promise<void> {
    // No-op: no consumer references to rewrite.
  }

  async applyResourceOp(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'edit') {
      throw new Error('FieldTypeEnumAddHandler: non-edit input');
    }
    const fieldName = resourceNameToString(ctx.input.target);
    const resource = ctx.project.resources.byType(fieldName, 'fieldTypes');
    if (!resource) {
      throw new Error(`Field type '${fieldName}' not found`);
    }
    await resource.update(ctx.input.updateKey, ctx.input.operation);
  }

  async affectedFilePaths(): Promise<string[]> {
    return [];
  }
}
