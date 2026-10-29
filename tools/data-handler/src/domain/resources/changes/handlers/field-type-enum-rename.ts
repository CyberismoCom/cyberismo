// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { Handler, MutationContext } from '../handler.js';
import type { EditInput } from '../types.js';
import { resourceNameToString } from '../../../../shared/utils/resource-utils.js';
import { ResourcesFrom } from '../../../../state/resources/resources-from.js';
import type { Card, ChangeOperation, EnumDefinition } from '@cyberismo/model';
import { updateCardMetadataKey } from '../../../cards/update.js';

/**
 * FieldTypeResource.update renames the value in the enum definition; the
 * cross-resource part — rewriting the value on every affected card — lives
 * here.
 */
export class FieldTypeEnumRenameHandler implements Handler<EditInput> {
  async apply(ctx: MutationContext<EditInput>): Promise<void> {
    const name = resourceNameToString(ctx.input.target);
    const resource = ctx.checkout.resources.byType(name, 'fieldTypes');
    if (!resource) throw new Error(`Field type '${name}' not found`);

    // Rename the value in the enum definition and persist it.
    await resource.update(ctx.input.updateKey, ctx.input.operation);

    await this.applyCascade(ctx);
  }

  // Cascade: rewrite every card holding the old enum value to the new value.
  async applyCascade(ctx: MutationContext<EditInput>): Promise<void> {
    const name = resourceNameToString(ctx.input.target);
    const op = ctx.input.operation as ChangeOperation<EnumDefinition>;
    const oldValue = (op.target as EnumDefinition).enumValue;
    const newValue = (op.to as EnumDefinition).enumValue;

    for (const card of this.affectedCards(ctx, name)) {
      if (card.metadata?.[name] === oldValue) {
        await updateCardMetadataKey(ctx.checkout, card.key, name, newValue);
      }
    }
  }

  // Every local card that holds this field: local project cards plus local
  // template cards. The field key carrying the old value is itself the evidence
  // a card needs migrating, so no card-type scoping is required.
  private affectedCards(ctx: MutationContext, fieldName: string): Card[] {
    const project = [...ctx.checkout.cardTree.cards()];
    const templates = ctx.checkout.resources
      .templates(ResourcesFrom.localOnly)
      .flatMap((t) => t.cardTree.cards());
    return [...project, ...templates].filter(
      (c) => c.metadata && fieldName in c.metadata,
    );
  }
}
