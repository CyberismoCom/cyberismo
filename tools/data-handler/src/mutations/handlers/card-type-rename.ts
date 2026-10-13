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
import type { RenameInput } from '../types.js';
import { resourceNameToString } from '../../utils/resource-utils.js';
import { ResourcesFrom } from '../../containers/project/resources-from.js';
import {
  rewriteCardContentRefs,
  rewriteContentFileRefs,
} from '../cascades/rewrite-refs.js';
import type { Card, ChangeOperation, LinkType } from '@cyberismo/model';
import { updateCardMetadata } from '../../cards/update.js';

export class CardTypeRenameHandler implements Handler<RenameInput> {
  async apply(ctx: MutationContext<RenameInput>): Promise<void> {
    const oldName = resourceNameToString(ctx.input.target);

    // Interactive rename of a module-owned card type is not allowed.
    if (ctx.input.target.prefix !== ctx.checkout.projectPrefix) {
      throw new Error(
        `Cannot rename resource ${oldName}: It is a module resource`,
      );
    }

    // All reference rewrites run BEFORE renaming the resource on disk: the
    // cascade scanners look for the old name and the resource file (with that
    // name) must still exist while they run.
    await this.applyCascade(ctx);

    // Rename the resource itself.
    const resource = ctx.checkout.resources.byType(oldName, 'cardTypes');
    if (!resource) {
      throw new Error(`CardType '${oldName}' not found`);
    }
    await resource.rename(ctx.input.newIdentifier);
  }

  async applyCascade(ctx: MutationContext<RenameInput>): Promise<void> {
    const oldName = resourceNameToString(ctx.input.target);
    const newName = `${ctx.input.target.prefix}/cardTypes/${ctx.input.newIdentifier}`;

    // 1. Rewrite metadata.cardType on every affected card.
    const cards = this.affectedCards(ctx, oldName);
    for (const card of cards) {
      const metadata = card.metadata!;
      metadata.cardType = newName;
      await updateCardMetadata(ctx.checkout, card, metadata);
    }

    // 2. Rewrite the cascading references: folder-resource content files
    //    (calculations, report/graph templates), card content and the
    //    source/destination card-type lists of every link type that
    //    referenced this card type.
    await rewriteContentFileRefs(ctx.checkout, oldName, newName);
    await rewriteCardContentRefs(ctx.checkout, oldName, newName);
    await this.updateLinkTypes(ctx, oldName, newName);
  }

  // Rewrite occurrences of the old card-type name in every local link type's
  // sourceCardTypes / destinationCardTypes.
  private async updateLinkTypes(
    ctx: MutationContext,
    oldName: string,
    newName: string,
  ): Promise<void> {
    const linkTypes = ctx.checkout.resources.linkTypes(ResourcesFrom.localOnly);
    const cardTypeFields: Array<
      keyof Pick<LinkType, 'destinationCardTypes' | 'sourceCardTypes'>
    > = ['destinationCardTypes', 'sourceCardTypes'];

    await Promise.all(
      linkTypes.map(async (object) => {
        const data = object.data;
        const updates: Promise<void>[] = [];
        for (const field of cardTypeFields) {
          if (data && data[field].includes(oldName)) {
            const op: ChangeOperation<string> = {
              name: 'change',
              target: oldName,
              to: newName,
            } as ChangeOperation<string>;
            updates.push(object.update({ key: field }, op));
          }
        }
        if (updates.length > 0) {
          await Promise.all(updates);
        }
      }),
    );
  }

  // Cards using this card type: local project cards plus local template cards.
  private affectedCards(ctx: MutationContext, oldName: string): Card[] {
    const project = [...ctx.checkout.cardTree.cards()];
    const templates = ctx.checkout.resources
      .templates(ResourcesFrom.localOnly)
      .flatMap((t) => t.cardTree.cards());
    return [...project, ...templates].filter(
      (c) => c.metadata?.cardType === oldName,
    );
  }
}
