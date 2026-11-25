// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { Operation } from '@cyberismo/model';
import type { Checkout } from '../../state/checkout/checkout.js';
import {
  DHValidationError,
  ResourceNotFoundError,
} from '../../shared/exceptions/index.js';
import { resourceName } from '../../shared/utils/resource-utils.js';
import { checkPosition } from '../../shared/utils/validate.js';
import { ResourceMutations } from './changes/resource-mutations.js';

/** Visibility group of a card type's custom field. */
export type FieldVisibility = 'always' | 'optional' | 'hidden';

// The card type key that lists the fields of a visible group.
const visibilityKeys: Record<
  Exclude<FieldVisibility, 'hidden'>,
  'alwaysVisibleFields' | 'optionallyVisibleFields'
> = {
  always: 'alwaysVisibleFields',
  optional: 'optionallyVisibleFields',
};

/**
 * Puts a custom field of a card type in a visibility group, optionally at a
 * position among the group's fields. A field already in the group is only
 * moved to the position. Each step is a resource change of its own, logged
 * as such.
 * @param cardTypeName The card type: its identifier in this project, or
 *   its full name.
 * @param fieldName Name of the custom field.
 * @param group 'always' or 'optional' visible, or 'hidden' (in neither).
 * @param index Position in the group; 0 is first. Last when the field comes
 *   from another group without one. Ignored for 'hidden'.
 * @throws ResourceNotFoundError if the card type, or the field in it, does
 *   not exist.
 * @throws DHValidationError if the name is not a card type's, or the
 *   position is not a whole number or is outside the group.
 */
export async function setFieldVisibility(
  checkout: Checkout,
  cardTypeName: string,
  fieldName: string,
  group: FieldVisibility,
  index?: number,
): Promise<void> {
  // An identifier-only name is completed to the project's card type, for the
  // read and for the changes alike.
  const fullName =
    cardTypeName && cardTypeName.split('/').length === 1
      ? `${checkout.projectPrefix}/cardTypes/${cardTypeName}`
      : cardTypeName;
  const target = resourceName(fullName);
  if (target.type !== 'cardTypes') {
    throw new DHValidationError(
      `Expected type 'cardTypes', but got '${target.type}'`,
    );
  }
  const cardType = checkout.resources.byType(fullName, 'cardTypes').show();
  if (!cardType.customFields.some((field) => field.name === fieldName)) {
    throw new ResourceNotFoundError(
      fieldName,
      `Field '${fieldName}' does not exist in card type '${cardTypeName}'. `,
    );
  }
  const current: FieldVisibility = cardType.alwaysVisibleFields.includes(
    fieldName,
  )
    ? 'always'
    : cardType.optionallyVisibleFields.includes(fieldName)
      ? 'optional'
      : 'hidden';

  // Checked before the first change: without autocommit a failed write is
  // not rolled back.
  if (group !== 'hidden' && index !== undefined) {
    const others = cardType[visibilityKeys[group]].filter(
      (name) => name !== fieldName,
    );
    checkPosition(index, others.length);
  }

  const mutations = new ResourceMutations(checkout);
  const edit = (key: string, operation: Operation<unknown>) =>
    mutations.apply({ kind: 'edit', target, updateKey: { key }, operation });

  if (current !== group && current !== 'hidden') {
    await edit(visibilityKeys[current], { name: 'remove', target: fieldName });
  }
  if (group === 'hidden') {
    return;
  }
  if (current !== group) {
    await edit(visibilityKeys[group], { name: 'add', target: fieldName });
  }
  if (index !== undefined) {
    await edit(visibilityKeys[group], {
      name: 'rank',
      target: fieldName,
      newIndex: index,
    });
  }
}
