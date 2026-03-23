/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2025

  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
  FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License
  for more details.

  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { expect, it, describe } from 'vitest';

import { FieldTypeResource as FT } from '../src/resources/field-type-resource.js';

describe('clingo results to fieldType dataType', () => {
  it('convert to boolean', () => {
    expect(FT.fromClingoResult('true', 'boolean')).toBe(true);
    expect(FT.fromClingoResult('false', 'boolean')).toBe(false);
    expect(FT.fromClingoResult('other', 'boolean')).toBe(false);
    expect(FT.fromClingoResult('null', 'boolean')).toBe(null);
    expect(FT.fromClingoResult('', 'boolean')).toBe('');
  });
  it('convert to number', () => {
    expect(FT.fromClingoResult('1', 'number')).toBe(1);
    expect(FT.fromClingoResult('-1', 'number')).toBe(-1);
    expect(FT.fromClingoResult('1.4', 'number')).toBe(1.4);
    expect(FT.fromClingoResult('-1.4000001', 'number')).toBe(-1.4000001);
    expect(FT.fromClingoResult('null', 'number')).toBe(null);
    expect(FT.fromClingoResult('', 'number')).toBe('');
  });
  it('convert to integer', () => {
    expect(FT.fromClingoResult('1', 'integer')).toBe(1);
    expect(FT.fromClingoResult('-1', 'integer')).toBe(-1);
    expect(FT.fromClingoResult('1.4', 'integer')).toBe(1);
    expect(FT.fromClingoResult('-1.4000001', 'integer')).toBe(-1);
    expect(FT.fromClingoResult('null', 'integer')).toBe(null);
    expect(FT.fromClingoResult('', 'integer')).toBe('');
  });
  it('convert to shortText', () => {
    expect(FT.fromClingoResult('abc', 'shortText')).toBe('abc');
    expect(FT.fromClingoResult('abc abc', 'shortText')).toBe('abc abc');
    expect(FT.fromClingoResult('ß', 'shortText')).toBe('ß');
    expect(FT.fromClingoResult('null', 'shortText')).toBe(null);
    expect(FT.fromClingoResult('', 'shortText')).toBe('');
  });
  it('convert to longText', () => {
    const veryLongText =
      '0123456789_0123456789_0123456789_0123456789_0123456789_0123456789_0123456789_0123456789_0123456789_0123456789_0123456789_0123456789_0123456789_0123456789_0123456789_0123456789_0123456789_0123456789_0123456789_0123456789_0123456789_0123456789_';
    expect(FT.fromClingoResult('abc', 'longText')).toBe('abc');
    expect(FT.fromClingoResult('abc abc', 'longText')).toBe('abc abc');
    expect(FT.fromClingoResult(veryLongText, 'longText')).toBe(veryLongText);
    expect(FT.fromClingoResult('ß', 'longText')).toBe('ß');
    expect(FT.fromClingoResult('null', 'longText')).toBe(null);
    expect(FT.fromClingoResult('', 'longText')).toBe('');
  });
  it('convert enum', () => {
    expect(FT.fromClingoResult('option1', 'enum')).toBe('option1');
    expect(FT.fromClingoResult('null', 'enum')).toBe(null);
    expect(FT.fromClingoResult('', 'enum')).toBe('');
  });
  it('convert list', () => {
    expect(FT.fromClingoResult('(option1, option2)', 'list')).toEqual([
      'option1',
      'option2',
    ]);
    expect(FT.fromClingoResult('()', 'list')).toEqual([]);
    expect(FT.fromClingoResult('null', 'list')).toBe(null);
    expect(FT.fromClingoResult('', 'list')).toBe('');
  });
  it('convert date', () => {
    const epoch = new Date('1973-01-01').toISOString();
    expect(FT.fromClingoResult(epoch, 'date')).toBe('1973-01-01');
    expect(FT.fromClingoResult('1972', 'date')).toBe('1972-01-01');
    expect(FT.fromClingoResult('null', 'date')).toBe(null);
    expect(FT.fromClingoResult('', 'date')).toBe('');
  });
  it('convert dateTime', () => {
    const epoch = new Date('1973-01-01').toISOString();
    expect(FT.fromClingoResult(epoch, 'dateTime')).toBe(
      '1973-01-01T00:00:00.000Z',
    );
    expect(FT.fromClingoResult('null', 'dateTime')).toBe(null);
    expect(FT.fromClingoResult('', 'dateTime')).toBe('');
  });
  it('convert person', () => {
    const person = 'person@null.local';
    const noDomain = 'person';
    const onlyDomain = '@null.local';
    expect(FT.fromClingoResult(person, 'person')).toBe(person);
    expect(FT.fromClingoResult(noDomain, 'person')).toBe(null);
    expect(FT.fromClingoResult(onlyDomain, 'person')).toBe(null);
    expect(FT.fromClingoResult('null', 'person')).toBe(null);
    expect(FT.fromClingoResult('', 'person')).toBe('');
  });
});
