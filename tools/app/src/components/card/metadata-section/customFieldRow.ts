// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { CardView } from '@/lib/api/types';
import { getDefaultValue } from '@/lib/utils';
import type { FieldRowProps } from './FieldRow';

type CardField = NonNullable<CardView['fields']>[number];

/** What a field's row displays and edits, wherever the row appears. */
export type FieldRowData = Pick<
  FieldRowProps,
  | 'value'
  | 'overrideMode'
  | 'overrideValue'
  | 'calculatedValue'
  | 'label'
  | 'dataType'
  | 'description'
  | 'enumValues'
>;

type OverrideState = Pick<
  FieldRowData,
  'overrideMode' | 'overrideValue' | 'calculatedValue'
>;

/**
 * True when the field shows as an override. With nothing calculated there is
 * nothing to override, so it shows as a regular field; its edits still store
 * the override.
 */
export const presentsAsOverride = ({
  overrideMode,
  calculatedValue,
}: OverrideState) =>
  !!overrideMode &&
  calculatedValue != null &&
  calculatedValue !== '' &&
  !(Array.isArray(calculatedValue) && calculatedValue.length === 0);

/** True when a stored override replaces the field's calculated value. */
export const isOverridden = (row: OverrideState) =>
  presentsAsOverride(row) && row.overrideValue != null;

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
}: CardField): FieldRowData {
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
