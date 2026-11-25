// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from 'vitest';

import { coerce } from '../../../src/domain/actions/effects/value.js';

describe('coerce', () => {
  // [data type, text, the value written; null clears the field]
  it.each<[string, string, string | number | boolean | null]>([
    ['boolean', 'true', true],
    ['boolean', 'false', false],
    ['boolean', '', null],
    ['integer', '4', 4],
    ['integer', '-4', -4],
    ['integer', '007', 7],
    ['integer', '9007199254740991', 9007199254740991],
    ['integer', '', null],
    ['number', '4', 4],
    ['number', '-2', -2],
    ['number', '1.5', 1.5],
    ['number', '1.', 1],
    ['number', '.5', 0.5],
    ['number', '1e3', 1000],
    ['number', '1E-2', 0.01],
    ['number', '', null],
    ['shortText', 'x', 'x'],
    ['shortText', '3', '3'],
    ['shortText', '', ''],
    ['longText', 'a\nb', 'a\nb'],
    ['longText', '', ''],
    ['person', 'alice@example.com', 'alice@example.com'],
    ['person', '', ''],
    ['enum', 'y', 'y'],
    ['enum', '', ''],
    ['date', '2026-01-02', '2026-01-02'],
    ['date', '2024-02-29', '2024-02-29'],
    ['date', '', null],
    ['dateTime', '2026-01-02T03:04:05Z', '2026-01-02T03:04:05.000Z'],
    ['dateTime', '2026-01-02T03:04:05.678+02:00', '2026-01-02T01:04:05.678Z'],
    ['dateTime', '2026-01-02T03:04Z', '2026-01-02T03:04:00.000Z'],
    ['dateTime', '2026-01-02T03:04-05:30', '2026-01-02T08:34:00.000Z'],
    ['dateTime', '', null],
  ])('converts for %s the text %j to %j', (dataType, text, value) => {
    expect(coerce(dataType, text)).toBe(value);
  });

  it.each<[string, string]>([
    ['boolean', 'maybe'],
    ['boolean', 'True'],
    ['boolean', '1'],
    ['integer', '1.5'],
    ['integer', '+4'],
    ['integer', '4 '],
    ['integer', '1e3'],
    ['integer', '9007199254740992'],
    ['integer', 'abc'],
    ['number', 'abc'],
    ['number', '+4'],
    ['number', '1e400'],
    ['number', '.'],
    ['number', '0x10'],
    ['number', 'Infinity'],
    ['date', '2026-01-02T03:04:05Z'],
    ['date', '2026-02-30'],
    ['date', '2026-13-01'],
    ['date', '2.1.2026'],
    ['date', '2026-1-2'],
    ['dateTime', '2026-01-02'],
    ['dateTime', '2026-01-02T03:04:05'],
    ['dateTime', '2026-01-02T25:00:00Z'],
    ['dateTime', '2026-01-02T03:60:00Z'],
    ['dateTime', '2026-02-30T10:00:00Z'],
    ['dateTime', '2026-01-02 03:04:05Z'],
    ['list', 'x'],
    ['unknown', 'x'],
  ])('does not convert for %s the text %j', (dataType, text) => {
    expect(coerce(dataType, text)).toBeUndefined();
  });
});
