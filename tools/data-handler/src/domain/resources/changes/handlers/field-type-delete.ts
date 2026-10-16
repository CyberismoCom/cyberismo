// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { Handler, MutationContext } from '../handler.js';
import type { DeleteInput } from '../types.js';
import { resourceNameToString } from '../../../../shared/utils/resource-utils.js';
import { ResourcesFrom } from '../../../../state/resources/resources-from.js';
import type { Operation } from '@cyberismo/model';

/**
 * The handler owns the cascade: the field is stripped from every local card
 * type that declares it (CardTypeResource.update also drops it from the
 * visible-field arrays). resource.delete() is a pure primitive: it does not
 * check usage.
 *
 * Cards keep their stored values. Once no card type declares the field the
 * values are dormant: excluded from facts, accepted by validation, and reported
 * by 'cyberismo clean' as 'undeclared'. This matches removing the field from a
 * card type directly, which also leaves the value in place.
 */
export class FieldTypeDeleteHandler implements Handler<DeleteInput> {
  async apply(ctx: MutationContext<DeleteInput>): Promise<void> {
    const name = resourceNameToString(ctx.input.target);

    // Interactive deletion of a module-owned field type is not allowed.
    if (ctx.input.target.prefix !== ctx.checkout.projectPrefix) {
      throw new Error(
        `Cannot delete resource ${name}: It is a module resource`,
      );
    }

    await this.applyCascade(ctx);

    const resource = ctx.checkout.resources.byType(name, 'fieldTypes');
    if (!resource) throw new Error(`Field type '${name}' not found`);
    await resource.delete();
  }

  // Cascade: strip the field from every local card type declaring it.
  async applyCascade(ctx: MutationContext<DeleteInput>): Promise<void> {
    const name = resourceNameToString(ctx.input.target);

    const declaringCardTypes = ctx.checkout.resources
      .cardTypes(ResourcesFrom.localOnly)
      .filter((ct) => ct.data?.customFields?.some((f) => f.name === name));

    for (const cardType of declaringCardTypes) {
      await cardType.update({ key: 'customFields' }, {
        name: 'remove',
        target: { name },
      } as Operation<unknown>);
    }
  }
}
