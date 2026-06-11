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
import {
  rewriteCardContentRefs,
  rewriteContentFileRefs,
} from '../cascades/rewrite-refs.js';
import { isModuleCard } from '../../utils/card-utils.js';
import type { Card } from '../../interfaces/project-interfaces.js';

export class LinkTypeRenameHandler implements Handler {
  readonly isBreaking = true;

  matches(ctx: MutationContext): boolean {
    return ctx.input.kind === 'rename' && ctx.input.target.type === 'linkTypes';
  }

  async apply(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'rename') {
      throw new Error('LinkTypeRenameHandler called with non-rename input');
    }
    const oldName = resourceNameToString(ctx.input.target);

    // The cascade runs BEFORE renaming the resource on disk. Order matters:
    // cascade scanners look for the old name, and the resource file (with
    // that name) must still exist when they run.
    await this.applyCascade(ctx);

    // Rename the resource itself.
    const resource = ctx.project.resources.byType(oldName, 'linkTypes');
    if (!resource) {
      throw new Error(`Link type '${oldName}' not found`);
    }
    await resource.rename(ctx.input.newIdentifier);
  }

  async applyCascade(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'rename') {
      throw new Error('LinkTypeRenameHandler called with non-rename input');
    }
    const oldName = resourceNameToString(ctx.input.target);
    const newName = `${ctx.input.target.prefix}/linkTypes/${ctx.input.newIdentifier}`;

    // 1. Rewrite card metadata references.
    const cards = this.affectedCards(ctx, oldName);
    for (const card of cards) {
      const metadata = card.metadata!;
      metadata.links = metadata.links!.map((l) =>
        l.linkType === oldName ? { ...l, linkType: newName } : l,
      );
      await ctx.project.updateCardMetadata(card, metadata);
    }

    // 2. Rewrite cascading references in content files and card content.
    await rewriteContentFileRefs(ctx.project, oldName, newName);
    await rewriteCardContentRefs(ctx.project, oldName, newName);
  }

  // Project cards plus LOCAL template cards: module cards are immutable from
  // the consumer side and cannot reference a local link type anyway.
  private affectedCards(ctx: MutationContext, oldName: string): Card[] {
    const all = [
      ...ctx.project.cards(undefined),
      ...ctx.project.allTemplateCards().filter((card) => !isModuleCard(card)),
    ];
    return all.filter((c) =>
      c.metadata?.links?.some((l) => l.linkType === oldName),
    );
  }
}
