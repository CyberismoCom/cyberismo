// tools/data-handler/src/mutations/handlers/field-type-delete.ts

import { join } from 'node:path';

import type { Handler, MutationContext } from '../handler.js';
import type { CascadePreview } from '../types.js';
import { resourceNameToString } from '../../utils/resource-utils.js';
import type { Card } from '../../interfaces/project-interfaces.js';

export class FieldTypeDeleteHandler implements Handler {
  readonly isBreaking = true;

  matches(ctx: MutationContext): boolean {
    return (
      ctx.input.kind === 'delete' && ctx.input.target.type === 'fieldTypes'
    );
  }

  async preview(ctx: MutationContext): Promise<CascadePreview> {
    if (ctx.input.kind !== 'delete') {
      throw new Error('FieldTypeDeleteHandler: non-delete input');
    }
    const fieldName = resourceNameToString(ctx.input.target);
    const cards = this.cardsWithField(ctx, fieldName);
    const cardTypes = this.cardTypesReferencing(ctx, fieldName);
    return {
      affectedCardCount: cards.length,
      affectedLinkCount: 0,
      affectedCalculationCount: 0,
      affectedHandlebarFileCount: 0,
      dataLossExpected: cards.length > 0,
      summary: `Deletes '${fieldName}'; strips it from ${cardTypes.length} card types and ${cards.length} cards.`,
    };
  }

  async apply(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'delete') {
      throw new Error('FieldTypeDeleteHandler: non-delete input');
    }
    const fieldName = resourceNameToString(ctx.input.target);

    // 1. Remove the field from every card type that references it.
    for (const cardType of this.cardTypesReferencing(ctx, fieldName)) {
      await cardType.update(
        { key: 'customFields' },
        { name: 'remove', target: { name: fieldName } } as never,
      );
    }

    // 2. Strip the field from every card carrying it.
    for (const card of this.cardsWithField(ctx, fieldName)) {
      const metadata = card.metadata!;
      delete metadata[fieldName];
      await ctx.project.updateCardMetadata(card, metadata);
    }

    // 3. Delete the resource itself.
    const resource = ctx.project.resources.byType(fieldName, 'fieldTypes');
    if (!resource) {
      throw new Error(`Field type '${fieldName}' not found`);
    }
    await resource.delete();
  }

  async affectedFilePaths(ctx: MutationContext): Promise<string[]> {
    if (ctx.input.kind !== 'delete') return [];
    const fieldName = resourceNameToString(ctx.input.target);
    const cardPaths = this.cardsWithField(ctx, fieldName).map((c) =>
      join(c.path, 'index.json'),
    );
    const cardTypePaths = this.cardTypesReferencing(ctx, fieldName).map(
      (ct) => ct.fileName,
    );
    return [...cardPaths, ...cardTypePaths];
  }

  private cardsWithField(ctx: MutationContext, fieldName: string): Card[] {
    const all = [
      ...ctx.project.cards(undefined),
      ...ctx.project.allTemplateCards(),
    ];
    return all.filter((c) => c.metadata && fieldName in c.metadata);
  }

  private cardTypesReferencing(ctx: MutationContext, fieldName: string) {
    return ctx.project.resources
      .cardTypes()
      .filter((ct) =>
        ct.data?.customFields?.some((cf) => cf.name === fieldName),
      );
  }
}
