import { join } from 'node:path';

import type { Handler, MutationContext } from '../handler.js';
import type { CascadePreview } from '../types.js';
import { resourceNameToString } from '../../utils/resource-utils.js';
import type { Card } from '../../interfaces/project-interfaces.js';
import type {
  Operation,
  RemoveOperation,
} from '../../resources/resource-object.js';
import type { CustomField } from '../../interfaces/resource-interfaces.js';

export class CardTypeRemoveCustomFieldHandler implements Handler {
  readonly isBreaking = true;

  matches(ctx: MutationContext): boolean {
    if (ctx.input.kind !== 'edit') return false;
    if (ctx.input.target.type !== 'cardTypes') return false;
    return (
      ctx.input.updateKey.key === 'customFields' &&
      ctx.input.operation.name === 'remove'
    );
  }

  async preview(ctx: MutationContext): Promise<CascadePreview> {
    const cards = this.affectedCards(ctx);
    return {
      affectedCardCount: cards.length,
      affectedLinkCount: 0,
      affectedCalculationCount: 0,
      affectedHandlebarFileCount: 0,
      dataLossExpected: true,
      summary: `Removes the field key from ${cards.length} cards (data loss).`,
    };
  }

  async apply(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'edit') {
      throw new Error('CardTypeRemoveCustomFieldHandler called with non-edit input');
    }
    const cardTypeName = resourceNameToString(ctx.input.target);
    const resource = ctx.project.resources.byType(cardTypeName, 'cardTypes');
    if (!resource) throw new Error(`CardType '${cardTypeName}' not found`);

    // Apply the resource-level remove. This drops the entry from customFields
    // and (post-trim) also strips the same value from alwaysVisibleFields and
    // optionallyVisibleFields — we duplicate that strip here so the handler
    // remains correct even after the resource class is trimmed.
    await resource.update(ctx.input.updateKey, ctx.input.operation as Operation<unknown>);

    const fieldName = this.fieldName(
      ctx.input.operation as RemoveOperation<CustomField | string>,
    );

    // Strip from alwaysVisibleFields and optionallyVisibleFields on the resource.
    const after = resource.show() as {
      alwaysVisibleFields?: string[];
      optionallyVisibleFields?: string[];
    };
    if ((after.alwaysVisibleFields ?? []).includes(fieldName)) {
      await resource.update(
        { key: 'alwaysVisibleFields' },
        { name: 'remove', target: fieldName } as RemoveOperation<string>,
      );
    }
    if ((after.optionallyVisibleFields ?? []).includes(fieldName)) {
      await resource.update(
        { key: 'optionallyVisibleFields' },
        { name: 'remove', target: fieldName } as RemoveOperation<string>,
      );
    }

    // Clear the field from every card of this type.
    for (const card of this.affectedCards(ctx)) {
      if (!card.metadata) continue;
      if (Object.prototype.hasOwnProperty.call(card.metadata, fieldName)) {
        delete card.metadata[fieldName];
        await ctx.project.updateCardMetadata(card, card.metadata);
      }
    }
  }

  async affectedFilePaths(ctx: MutationContext): Promise<string[]> {
    return this.affectedCards(ctx).map((c) => join(c.path, 'index.json'));
  }

  private affectedCards(ctx: MutationContext): Card[] {
    if (ctx.input.kind !== 'edit') return [];
    const cardTypeName = resourceNameToString(ctx.input.target);
    return [...ctx.project.cards(undefined)].filter(
      (c) => c.metadata?.cardType === cardTypeName,
    );
  }

  private fieldName(op: RemoveOperation<CustomField | string>): string {
    const target = op.target;
    if (typeof target === 'string') return target;
    return (target as CustomField).name;
  }
}
