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
import type { Card } from '../../interfaces/project-interfaces.js';

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

    // 1. Rewrite metadata.cardType on every affected card BEFORE renaming the
    //    resource on disk. CardTypeResource.rename() (onNameChange) cascades the
    //    calculation / handlebar / card-content / link-type references and the
    //    self-prefix rewrites, but it does NOT touch each card's
    //    metadata.cardType — so that rewrite lives here.
    const cards = this.affectedCards(ctx, oldName);
    for (const card of cards) {
      const metadata = card.metadata!;
      metadata.cardType = newName;
      await ctx.project.updateCardMetadata(card, metadata);
    }

    // 2. Rename the resource itself. CardTypeResource.rename handles the
    //    cascading reference rewrites (calculations, handlebars, card content,
    //    link-type source/destination card types).
    const resource = ctx.project.resources.byType(oldName, 'cardTypes');
    if (!resource) {
      throw new Error(`CardType '${oldName}' not found`);
    }
    await resource.rename(resourceName(newName));
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
