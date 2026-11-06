// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { DataType } from '@/lib/definitions';

// What the editor of each type asks for; the rest have no hint of their own.
const TYPE_HINTS: Partial<Record<DataType, string>> = {
  shortText: 'placeholder.shortText',
  longText: 'placeholder.longText',
  integer: 'placeholder.integer',
  number: 'placeholder.number',
  enum: 'placeholder.enum',
  list: 'placeholder.list',
  boolean: 'placeholder.boolean',
  person: 'fieldMacro.enterEmail',
  date: 'fieldMacro.selectDate',
  dateTime: 'fieldMacro.selectDateTime',
};

/**
 * What an empty field shows in the field macro: a dash when it cannot be
 * edited, otherwise an invitation. A row asks for the type of value; inline
 * text names the field, as the row's label may be hidden there.
 */
export function emptyFieldText(
  t: (key: string, options?: Record<string, unknown>) => string,
  {
    label,
    dataType,
    disabled,
    display,
  }: {
    label: string;
    dataType: DataType | 'label';
    disabled: boolean;
    display: 'row' | 'inline';
  },
): string {
  if (disabled) return t('fieldMacro.empty');
  const hint = display === 'row' && TYPE_HINTS[dataType as DataType];
  return hint ? t(hint) : t('fieldMacro.enter', { label });
}
