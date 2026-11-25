// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { isEmptyFieldValue } from '../../../shared/utils/constants.js';
import { findCard } from '../../cards/read.js';
import { editCardMetadata } from '../../cards/update.js';
import { quoted } from '../facts.js';
import { cardTypeOf, projectCard, resourceExists } from './checks.js';
import { defineEffect, refuse } from './define.js';
import { coerce } from './value.js';

/**
 * setField(Card, Field, Value): sets the title or a custom field of a card.
 * The value is converted to the field's data type. The constant null
 * clears any field; "" clears a field that is not text.
 */
export const setField = defineEffect({
  name: 'setField',
  args: { card: 'card', field: 'text', value: 'value' },
  step: 'fields',
  check(checkout, e) {
    const card = projectCard(checkout, e.card);
    let dataType = 'shortText';
    if (e.field !== 'title') {
      const custom = cardTypeOf(checkout, card).customFields.find(
        (field) => field.name === e.field,
      );
      if (!custom || !resourceExists(checkout, e.field, 'fieldTypes')) {
        refuse(
          `field '${e.field}' is neither 'title' nor a custom field of card type '${card.metadata?.cardType}' (card '${card.key}')`,
        );
      }
      dataType = checkout.resources
        .byType(e.field, 'fieldTypes')
        .show().dataType;
    }
    if (dataType === 'list') {
      refuse(`list field '${e.field}' cannot be set`);
    }
    const coerced = e.value === null ? null : coerce(dataType, e.value);
    if (coerced === undefined) {
      refuse(
        `${quoted(e.value!)} is not a valid ${dataType} value for field '${e.field}' of card '${card.key}'`,
      );
    }
    return coerced;
  },
  conflict: (e, coerced) => ({
    on: ['field', e.card, e.field],
    value: JSON.stringify(coerced),
    reason: `field '${e.field}' of card '${e.card}' is set to two different values`,
  }),
  inPlace(checkout, e, coerced) {
    const current = findCard(checkout, e.card).metadata?.[e.field];
    return (
      current === coerced || (coerced === null && isEmptyFieldValue(current))
    );
  },
  async apply(checkout, e, coerced) {
    await editCardMetadata(checkout, e.card, e.field, coerced);
  },
});
