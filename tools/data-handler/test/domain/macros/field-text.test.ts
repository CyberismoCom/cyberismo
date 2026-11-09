// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from 'vitest';
import { convert, MemoryLogger } from '@asciidoctor/core';
import { JSDOM } from 'jsdom';

import {
  fieldStaticText,
  type FieldValueRow,
} from '../../../src/domain/macros/field/index.js';

const text = (row: FieldValueRow) => fieldStaticText(row, 'L', false, 'inline');
const shortText = (value: string): FieldValueRow => ({
  dataType: 'shortText',
  value,
});

// Rendered text of `adoc`, read through a DOM so markup and entities resolve as a browser would.
async function render(adoc: string) {
  const logger = MemoryLogger.create();
  const html = String(await convert(adoc, { safe: 'secure', logger }));
  const fragment = JSDOM.fragment(html);
  // A hard line break is `<br>` followed by a newline; keep only the newline.
  fragment.querySelectorAll('br').forEach((br) => br.remove());
  const plain = fragment.textContent ?? '';
  return { html, plain, messages: logger.getMessages() };
}

const BEFORE = 'before';
const AFTER = 'after';
const ASCII = Array.from({ length: 95 }, (_, i) =>
  String.fromCharCode(32 + i),
).join('');

describe('fieldStaticText', () => {
  it.each<[string, FieldValueRow, string]>([
    ['shortText', { dataType: 'shortText', value: 'abc' }, 'abc'],
    ['number', { dataType: 'number', value: 1.5 }, '1.5'],
    ['integer', { dataType: 'integer', value: 0 }, '0'],
    ['boolean true', { dataType: 'boolean', value: true }, 'Yes'],
    ['boolean false', { dataType: 'boolean', value: false }, 'No'],
    [
      'enum with a display value',
      { dataType: 'enum', value: { value: 'hi', displayValue: 'High' } },
      'High',
    ],
    ['enum without one', { dataType: 'enum', value: { value: 'hi' } }, 'hi'],
    [
      'list',
      {
        dataType: 'list',
        value: [{ value: 'a', displayValue: 'A' }, { value: 'b' }],
      },
      'A, b',
    ],
    ['date', { dataType: 'date', value: '2026-03-04' }, '2026-03-04'],
    [
      'dateTime',
      { dataType: 'dateTime', value: '2026-03-04T05:06:07.000+02:00' },
      '2026-03-04T05:06:07.000+02:00',
    ],
    ['person', { dataType: 'person', value: 'a@b.fi' }, 'a@b.fi'],
    ['longText', { dataType: 'longText', value: 'one\r\n\ntwo' }, 'one\n\ntwo'],
    ['null', { dataType: 'shortText', value: null }, '—'],
    ['empty string', { dataType: 'shortText', value: '' }, '—'],
    ['empty list', { dataType: 'list', value: [] }, '—'],
  ])('renders %s', async (_, row, expected) => {
    expect((await render(text(row))).plain.trim()).toBe(expected);
  });

  it('puts the label before the value in bold', async () => {
    const { html, plain } = await render(
      fieldStaticText({ dataType: 'integer', value: 3 }, 'L', true, 'inline'),
    );
    expect(html).toContain('<strong>L</strong>: 3');
    expect(plain.trim()).toBe('L: 3');
  });

  it('renders a label literally', async () => {
    const label = '*a* {{b}} _c_\n= d';
    const { plain, html } = await render(
      fieldStaticText(shortText('v'), label, true, 'inline'),
    );
    expect(html).toContain('<strong>');
    expect(plain.trim()).toBe(`${label}: v`);
  });

  describe('renders a value exactly as typed', () => {
    const values: [string, string][] = [
      ['plus signs', 'Uses C++ and C++ libraries'],
      ['a trailing plus', 'a +\nb +'],
      ['a comment line', 'a\n// todo\nb'],
      ['an attribute line', 'a\n[draft]\nb'],
      ['a literal block delimiter', 'a\n....\nb'],
      ['a quote block delimiter', 'a\n____\nb'],
      ['a sidebar delimiter', 'a\n****\nb'],
      ['a heading underline', 'Notes\n-----\nb'],
      ['a level-0 underline', 'Title\n=====\nb'],
      ['an admonition', 'NOTE: check later'],
      ['a pipe', 'a | b'],
      ['braces', '{{#include}}"cardKey": "x"{{/include}} and {{ stray'],
      ['an attribute reference', '{nested} {{x}}'],
      ['all printable ASCII', ASCII],
      ['non-ASCII letters', 'äöå 日本'],
      ['a blank line', 'one\r\n\r\ntwo'],
      ['trailing blank lines', 'one\n\n'],
    ];
    const contexts: [string, (cell: string) => string][] = [
      ['between paragraphs', (cell) => `${BEFORE}\n\n«${cell}»\n\n${AFTER}`],
      ['inline in a sentence', (cell) => `${BEFORE} «${cell}» ${AFTER}`],
      ['a table cell', (cell) => `|===\n|${BEFORE} «${cell}» |${AFTER}\n|===`],
      ['an a| cell', (cell) => `|===\na|${BEFORE} «${cell}» |${AFTER}\n|===`],
    ];

    for (const [context, wrap] of contexts) {
      it.each(values)(`in ${context}: %s`, async (_, value) => {
        const adoc = wrap(text(shortText(value)));
        const { plain, html, messages } = await render(adoc);

        expect(plain.match(/«([\s\S]*?)»/)?.[1]).toBe(
          value.replaceAll('\r\n', '\n'),
        );
        expect(plain).toContain(AFTER);
        expect(messages).toEqual([]);
        if (context.includes('cell')) {
          expect(html.match(/<td/g)).toHaveLength(2);
        } else {
          expect(html).not.toMatch(/<h\d|admonition|literalblock|quoteblock/);
        }
      });
    }
  });
});
