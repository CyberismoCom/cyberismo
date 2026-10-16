// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { Handler, MutationContext } from '../handler.js';
import type { DeleteInput } from '../types.js';
import { resourceNameToString } from '../../../../shared/utils/resource-utils.js';
import {
  deleteCardType,
  deleteCardTypeCascade,
} from '../cascades/delete-card-type.js';

export class CardTypeDeleteHandler implements Handler<DeleteInput> {
  async apply(ctx: MutationContext<DeleteInput>): Promise<void> {
    const cardTypeName = resourceNameToString(ctx.input.target);

    // Interactive deletion of a module-owned card type is not allowed.
    if (ctx.input.target.prefix !== ctx.checkout.projectPrefix) {
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
