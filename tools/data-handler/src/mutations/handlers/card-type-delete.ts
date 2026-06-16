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
import type { DeleteInput } from '../types.js';
import { resourceNameToString } from '../../utils/resource-utils.js';
import {
  deleteCardType,
  deleteCardTypeCascade,
} from '../cascades/delete-card-type.js';

export class CardTypeDeleteHandler implements Handler<DeleteInput> {
  async apply(ctx: MutationContext<DeleteInput>): Promise<void> {
    const cardTypeName = resourceNameToString(ctx.input.target);

    // Interactive deletion of a module-owned card type is not allowed.
    if (ctx.input.target.prefix !== ctx.project.projectPrefix) {
      throw new Error(
        `Cannot delete resource ${cardTypeName}: It is a module resource`,
      );
    }

    // Cascade (strip link types, delete cards) then remove the resource.
    await deleteCardType(ctx, cardTypeName);
  }

  async applyCascade(ctx: MutationContext<DeleteInput>): Promise<void> {
    await deleteCardTypeCascade(ctx, resourceNameToString(ctx.input.target));
  }
}
