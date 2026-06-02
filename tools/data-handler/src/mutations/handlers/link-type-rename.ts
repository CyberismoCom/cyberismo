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
import type { CascadePreview } from '../types.js';
import {
  resourceName,
  resourceNameToString,
} from '../../utils/resource-utils.js';
import {
  rewriteCalculationRefs,
  rewriteCardContentRefs,
  rewriteHandlebarRefs,
} from '../cascades/rewrite-refs.js';
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

  async apply(ctx: MutationContext): Promise<void> {
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

    // 2. Rewrite cascading references BEFORE renaming the resource on disk.
    //    Order matters: cascade scanners look for the old name, and the
    //    resource file (with that name) must still exist when they run.
    // TODO: compute accurate counts now that cascade is explicit
    await rewriteCalculationRefs(ctx.project, oldName, newName);
    await rewriteHandlebarRefs(ctx.project, oldName, newName);
    await rewriteCardContentRefs(ctx.project, oldName, newName);

    // 3. Rename the resource itself. LinkTypeResource.rename handles
    //    self-only prefix rewrites for sourceCardTypes /
    //    destinationCardTypes.
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
    const all = [
      ...ctx.project.cards(undefined),
      ...ctx.project.allTemplateCards(),
    ];
    return all.filter((c) =>
      c.metadata?.links?.some((l) => l.linkType === oldName),
    );
  }
}
