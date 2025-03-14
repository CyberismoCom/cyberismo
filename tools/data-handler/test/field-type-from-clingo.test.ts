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

import { expect } from 'chai';

import { deepCompare } from '../src/utils/common-utils.js';
import { FieldTypeResource as FT } from '../src/resources/field-type-resource.js';

describe('clingo results to fieldType dataType', () => {
  it('convert to boolean', () => {
    expect(FT.fromClingoResult('true', 'boolean')).to.equal(true);
    expect(FT.fromClingoResult('false', 'boolean')).to.equal(false);
    expect(FT.fromClingoResult('other', 'boolean')).to.equal(false);
    expect(FT.fromClingoResult('null', 'boolean')).to.equal(null);
    expect(FT.fromClingoResult('', 'boolean')).to.equal('');
  });
  it('convert to number', () => {
    expect(FT.fromClingoResult('1', 'number')).to.equal(1);
    expect(FT.fromClingoResult('-1', 'number')).to.equal(-1);
    expect(FT.fromClingoResult('1.4', 'number')).to.equal(1.4);
    expect(FT.fromClingoResult('-1.4000001', 'number')).to.equal(-1.4000001);
    expect(FT.fromClingoResult('null', 'number')).to.equal(null);
    expect(FT.fromClingoResult('', 'number')).to.equal('');
  });
  it('convert to integer', () => {
    expect(FT.fromClingoResult('1', 'integer')).to.equal(1);
    expect(FT.fromClingoResult('-1', 'integer')).to.equal(-1);
    expect(FT.fromClingoResult('1.4', 'integer')).to.equal(1);
    expect(FT.fromClingoResult('-1.4000001', 'integer')).to.equal(-1);
    expect(FT.fromClingoResult('null', 'integer')).to.equal(null);
    expect(FT.fromClingoResult('', 'integer')).to.equal('');
  });
  it('convert to shortText', () => {
    expect(FT.fromClingoResult('abc', 'shortText')).to.equal('abc');
    expect(FT.fromClingoResult('abc abc', 'shortText')).to.equal('abc abc');
    expect(FT.fromClingoResult('ß', 'shortText')).to.equal('ß');
    expect(FT.fromClingoResult('null', 'shortText')).to.equal(null);
    expect(FT.fromClingoResult('', 'shortText')).to.equal('');
  });
  it('convert to longText', () => {
    const veryLongText =
      '0123456789_0123456789_0123456789_0123456789_0123456789_0123456789_0123456789_0123456789_0123456789_0123456789_0123456789_0123456789_0123456789_0123456789_0123456789_0123456789_0123456789_0123456789_0123456789_0123456789_0123456789_0123456789_';
    expect(FT.fromClingoResult('abc', 'longText')).to.equal('abc');
    expect(FT.fromClingoResult('abc abc', 'longText')).to.equal('abc abc');
    expect(FT.fromClingoResult(veryLongText, 'longText')).to.equal(
      veryLongText,
    );
    expect(FT.fromClingoResult('ß', 'longText')).to.equal('ß');
    expect(FT.fromClingoResult('null', 'longText')).to.equal(null);
    expect(FT.fromClingoResult('', 'longText')).to.equal('');
  });
  it('convert enum', () => {
    expect(FT.fromClingoResult('option1', 'enum')).to.equal('option1');
    expect(FT.fromClingoResult('null', 'enum')).to.equal(null);
    expect(FT.fromClingoResult('', 'enum')).to.equal('');
  });
  it('convert list', () => {
    expect(
      deepCompare(FT.fromClingoResult('(option1, option2)', 'list'), [
        'option1',
        'option2',
      ]),
    ).to.equal(true);
    expect(deepCompare(FT.fromClingoResult('()', 'list'), [])).to.equal(true);
    expect(FT.fromClingoResult('null', 'list')).to.equal(null);
    expect(FT.fromClingoResult('', 'list')).to.equal('');
  });
  it('convert date', () => {
    const epoch = new Date('1973-01-01').toISOString();
    expect(FT.fromClingoResult(epoch, 'date')).to.equal('1973-01-01');
    expect(FT.fromClingoResult('1972', 'date')).to.equal('1972-01-01');
    expect(FT.fromClingoResult('null', 'date')).to.equal(null);
    expect(FT.fromClingoResult('', 'date')).to.equal('');
  });
  it('convert dateTime', () => {
    const epoch = new Date('1973-01-01').toISOString();
    expect(FT.fromClingoResult(epoch, 'dateTime')).to.equal(
      '1973-01-01T00:00:00.000Z',
    );
    expect(FT.fromClingoResult('null', 'dateTime')).to.equal(null);
    expect(FT.fromClingoResult('', 'dateTime')).to.equal('');
  });
  it('convert person', () => {
    const person = 'person@null.local';
    const noDomain = 'person';
    const onlyDomain = '@null.local';
    expect(FT.fromClingoResult(person, 'person')).to.equal(person);
    expect(FT.fromClingoResult(noDomain, 'person')).to.equal(null);
    expect(FT.fromClingoResult(onlyDomain, 'person')).to.equal(null);
    expect(FT.fromClingoResult('null', 'person')).to.equal(null);
    expect(FT.fromClingoResult('', 'person')).to.equal('');
  });
});
