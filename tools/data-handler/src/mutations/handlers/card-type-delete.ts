// tools/data-handler/src/mutations/handlers/card-type-delete.ts

import { join } from 'node:path';

import type { Handler, MutationContext } from '../handler.js';
import type { CascadePreview } from '../types.js';
import { resourceNameToString } from '../../utils/resource-utils.js';
import { ResourcesFrom } from '../../containers/project/resources-from.js';
import type { Card } from '../../interfaces/project-interfaces.js';
import { Remove } from '../../commands/remove.js';
import { Fetch } from '../../commands/fetch.js';

export class CardTypeDeleteHandler implements Handler {
  readonly isBreaking = true;

  matches(ctx: MutationContext): boolean {
    return (
      ctx.input.kind === 'delete' && ctx.input.target.type === 'cardTypes'
    );
  }

  async preview(ctx: MutationContext): Promise<CascadePreview> {
    if (ctx.input.kind !== 'delete') {
      throw new Error('CardTypeDeleteHandler called with non-delete input');
    }
    const cardTypeName = resourceNameToString(ctx.input.target);
    const cards = this.affectedCards(ctx, cardTypeName);
    const linkRefs = this.linkTypeReferenceCount(ctx, cardTypeName);
    return {
      affectedCardCount: cards.length,
      affectedLinkCount: linkRefs,
      affectedCalculationCount: 0,
      affectedHandlebarFileCount: 0,
      dataLossExpected: true,
      summary:
        `Deletes ${cards.length} cards and removes ${linkRefs} link-type references; ` +
        `then deletes the card type resource.`,
    };
  }

  async apply(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'delete') {
      throw new Error('CardTypeDeleteHandler called with non-delete input');
    }
    const cardTypeName = resourceNameToString(ctx.input.target);

    // 1. Strip the card type from every link type.
    const linkTypes = ctx.project.resources.linkTypes(ResourcesFrom.localOnly);
    for (const lt of linkTypes) {
      const data = lt.data;
      if (!data) continue;
      for (const field of ['sourceCardTypes', 'destinationCardTypes'] as const) {
        if (data[field].includes(cardTypeName)) {
          await lt.update(
            { key: field },
            { name: 'remove', target: cardTypeName } as never,
          );
        }
      }
    }

    // 2. Delete every card of this type. Uses Remove.remove which already
    //    handles child cascades and link cleanup.
    const remove = new Remove(ctx.project, new Fetch(ctx.project));
    const cards = this.affectedCards(ctx, cardTypeName);
    // Ensure calculation engine is ready so ActionGuard can check permissions.
    await ctx.project.calculationEngine.generate();
    // Sort cards so that cards deeper in the tree are removed first to
    // avoid double-removal attempts.
    const sorted = [...cards].sort(
      (a, b) => b.path.split('/').length - a.path.split('/').length,
    );
    for (const card of sorted) {
      // Some descendants may already be gone; ignore missing-card errors.
      try {
        await remove.remove('card', card.key);
      } catch {
        // already removed via parent cascade
      }
    }

    // 3. Delete the card type resource itself. By now usage() returns [].
    const resource = ctx.project.resources.byType(cardTypeName, 'cardTypes');
    if (!resource) throw new Error(`CardType '${cardTypeName}' not found`);
    await resource.delete();
  }

  async affectedFilePaths(ctx: MutationContext): Promise<string[]> {
    if (ctx.input.kind !== 'delete') return [];
    const cardTypeName = resourceNameToString(ctx.input.target);
    return this.affectedCards(ctx, cardTypeName).map((c) =>
      join(c.path, 'index.json'),
    );
  }

  private affectedCards(ctx: MutationContext, cardTypeName: string): Card[] {
    return [
      ...ctx.project.cards(undefined),
      ...ctx.project.allTemplateCards(),
    ].filter(
      (c) => c.metadata?.cardType === cardTypeName,
    );
  }

  private linkTypeReferenceCount(
    ctx: MutationContext,
    cardTypeName: string,
  ): number {
    let count = 0;
    for (const lt of ctx.project.resources.linkTypes()) {
      const data = lt.data;
      if (!data) continue;
      if (data.sourceCardTypes.includes(cardTypeName)) count += 1;
      if (data.destinationCardTypes.includes(cardTypeName)) count += 1;
    }
    return count;
  }
}
