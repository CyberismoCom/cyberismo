import { join } from 'node:path';

import type { Handler, MutationContext } from '../handler.js';
import type { CascadePreview } from '../types.js';
import { resourceNameToString } from '../../utils/resource-utils.js';
import { ResourcesFrom } from '../../containers/project/resources-from.js';
import type { Card } from '../../interfaces/project-interfaces.js';
import type {
  AddOperation,
  Operation,
} from '../../resources/resource-object.js';
import type { CustomField } from '../../interfaces/resource-interfaces.js';

export class CardTypeAddCustomFieldHandler implements Handler {
  readonly isBreaking = true;

  matches(ctx: MutationContext): boolean {
    if (ctx.input.kind !== 'edit') return false;
    if (ctx.input.target.type !== 'cardTypes') return false;
    return (
      ctx.input.updateKey.key === 'customFields' &&
      ctx.input.operation.name === 'add'
    );
  }

  async preview(ctx: MutationContext): Promise<CascadePreview> {
    const cards = this.affectedCards(ctx);
    return {
      affectedCardCount: cards.length,
      affectedLinkCount: 0,
      affectedCalculationCount: 0,
      affectedHandlebarFileCount: 0,
      dataLossExpected: false,
      summary: `Adds the field as null on ${cards.length} cards.`,
    };
  }

  async validate(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'edit') return;
    const fieldName = this.fieldName(ctx.input.operation as AddOperation<CustomField | string>);
    // Field type must exist locally OR in any installed module.
    const exists = ctx.project.resources.exists(fieldName);
    if (!exists) {
      throw new Error(`Field type '${fieldName}' does not exist in the project`);
    }
  }

  async applyCascade(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'edit') return;
    const fieldName = this.fieldName(ctx.input.operation as AddOperation<CustomField | string>);

    // Add null for the new field on every local card of this card type.
    for (const card of this.affectedCards(ctx)) {
      if (!card.metadata) continue;
      card.metadata[fieldName] = null;
      await ctx.project.updateCardMetadata(card, card.metadata);
    }

    // Also add null on local template cards of this card type.
    const cardTypeName = resourceNameToString(ctx.input.target);
    const templateCards = ctx.project.resources
      .templates(ResourcesFrom.localOnly)
      .flatMap((t) => t.templateObject().cards())
      .filter((c) => c.metadata?.cardType === cardTypeName);
    for (const card of templateCards) {
      if (!card.metadata) continue;
      card.metadata[fieldName] = null;
      await ctx.project.updateCardMetadata(card, card.metadata);
    }
  }

  async applyResourceOp(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'edit') {
      throw new Error('CardTypeAddCustomFieldHandler called with non-edit input');
    }
    const cardTypeName = resourceNameToString(ctx.input.target);
    const resource = ctx.project.resources.byType(cardTypeName, 'cardTypes');
    if (!resource) throw new Error(`CardType '${cardTypeName}' not found`);
    await resource.update(ctx.input.updateKey, ctx.input.operation as Operation<unknown>);
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

  private fieldName(op: AddOperation<CustomField | string>): string {
    const target = op.target;
    if (typeof target === 'string') return target;
    return (target as CustomField).name;
  }
}
