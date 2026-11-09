// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from 'vitest';
import { emptyFieldText } from '@/lib/emptyFieldText';

const t = (key: string, options?: Record<string, unknown>) =>
  options?.label ? `${key} ${options.label}` : key;

describe('emptyFieldText', () => {
  it.each([
    { dataType: 'shortText', expected: 'placeholder.shortText' },
    { dataType: 'person', expected: 'fieldMacro.enterEmail' },
    { dataType: 'date', expected: 'fieldMacro.selectDate' },
    { dataType: 'dateTime', expected: 'fieldMacro.selectDateTime' },
    // No hint of its own in the editor: name the field instead.
    { dataType: 'label', expected: 'fieldMacro.enter Owner' },
  ] as const)(
    'asks a row of $dataType for "$expected"',
    ({ dataType, expected }) => {
      expect(
        emptyFieldText(t, {
          label: 'Owner',
          dataType,
          disabled: false,
          display: 'row',
        }),
      ).toBe(expected);
    },
  );

  it.each([
    { display: 'inline', disabled: false, expected: 'fieldMacro.enter Owner' },
    { display: 'row', disabled: true, expected: 'fieldMacro.empty' },
  ] as const)(
    'shows $display disabled=$disabled as "$expected"',
    ({ display, disabled, expected }) => {
      expect(
        emptyFieldText(t, {
          label: 'Owner',
          dataType: 'shortText',
          disabled,
          display,
        }),
      ).toBe(expected);
    },
  );
});
