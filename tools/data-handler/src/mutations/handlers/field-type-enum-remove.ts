// tools/data-handler/src/mutations/handlers/field-type-enum-remove.ts

import { join } from 'node:path';

import type { Handler, MutationContext } from '../handler.js';
import type { CascadePreview } from '../types.js';
import { resourceNameToString } from '../../utils/resource-utils.js';
import type {
  EnumDefinition,
} from '../../interfaces/resource-interfaces.js';
import type { Card } from '../../interfaces/project-interfaces.js';
import type { RemoveOperation } from '../../resources/resource-object.js';

export class FieldTypeEnumRemoveHandler implements Handler {
  readonly isBreaking = true;

  matches(ctx: MutationContext): boolean {
    return (
      ctx.input.kind === 'edit' &&
      ctx.input.target.type === 'fieldTypes' &&
      ctx.input.updateKey.key === 'enumValues' &&
      ctx.input.operation.name === 'remove'
    );
  }

  async preview(ctx: MutationContext): Promise<CascadePreview> {
    if (ctx.input.kind !== 'edit') {
      throw new Error('FieldTypeEnumRemoveHandler: non-edit input');
    }
    const fieldName = resourceNameToString(ctx.input.target);
    const op = ctx.input.operation as RemoveOperation<EnumDefinition>;
    const removed = (op.target as EnumDefinition).enumValue;
    const affected = this.affectedCards(ctx, fieldName, removed);
    const replacement = (op.replacementValue as EnumDefinition | undefined)
      ?.enumValue;
    return {
      affectedCardCount: affected.length,
      affectedLinkCount: 0,
      affectedCalculationCount: 0,
      affectedHandlebarFileCount: 0,
      dataLossExpected: replacement === undefined && affected.length > 0,
      summary: replacement
        ? `Replaces '${removed}' with '${replacement}' on ${affected.length} cards.`
        : `Removes '${removed}' (sets ${affected.length} cards to null).`,
    };
  }

  async apply(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'edit') {
      throw new Error('FieldTypeEnumRemoveHandler: non-edit input');
    }
    const fieldName = resourceNameToString(ctx.input.target);
    const op = ctx.input.operation as RemoveOperation<EnumDefinition>;
    const removed = (op.target as EnumDefinition).enumValue;
    const replacement = (op.replacementValue as EnumDefinition | undefined)
      ?.enumValue;

    // 1. Cascade: rewrite or null the value on every affected card.
    for (const card of this.affectedCards(ctx, fieldName, removed)) {
      const metadata = card.metadata!;
      metadata[fieldName] = replacement ?? null;
      await ctx.project.updateCardMetadata(card, metadata);
    }

    // 2. Remove the enum entry from the field type definition.
    const resource = ctx.project.resources.byType(fieldName, 'fieldTypes');
    if (!resource) {
      throw new Error(`Field type '${fieldName}' not found`);
    }
    await resource.update(ctx.input.updateKey, ctx.input.operation);
  }

  async affectedFilePaths(ctx: MutationContext): Promise<string[]> {
    if (ctx.input.kind !== 'edit') return [];
    const fieldName = resourceNameToString(ctx.input.target);
    const op = ctx.input.operation as RemoveOperation<EnumDefinition>;
    const removed = (op.target as EnumDefinition).enumValue;
    return this.affectedCards(ctx, fieldName, removed).map((c) =>
      join(c.path, 'index.json'),
    );
  }

  private affectedCards(
    ctx: MutationContext,
    fieldName: string,
    removed: string,
  ): Card[] {
    const all = [
      ...ctx.project.cards(undefined),
      ...ctx.project.allTemplateCards(),
    ];
    return all.filter((c) => c.metadata?.[fieldName] === removed);
  }
}
