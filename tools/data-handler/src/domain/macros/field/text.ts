// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { QueryResult } from '@cyberismo/model';
import { CURLY_LEFT, CURLY_RIGHT } from '../registry.js';

type CardQueryField = QueryResult<'card'>['fields'][number];

/** The part of a card query field row that the static text reads. */
export type FieldValueRow = Pick<CardQueryField, 'dataType' | 'value'>;

const EMPTY = '—';

// Characters that could end the passthrough, start another construct, close
// an attribute value it lands in, or split a table cell.
const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '[': '&#91;',
  ']': '&#93;',
  '\\': '&#92;',
  '|': '&#124;',
  '+': '&#43;',
  $: '&#36;',
  '"': '&quot;',
  "'": '&#39;',
  '!': '&#33;',
};

/**
 * AsciiDoc that renders `text` literally. Every physical line opens with
 * `pass:[`, so no line can be read as a directive, block delimiter or
 * paragraph break.
 */
export function literal(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => {
      const escaped = line
        .replace(/[&<>[\]\\|+$"'!]/g, (c) => ESCAPES[c])
        // evaluateMacros re-scans its output; it restores these at the end
        .replaceAll('{', CURLY_LEFT)
        .replaceAll('}', CURLY_RIGHT);
      return `pass:[${escaped}]`;
    })
    .join(' +\n');
}

function valueText({ dataType, value }: FieldValueRow): string {
  if (value === null || value === undefined || value === '') {
    return EMPTY;
  }
  if (Array.isArray(value)) {
    return value.length === 0
      ? EMPTY
      : value.map((item) => item.displayValue ?? item.value).join(', ');
  }
  if (typeof value === 'object') {
    return value.displayValue ?? value.value ?? EMPTY;
  }
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }
  if (dataType === 'dateTime') {
    const date = new Date(String(value));
    if (!isNaN(date.getTime())) {
      const iso = date.toISOString();
      return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
    }
  }
  return String(value);
}

/**
 * AsciiDoc text of a field value, rendered literally.
 * @param row Card query field row; built-ins pass their value as shortText
 * @param label Label shown before the value
 * @param showLabel Whether to show the label
 */
export function fieldStaticText(
  row: FieldValueRow,
  label: string,
  showLabel: boolean,
): string {
  const value = literal(valueText(row));
  return showLabel ? `**${literal(label)}**: ${value}` : value;
}
