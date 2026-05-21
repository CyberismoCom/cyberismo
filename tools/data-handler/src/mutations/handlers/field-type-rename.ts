// tools/data-handler/src/mutations/handlers/field-type-rename.ts

import { join } from 'node:path';

import type { Handler, MutationContext } from '../handler.js';
import type { CascadePreview } from '../types.js';
import { resourceNameToString } from '../../utils/resource-utils.js';
import type { Card } from '../../interfaces/project-interfaces.js';

export class FieldTypeRenameHandler implements Handler {
  readonly isBreaking = true;

  matches(ctx: MutationContext): boolean {
    return (
      ctx.input.kind === 'rename' && ctx.input.target.type === 'fieldTypes'
    );
  }

  async preview(ctx: MutationContext): Promise<CascadePreview> {
    if (ctx.input.kind !== 'rename') {
      throw new Error('FieldTypeRenameHandler called with non-rename input');
    }
    const oldName = resourceNameToString(ctx.input.target);
    const cards = this.cardsWithField(ctx, oldName);
    const cardTypes = this.cardTypesReferencing(ctx, oldName);
    return {
      affectedCardCount: cards.length,
      affectedLinkCount: 0,
      affectedCalculationCount: 0,
      affectedHandlebarFileCount: 0,
      dataLossExpected: false,
      summary: `Renames field key on ${cards.length} cards and updates ${cardTypes.length} card types.`,
    };
  }

  async apply(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'rename') {
      throw new Error('FieldTypeRenameHandler called with non-rename input');
    }
    const oldName = resourceNameToString(ctx.input.target);
    const newName = `${ctx.input.target.prefix}/fieldTypes/${ctx.input.newIdentifier}`;

    // 1. Rewrite the metadata key on every card carrying the field.
    for (const card of this.cardsWithField(ctx, oldName)) {
      const metadata = card.metadata!;
      const value = metadata[oldName];
      delete metadata[oldName];
      metadata[newName] = value;
      await ctx.project.updateCardMetadata(card, metadata);
    }

    // 2. Rewrite customFields[].name entries on every card type.
    for (const cardType of this.cardTypesReferencing(ctx, oldName)) {
      await cardType.update(
        { key: 'customFields' },
        { name: 'change', target: { name: oldName }, to: { name: newName } } as never,
      );
    }

    // 3. Perform the resource-level rename. ResourceObject.rename() also
    //    triggers updateCalculations / updateHandleBars / updateCardContentReferences
    //    via onNameChange. We intentionally leave the parent class's rename
    //    machinery in place during this plan — Task 9 removes the FieldType
    //    override (`onNameChange`) so the parent does the right thing.
    const resource = ctx.project.resources.byType(oldName, 'fieldTypes');
    if (!resource) {
      throw new Error(`Field type '${oldName}' not found`);
    }
    await resource.update({ key: 'name' }, {
      name: 'change',
      target: oldName,
      to: newName,
    });
  }

  async affectedFilePaths(ctx: MutationContext): Promise<string[]> {
    if (ctx.input.kind !== 'rename') return [];
    const oldName = resourceNameToString(ctx.input.target);
    const cardPaths = this.cardsWithField(ctx, oldName).map((c) =>
      join(c.path, 'index.json'),
    );
    const cardTypePaths = this.cardTypesReferencing(ctx, oldName).map(
      (ct) => ct.fileName,
    );
    return [...cardPaths, ...cardTypePaths];
  }

  private cardsWithField(ctx: MutationContext, oldName: string): Card[] {
    const all = [
      ...ctx.project.cards(undefined),
      ...ctx.project.allTemplateCards(),
    ];
    return all.filter((c) => c.metadata && oldName in c.metadata);
  }

  private cardTypesReferencing(ctx: MutationContext, oldName: string) {
    return ctx.project.resources
      .cardTypes()
      .filter((ct) =>
        ct.data?.customFields?.some((cf) => cf.name === oldName),
      );
  }
}
