// tools/data-handler/src/mutations/handlers/field-type-enum-rename.ts

import { join } from 'node:path';

import type { Handler, MutationContext } from '../handler.js';
import type { CascadePreview } from '../types.js';
import { resourceNameToString } from '../../utils/resource-utils.js';
import { ResourcesFrom } from '../../containers/project/resources-from.js';
import type { EnumDefinition } from '../../interfaces/resource-interfaces.js';
import type { Card } from '../../interfaces/project-interfaces.js';
import type { ChangeOperation } from '../../resources/resource-object.js';

export class FieldTypeEnumRenameHandler implements Handler {
  readonly isBreaking = true;

  matches(ctx: MutationContext): boolean {
    if (
      ctx.input.kind !== 'edit' ||
      ctx.input.target.type !== 'fieldTypes' ||
      ctx.input.updateKey.key !== 'enumValues' ||
      ctx.input.operation.name !== 'change'
    ) {
      return false;
    }
    const op = ctx.input.operation as ChangeOperation<EnumDefinition>;
    return (op.target as EnumDefinition).enumValue !== (op.to as EnumDefinition).enumValue;
  }

  async preview(ctx: MutationContext): Promise<CascadePreview> {
    if (ctx.input.kind !== 'edit') {
      throw new Error('FieldTypeEnumRenameHandler: non-edit input');
    }
    const fieldName = resourceNameToString(ctx.input.target);
    const op = ctx.input.operation as ChangeOperation<EnumDefinition>;
    const oldValue = (op.target as EnumDefinition).enumValue;
    const affected = this.affectedCards(ctx, fieldName, oldValue);
    return {
      affectedCardCount: affected.length,
      affectedLinkCount: 0,
      affectedCalculationCount: 0,
      affectedHandlebarFileCount: 0,
      dataLossExpected: false,
      summary: `Renames enum value '${oldValue}' → '${(op.to as EnumDefinition).enumValue}' on ${affected.length} cards.`,
    };
  }

  async applyCascade(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'edit') {
      throw new Error('FieldTypeEnumRenameHandler: non-edit input');
    }
    const fieldName = resourceNameToString(ctx.input.target);
    const op = ctx.input.operation as ChangeOperation<EnumDefinition>;
    const oldValue = (op.target as EnumDefinition).enumValue;
    const newValue = (op.to as EnumDefinition).enumValue;

    // Rewrite each local card's and local template card's enum value.
    for (const card of this.affectedCards(ctx, fieldName, oldValue)) {
      const metadata = card.metadata!;
      metadata[fieldName] = newValue;
      await ctx.project.updateCardMetadata(card, metadata);
    }
  }

  async applyResourceOp(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'edit') {
      throw new Error('FieldTypeEnumRenameHandler: non-edit input');
    }
    const fieldName = resourceNameToString(ctx.input.target);

    // Apply the enum-array change to the resource definition.
    const resource = ctx.project.resources.byType(fieldName, 'fieldTypes');
    if (!resource) {
      throw new Error(`Field type '${fieldName}' not found`);
    }
    await resource.update(ctx.input.updateKey, ctx.input.operation);
  }

  async affectedFilePaths(ctx: MutationContext): Promise<string[]> {
    if (ctx.input.kind !== 'edit') return [];
    const fieldName = resourceNameToString(ctx.input.target);
    const op = ctx.input.operation as ChangeOperation<EnumDefinition>;
    const oldValue = (op.target as EnumDefinition).enumValue;
    return this.affectedCards(ctx, fieldName, oldValue).map((c) =>
      join(c.path, 'index.json'),
    );
  }

  private affectedCards(
    ctx: MutationContext,
    fieldName: string,
    value: string,
  ): Card[] {
    const rootCards = ctx.project.cards(undefined);
    const templateCards = ctx.project.resources
      .templates(ResourcesFrom.localOnly)
      .flatMap((t) => t.templateObject().cards());
    return [...rootCards, ...templateCards].filter(
      (c) => c.metadata?.[fieldName] === value,
    );
  }
}
