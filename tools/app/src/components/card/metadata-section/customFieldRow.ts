// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { CardView } from '@/lib/api/types';
import { getDefaultValue } from '@/lib/utils';
import type { FieldRowProps } from './FieldRow';

type CardField = NonNullable<CardView['fields']>[number];

/** How a custom field shows in a FieldRow, wherever the row appears. */
export function customFieldRow({
  key,
  dataType,
  enumValues,
  fieldDisplayName,
  fieldDescription,
  isOverridable,
  value,
  calculatedValue,
  overrideValue,
}: CardField): Pick<
  FieldRowProps,
  | 'value'
  | 'overrideMode'
  | 'overrideValue'
  | 'calculatedValue'
  | 'label'
  | 'dataType'
  | 'description'
  | 'enumValues'
> {
  return {
    value: getDefaultValue(value),
    overrideMode: isOverridable,
    overrideValue: isOverridable
      ? getDefaultValue(overrideValue ?? null)
      : undefined,
    calculatedValue: isOverridable
      ? getDefaultValue(calculatedValue ?? null)
      : undefined,
    label: fieldDisplayName || key,
    dataType,
    description: fieldDescription,
    enumValues,
  };
}
