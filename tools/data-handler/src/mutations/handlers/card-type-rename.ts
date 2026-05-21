import { join } from 'node:path';

import type { Handler, MutationContext } from '../handler.js';
import type { CascadePreview } from '../types.js';
import { resourceName, resourceNameToString } from '../../utils/resource-utils.js';
import { ResourcesFrom } from '../../containers/project/resources-from.js';
import type { Card } from '../../interfaces/project-interfaces.js';
import type { ChangeOperation } from '../../resources/resource-object.js';

export class CardTypeRenameHandler implements Handler {
  readonly isBreaking = true;

  matches(ctx: MutationContext): boolean {
    return (
      ctx.input.kind === 'rename' && ctx.input.target.type === 'cardTypes'
    );
  }

  async preview(ctx: MutationContext): Promise<CascadePreview> {
    if (ctx.input.kind !== 'rename') {
      throw new Error('CardTypeRenameHandler called with non-rename input');
    }
    const oldName = resourceNameToString(ctx.input.target);
    const cards = this.affectedCards(ctx, oldName);
    const linkTypeRefs = this.linkTypeReferenceCount(ctx, oldName);
    return {
      affectedCardCount: cards.length,
      affectedLinkCount: linkTypeRefs,
      affectedCalculationCount: 0, // updated via ResourceObject.updateCalculations
      affectedHandlebarFileCount: 0, // updated via ResourceObject.updateHandleBars
      dataLossExpected: false,
      summary: `Renames cardType in ${cards.length} cards and ${linkTypeRefs} link-type references.`,
    };
  }

  async apply(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'rename') {
      throw new Error('CardTypeRenameHandler called with non-rename input');
    }
    const oldName = resourceNameToString(ctx.input.target);
    const newName = `${ctx.input.target.prefix}/cardTypes/${ctx.input.newIdentifier}`;

    // 1. Rewrite card metadata.cardType for every affected card (project + templates).
    const cards = this.affectedCards(ctx, oldName);
    for (const card of cards) {
      const metadata = card.metadata!;
      metadata.cardType = newName;
      await ctx.project.updateCardMetadata(card, metadata);
    }

    // 2. Rename the resource itself. ResourceObject.rename() invokes onNameChange,
    //    which (per card-type-resource.ts) handles handlebar/calculation/content
    //    rewrites and link-type updates. After this plan trims the resource class,
    //    only handlebar/calculation/content rewrites remain in onNameChange; the
    //    link-type rewrite below replaces the removed updateLinkTypes call.
    const resource = ctx.project.resources.byType(oldName, 'cardTypes');
    if (!resource) {
      throw new Error(`CardType '${oldName}' not found`);
    }
    await resource.rename(resourceName(newName));

    // 3. Rewrite link-type sourceCardTypes/destinationCardTypes references.
    const linkTypes = ctx.project.resources.linkTypes(ResourcesFrom.localOnly);
    for (const lt of linkTypes) {
      const data = lt.data;
      if (!data) continue;
      for (const field of ['sourceCardTypes', 'destinationCardTypes'] as const) {
        if (data[field].includes(oldName)) {
          const op: ChangeOperation<string> = {
            name: 'change',
            target: oldName,
            to: newName,
          } as ChangeOperation<string>;
          await lt.update({ key: field }, op);
        }
      }
    }
  }

  async affectedFilePaths(ctx: MutationContext): Promise<string[]> {
    if (ctx.input.kind !== 'rename') return [];
    const oldName = resourceNameToString(ctx.input.target);
    return this.affectedCards(ctx, oldName).map((c) => join(c.path, 'index.json'));
  }

  private affectedCards(ctx: MutationContext, oldName: string): Card[] {
    const project = [...ctx.project.cards(undefined)];
    const templates = ctx.project.resources
      .templates(ResourcesFrom.localOnly)
      .flatMap((t) => t.templateObject().cards());
    return [...project, ...templates].filter(
      (c) => c.metadata?.cardType === oldName,
    );
  }

  private linkTypeReferenceCount(ctx: MutationContext, oldName: string): number {
    let count = 0;
    for (const lt of ctx.project.resources.linkTypes()) {
      const data = lt.data;
      if (!data) continue;
      if (data.sourceCardTypes.includes(oldName)) count += 1;
      if (data.destinationCardTypes.includes(oldName)) count += 1;
    }
    return count;
  }
}
