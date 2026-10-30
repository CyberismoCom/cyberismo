// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from 'vitest';

import {
  fieldStaticText,
  type FieldValueRow,
} from '../../../src/domain/macros/field/text.js';

const text = (row: FieldValueRow) => fieldStaticText(row, 'L', false);

describe('fieldStaticText', () => {
  it.each<[string, FieldValueRow, string]>([
    ['shortText', { dataType: 'shortText', value: 'abc' }, 'pass:[abc]'],
    ['number', { dataType: 'number', value: 1.5 }, 'pass:[1.5]'],
    ['integer', { dataType: 'integer', value: 0 }, 'pass:[0]'],
    ['boolean true', { dataType: 'boolean', value: true }, 'pass:[Yes]'],
    ['boolean false', { dataType: 'boolean', value: false }, 'pass:[No]'],
    [
      'enum with a display value',
      { dataType: 'enum', value: { value: 'hi', displayValue: 'High' } },
      'pass:[High]',
    ],
    [
      'enum without one',
      { dataType: 'enum', value: { value: 'hi' } },
      'pass:[hi]',
    ],
    [
      'list',
      {
        dataType: 'list',
        value: [{ value: 'a', displayValue: 'A' }, { value: 'b' }],
      },
      'pass:[A, b]',
    ],
    ['date', { dataType: 'date', value: '2026-03-04' }, 'pass:[2026-03-04]'],
    [
      'dateTime',
      { dataType: 'dateTime', value: '2026-03-04T05:06:07.000+02:00' },
      'pass:[2026-03-04 03:06 UTC]',
    ],
    ['person', { dataType: 'person', value: 'a@b.fi' }, 'pass:[a@b.fi]'],
    [
      'longText',
      { dataType: 'longText', value: 'one\r\n\ntwo' },
      'pass:[one] +\npass:[] +\npass:[two]',
    ],
    ['null', { dataType: 'shortText', value: null }, 'pass:[—]'],
    ['empty string', { dataType: 'shortText', value: '' }, 'pass:[—]'],
    ['empty list', { dataType: 'list', value: [] }, 'pass:[—]'],
    [
      'an enum with no value',
      { dataType: 'enum', value: {} as { value: string } },
      'pass:[—]',
    ],
    [
      'escaped characters',
      { dataType: 'shortText', value: '&<>[]\\|+$"\'!{}' },
      'pass:[&amp;&lt;&gt;&#91;&#93;&#92;&#124;&#43;&#36;&quot;&#39;&#33;&#123;&#125;]',
    ],
  ])('renders %s', (_, row, expected) => {
    expect(text(row)).toBe(expected);
  });

  it('puts the escaped label before the value', () => {
    expect(
      fieldStaticText({ dataType: 'integer', value: 3 }, 'A*b*', true),
    ).toBe('pass:[<strong>A*b*</strong>]: pass:[3]');
  });
});
