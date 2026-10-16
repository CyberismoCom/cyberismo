// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { Handler, MutationContext } from '../handler.js';
import type { DeleteInput } from '../types.js';
import { resourceNameToString } from '../../../../shared/utils/resource-utils.js';
import type { Card } from '@cyberismo/model';
import { updateCardMetadata } from '../../../cards/update.js';
import { allTemplateCards } from '../../../cards/read.js';

export class LinkTypeDeleteHandler implements Handler<DeleteInput> {
  async apply(ctx: MutationContext<DeleteInput>): Promise<void> {
    const name = resourceNameToString(ctx.input.target);

    // Interactive deletion of a module-owned link type is not allowed.
    if (ctx.input.target.prefix !== ctx.checkout.projectPrefix) {
      throw new Error(
        `Cannot delete resource ${name}: It is a module resource`,
      );
    }

    await this.applyCascade(ctx);

    // Delete the link type resource itself.
    const resource = ctx.checkout.resources.byType(name, 'linkTypes');
    if (!resource) {
      throw new Error(`Link type '${name}' not found`);
    }
    await resource.delete();
  }

  async applyCascade(ctx: MutationContext<DeleteInput>): Promise<void> {
    const name = resourceNameToString(ctx.input.target);

    // Strip matching links from every card's metadata.
    for (const card of this.affectedCards(ctx, name)) {
      const metadata = card.metadata!;
      metadata.links = (metadata.links ?? []).filter(
        (l) => l.linkType !== name,
      );
      await updateCardMetadata(ctx.checkout, card, metadata);
    }
  }

  // Project cards plus local template cards; module template cards are
  // read-only from the consumer side and must never be rewritten here.
  private affectedCards(ctx: MutationContext, name: string): Card[] {
    return [
      ...ctx.checkout.cardTree.cards(),
      ...allTemplateCards(ctx.checkout).filter(
        (c) => ctx.checkout.treeOf(c.key).writable,
      ),
    ].filter((c) => c.metadata?.links?.some((l) => l.linkType === name));
  }
}
