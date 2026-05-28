// tools/data-handler/src/mutations/handlers/field-type-delete.ts

import { join } from 'node:path';

import type { Handler, MutationContext } from '../handler.js';
import type { CascadePreview } from '../types.js';
import { resourceNameToString } from '../../utils/resource-utils.js';
import { ResourcesFrom } from '../../containers/project/resources-from.js';
import type { Card } from '../../interfaces/project-interfaces.js';

export class FieldTypeDeleteHandler implements Handler {
  readonly isBreaking = true;

  matches(ctx: MutationContext): boolean {
    return (
      ctx.input.kind === 'delete' && ctx.input.target.type === 'fieldTypes'
    );
  }

  async validate(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'delete') return;
    const fieldName = resourceNameToString(ctx.input.target);
    // Interactive deletion of a module-owned field type is not allowed.
    // Replay (which skips validate) is allowed and will only run the cascade.
    if (ctx.input.target.prefix !== ctx.project.projectPrefix) {
      throw new Error(
        `Cannot delete resource ${fieldName}: It is a module resource`,
      );
    }
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

  async applyCascade(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'delete') {
      throw new Error('FieldTypeDeleteHandler: non-delete input');
    }
    const fieldName = resourceNameToString(ctx.input.target);

    // 1. Remove the field from every local card type that references it.
    //    Module-owned card types are immutable from the consumer side.
    //    CardTypeResource.validateFieldType allows remove of absent fields
    //    (safe for foreign-replay where the module field is already deleted).
    for (const cardType of this.cardTypesReferencing(ctx, fieldName)) {
      await cardType.update(
        { key: 'customFields' },
        { name: 'remove', target: { name: fieldName } } as never,
      );
    }

    // 2. Strip the field from every local card and local template card.
    for (const card of this.cardsWithField(ctx, fieldName)) {
      const metadata = card.metadata!;
      delete metadata[fieldName];
      await ctx.project.updateCardMetadata(card, metadata);
    }
  }

  async applyResourceOp(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'delete') {
      throw new Error('FieldTypeDeleteHandler: non-delete input');
    }
    const fieldName = resourceNameToString(ctx.input.target);

    // Delete the resource itself.
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
    const rootCards = ctx.project.cards(undefined);
    const templateCards = ctx.project.resources
      .templates(ResourcesFrom.localOnly)
      .flatMap((t) => t.templateObject().cards());
    return [...rootCards, ...templateCards].filter(
      (c) => c.metadata && fieldName in c.metadata,
    );
  }

  private cardTypesReferencing(ctx: MutationContext, fieldName: string) {
    // Local card types only: module-owned card types are immutable from the
    // consumer side and are the owning module's responsibility to clean up.
    return ctx.project.resources
      .cardTypes(ResourcesFrom.localOnly)
      .filter((ct) =>
        ct.data?.customFields?.some((cf) => cf.name === fieldName),
      );
  }
}
