// tools/data-handler/src/mutations/handlers/link-type-delete.ts

import { join } from 'node:path';

import type { Handler, MutationContext } from '../handler.js';
import type { CascadePreview } from '../types.js';
import { resourceNameToString } from '../../utils/resource-utils.js';
import { ResourcesFrom } from '../../containers/project/resources-from.js';
import type { Card } from '../../interfaces/project-interfaces.js';

export class LinkTypeDeleteHandler implements Handler {
  readonly isBreaking = true;

  matches(ctx: MutationContext): boolean {
    return (
      ctx.input.kind === 'delete' && ctx.input.target.type === 'linkTypes'
    );
  }

  async validate(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'delete') return;
    const name = resourceNameToString(ctx.input.target);
    // Interactive deletion of a module-owned link type is not allowed.
    // Replay (which skips validate) is allowed and will only run the cascade.
    if (ctx.input.target.prefix !== ctx.project.projectPrefix) {
      throw new Error(
        `Cannot delete resource ${name}: It is a module resource`,
      );
    }
  }

  async preview(ctx: MutationContext): Promise<CascadePreview> {
    if (ctx.input.kind !== 'delete') {
      throw new Error('LinkTypeDeleteHandler: non-delete input');
    }
    const name = resourceNameToString(ctx.input.target);
    const affected = this.affectedCards(ctx, name);
    const affectedLinkCount = affected.reduce(
      (n, c) =>
        n +
        (c.metadata?.links?.filter((l) => l.linkType === name).length ?? 0),
      0,
    );
    return {
      affectedCardCount: affected.length,
      affectedLinkCount,
      affectedCalculationCount: 0,
      affectedHandlebarFileCount: 0,
      dataLossExpected: affectedLinkCount > 0,
      summary: `Removes ${affectedLinkCount} links of type '${name}' across ${affected.length} cards, then deletes the link type.`,
    };
  }

  async applyCascade(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'delete') {
      throw new Error('LinkTypeDeleteHandler: non-delete input');
    }
    const name = resourceNameToString(ctx.input.target);

    // Strip matching links from every local card's metadata (local cards + local template cards).
    for (const card of this.affectedCards(ctx, name)) {
      const metadata = card.metadata!;
      metadata.links = (metadata.links ?? []).filter(
        (l) => l.linkType !== name,
      );
      await ctx.project.updateCardMetadata(card, metadata);
    }
  }

  async applyResourceOp(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'delete') {
      throw new Error('LinkTypeDeleteHandler: non-delete input');
    }
    const name = resourceNameToString(ctx.input.target);

    // Delete the link type resource itself.
    const resource = ctx.project.resources.byType(name, 'linkTypes');
    if (!resource) {
      throw new Error(`Link type '${name}' not found`);
    }
    await resource.delete();
  }

  async affectedFilePaths(ctx: MutationContext): Promise<string[]> {
    if (ctx.input.kind !== 'delete') return [];
    const name = resourceNameToString(ctx.input.target);
    return this.affectedCards(ctx, name).map((c) =>
      join(c.path, 'index.json'),
    );
  }

  private affectedCards(ctx: MutationContext, name: string): Card[] {
    const localTemplateCards = ctx.project.resources
      .templates(ResourcesFrom.localOnly)
      .flatMap((t) => t.templateObject().cards());
    return [
      ...ctx.project.cards(undefined),
      ...localTemplateCards,
    ].filter((c) =>
      c.metadata?.links?.some((l) => l.linkType === name),
    );
  }
}
