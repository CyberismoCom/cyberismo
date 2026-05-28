// tools/data-handler/src/mutations/handlers/link-type-rename.ts

import type { Handler, MutationContext } from '../handler.js';
import type { CascadePreview } from '../types.js';
import { resourceName, resourceNameToString } from '../../utils/resource-utils.js';
import {
  rewriteCalculationRefs,
  rewriteCardContentRefs,
  rewriteHandlebarRefs,
} from '../cascades/rewrite-refs.js';
import { ResourcesFrom } from '../../containers/project/resources-from.js';
import type { Card } from '../../interfaces/project-interfaces.js';
import { join } from 'node:path';

export class LinkTypeRenameHandler implements Handler {
  readonly isBreaking = true;

  matches(ctx: MutationContext): boolean {
    return ctx.input.kind === 'rename' && ctx.input.target.type === 'linkTypes';
  }

  async preview(ctx: MutationContext): Promise<CascadePreview> {
    if (ctx.input.kind !== 'rename') {
      throw new Error('LinkTypeRenameHandler called with non-rename input');
    }
    const oldName = resourceNameToString(ctx.input.target);
    const affected = this.affectedCards(ctx, oldName);
    const affectedLinkCount = affected.reduce(
      (n, c) =>
        n +
        (c.metadata?.links?.filter((l) => l.linkType === oldName).length ?? 0),
      0,
    );
    return {
      affectedCardCount: affected.length,
      affectedLinkCount,
      affectedCalculationCount: 0,
      affectedHandlebarFileCount: 0,
      dataLossExpected: false,
      summary: `Renames ${affectedLinkCount} link references in ${affected.length} cards.`,
    };
  }

  async applyCascade(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'rename') {
      throw new Error('LinkTypeRenameHandler called with non-rename input');
    }
    const oldName = resourceNameToString(ctx.input.target);
    const newName = `${ctx.input.target.prefix}/linkTypes/${ctx.input.newIdentifier}`;

    // 1. Rewrite card metadata link references (local cards + local template cards).
    const cards = this.affectedCards(ctx, oldName);
    for (const card of cards) {
      const metadata = card.metadata!;
      metadata.links = metadata.links!.map((l) =>
        l.linkType === oldName ? { ...l, linkType: newName } : l,
      );
      await ctx.project.updateCardMetadata(card, metadata);
    }

    // 2. Rewrite cascading references (calculations, handlebars, card content).
    await rewriteCalculationRefs(ctx.project, oldName, newName);
    await rewriteHandlebarRefs(ctx.project, oldName, newName);
    await rewriteCardContentRefs(ctx.project, oldName, newName);
  }

  async applyResourceOp(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'rename') {
      throw new Error('LinkTypeRenameHandler called with non-rename input');
    }
    const oldName = resourceNameToString(ctx.input.target);
    const newName = `${ctx.input.target.prefix}/linkTypes/${ctx.input.newIdentifier}`;

    // Rename the resource itself. LinkTypeResource.rename handles
    // self-only prefix rewrites for sourceCardTypes / destinationCardTypes.
    const resource = ctx.project.resources.byType(oldName, 'linkTypes');
    if (!resource) {
      throw new Error(`Link type '${oldName}' not found`);
    }
    await resource.rename(resourceName(newName));
  }

  async affectedFilePaths(ctx: MutationContext): Promise<string[]> {
    if (ctx.input.kind !== 'rename') return [];
    const oldName = resourceNameToString(ctx.input.target);
    return this.affectedCards(ctx, oldName).map((c) =>
      join(c.path, 'index.json'),
    );
  }

  private affectedCards(ctx: MutationContext, oldName: string): Card[] {
    const localTemplateCards = ctx.project.resources
      .templates(ResourcesFrom.localOnly)
      .flatMap((t) => t.templateObject().cards());
    return [...ctx.project.cards(undefined), ...localTemplateCards].filter(
      (c) => c.metadata?.links?.some((l) => l.linkType === oldName),
    );
  }
}
