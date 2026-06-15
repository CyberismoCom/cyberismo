/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026

  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import type { Handler, MutationContext } from '../handler.js';
import { resourceNameToString } from '../../utils/resource-utils.js';
import { isModuleCard } from '../../utils/card-utils.js';
import type { Card } from '../../interfaces/project-interfaces.js';

export class LinkTypeDeleteHandler implements Handler {
  async apply(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'delete') {
      throw new Error('LinkTypeDeleteHandler: non-delete input');
    }
    const name = resourceNameToString(ctx.input.target);

    // Interactive deletion of a module-owned link type is not allowed.
    if (ctx.input.target.prefix !== ctx.project.projectPrefix) {
      throw new Error(
        `Cannot delete resource ${name}: It is a module resource`,
      );
    }

    // Strip the link usage before deleting the resource so that delete()
    // (which refuses while usage() is non-empty) can succeed.
    await this.applyCascade(ctx);

    // Delete the link type resource itself.
    const resource = ctx.project.resources.byType(name, 'linkTypes');
    if (!resource) {
      throw new Error(`Link type '${name}' not found`);
    }
    await resource.delete();
  }

  async applyCascade(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'delete') {
      throw new Error('LinkTypeDeleteHandler: non-delete input');
    }
    const name = resourceNameToString(ctx.input.target);

    // Strip matching links from every card's metadata.
    for (const card of this.affectedCards(ctx, name)) {
      const metadata = card.metadata!;
      metadata.links = (metadata.links ?? []).filter(
        (l) => l.linkType !== name,
      );
      await ctx.project.updateCardMetadata(card, metadata);
    }
  }

  // Project cards plus local template cards; module template cards are
  // read-only from the consumer side and must never be rewritten here.
  private affectedCards(ctx: MutationContext, name: string): Card[] {
    return [
      ...ctx.project.cards(undefined),
      ...ctx.project.allTemplateCards().filter((c) => !isModuleCard(c)),
    ].filter((c) => c.metadata?.links?.some((l) => l.linkType === name));
  }
}
