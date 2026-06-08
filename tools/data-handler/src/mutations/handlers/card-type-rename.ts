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
import {
  resourceName,
  resourceNameToString,
} from '../../utils/resource-utils.js';
import { ResourcesFrom } from '../../containers/project/resources-from.js';
import {
  rewriteCalculationRefs,
  rewriteCardContentRefs,
  rewriteHandlebarRefs,
} from '../cascades/rewrite-refs.js';
import type { Card } from '../../interfaces/project-interfaces.js';
import type { ChangeOperation } from '../../resources/resource-object.js';
import type { LinkType } from '../../interfaces/resource-interfaces.js';

export class CardTypeRenameHandler implements Handler {
  readonly isBreaking = true;

  matches(ctx: MutationContext): boolean {
    return ctx.input.kind === 'rename' && ctx.input.target.type === 'cardTypes';
  }

  async apply(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'rename') {
      throw new Error('CardTypeRenameHandler called with non-rename input');
    }
    const oldName = resourceNameToString(ctx.input.target);
    const newName = `${ctx.input.target.prefix}/cardTypes/${ctx.input.newIdentifier}`;

    // All reference rewrites run BEFORE renaming the resource on disk: the
    // cascade scanners look for the old name and the resource file (with that
    // name) must still exist while they run.

    // 1. Rewrite metadata.cardType on every affected card.
    const cards = this.affectedCards(ctx, oldName);
    for (const card of cards) {
      const metadata = card.metadata!;
      metadata.cardType = newName;
      await ctx.project.updateCardMetadata(card, metadata);
    }

    // 2. Rewrite the cascading references that used to live in
    //    CardTypeResource.onNameChange: calculations, report handlebars,
    //    card content and the source/destination card-type lists of every
    //    link type that referenced this card type.
    await rewriteCalculationRefs(ctx.project, oldName, newName);
    await rewriteHandlebarRefs(ctx.project, oldName, newName);
    await rewriteCardContentRefs(ctx.project, oldName, newName);
    await this.updateLinkTypes(ctx, oldName, newName);

    // 3. Rename the resource itself. CardTypeResource.rename keeps the
    //    self-only prefix rewrites for its own customFields /
    //    alwaysVisibleFields / optionallyVisibleFields / workflow.
    const resource = ctx.project.resources.byType(oldName, 'cardTypes');
    if (!resource) {
      throw new Error(`CardType '${oldName}' not found`);
    }
    await resource.rename(resourceName(newName));
  }

  // Rewrite occurrences of the old card-type name in every local link type's
  // sourceCardTypes / destinationCardTypes. Mirrors the resource's former
  // updateLinkTypes cascade.
  private async updateLinkTypes(
    ctx: MutationContext,
    oldName: string,
    newName: string,
  ): Promise<void> {
    const linkTypes = ctx.project.resources.linkTypes(ResourcesFrom.localOnly);
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

  // Cards using this card type: local project cards plus local template cards
  // (matches CardTypeResource's collectCards scoping).
  private affectedCards(ctx: MutationContext, oldName: string): Card[] {
    const project = [...ctx.project.cards(undefined)];
    const templates = ctx.project.resources
      .templates(ResourcesFrom.localOnly)
      .flatMap((t) => t.templateObject().cards());
    return [...project, ...templates].filter(
      (c) => c.metadata?.cardType === oldName,
    );
  }
}
