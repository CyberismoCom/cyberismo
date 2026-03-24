import { expect, describe, it } from 'vitest';

import {
  allowed,
  fromDate,
  fromNumber,
  fromString,
} from '../../src/utils/value-utils.js';
import type { DataType } from '../../src/interfaces/resource-interfaces.js';

describe('data type conversions', () => {
  const dataTypes: DataType[] = [
    'boolean',
    'date',
    'dateTime',
    'enum',
    'integer',
    'list',
    'longText',
    'number',
    'person',
    'shortText',
  ];
  // Map: fromType -> list of allowed types
  const allowedConversions = new Map([
    ['boolean', ['shortText', 'longText']],
    ['date', ['dateTime', 'shortText', 'longText']],
    ['dateTime', ['date', 'shortText', 'longText']],
    ['enum', ['shortText', 'longText']],
    ['integer', ['number', 'shortText', 'longText']],
    ['list', ['shortText', 'longText']],
    [
      'longText',
      [
        'boolean',
        'date',
        'dateTime',
        'integer',
        'number',
        'list',
        'person',
        'shortText',
      ],
    ],
    ['number', ['integer', 'shortText', 'longText']],
    ['person', ['shortText', 'longText']],
    [
      'shortText',
      [
        'boolean',
        'date',
        'dateTime',
        'integer',
        'number',
        'list',
        'person',
        'longText',
      ],
    ],
  ]);

  it('allowed conversion', () => {
    for (const typeFrom of dataTypes) {
      for (const typeTo of dataTypes) {
        // skip converting to same type
        if (typeTo == typeFrom) {
          continue;
        }
        const types = allowedConversions.get(typeFrom);
        const result = allowed(typeFrom, typeTo);
        if (result === true) {
          expect(types).toContain(typeTo);
        } else {
          expect(types).not.toContain(typeTo);
        }
      }
    }
  });
  it('convert from date', () => {
    const value = '1970-01-01';
    for (const type of dataTypes) {
      const result = fromDate(value, type);
      if (type === 'date' || type === 'longText' || type === 'shortText') {
        expect(result).not.toBeNull();
        expect(result).toBe('1970-01-01');
      } else if (type === 'dateTime') {
        expect(result).not.toBeNull();
        expect(result).toBe('1970-01-01T00:00:00.000Z');
      } else {
        expect(result).toBeNull();
      }
    }
  });
  it('convert from integer', () => {
    const value = 555;
    for (const type of dataTypes) {
      const result = fromNumber(value, type);
      if (type === 'longText' || type === 'shortText') {
        expect(result).not.toBeNull();
        expect(result).toBe('555');
      } else if (type === 'integer' || type === 'number') {
        expect(result).not.toBeNull();
        expect(result).toBe(555);
      } else {
        expect(result).toBeNull();
      }
    }
  });
  it('convert from number', () => {
    const value = 555.555;
    for (const type of dataTypes) {
      const result = fromNumber(value, type);
      if (type === 'longText' || type === 'shortText') {
        expect(result).not.toBeNull();
        expect(result).toBe('555.555');
      } else if (type === 'integer') {
        expect(result).not.toBeNull();
        expect(result).toBe(555);
      } else if (type === 'number') {
        expect(result).not.toBeNull();
        expect(result).toBe(555.555);
      } else {
        expect(result).toBeNull();
      }
    }
  });
  it('convert from string', () => {
    const value = 'hello there';
    for (const type of dataTypes) {
      const result = fromString(value, type);
      if (type === 'longText' || type === 'shortText') {
        expect(result).not.toBeNull();
        expect(result).toBe('hello there');
      } else if (type === 'list') {
        expect(result).not.toBeNull();
        expect(result as string[]).toHaveLength(1);
        expect((result as string[]).at(0)).toBe('hello there');
      } else {
        expect(result).toBeNull();
      }
    }
  });
  it('convert from string to "person"', () => {
    const value = 'test.person@example.com';
    const result = fromString(value, 'person');
    expect(result).toBe('test.person@example.com');
  });
  it('convert from string to "integer"', () => {
    const value = '5';
    let result = fromString(value, 'integer');
    expect(result).toBe(5);
    const invalidValue = 'a';
    result = fromString(invalidValue, 'integer');
    expect(result).toBeNull();
  });
  it('convert from string to "number"', () => {
    const value = '5.5';
    let result = fromString(value, 'number');
    expect(result).toBe(5.5);
    const invalidValue = 'a';
    result = fromString(invalidValue, 'number');
    expect(result).toBeNull();
  });
  it('convert from string to "date"', () => {
    const value = '1970-01-01';
    let result = fromString(value, 'date');
    expect(result).toBe('1970-01-01');
    const invalidValue = 'a';
    result = fromString(invalidValue, 'date');
    expect(result).toBeNull();
  });
  it('convert from string to "dateTime"', () => {
    const value = '1970-01-01';
    let result = fromString(value, 'dateTime');
    expect(result).toBe('1970-01-01T00:00:00.000Z');
    const invalidValue = 'a';
    result = fromString(invalidValue, 'dateTime');
    expect(result).toBeNull();
  });
  it('convert from string to "boolean"', () => {
    const valueTrue = 'true';
    const valueFalse = 'false';
    let result = fromString(valueTrue, 'boolean');
    expect(result).toBe(true);
    result = fromString(valueFalse, 'boolean');
    expect(result).toBe(false);
    const invalidValue = 'a';
    result = fromString(invalidValue, 'boolean');
    expect(result).toBeNull();
  });
  it('convert from string to "list"', () => {
    const value = 'option1,option2';
    const result = fromString(value, 'list');
    expect(result as string[]).toHaveLength(2);
    expect((result as string[]).at(0)).toBe('option1');
    expect((result as string[]).at(1)).toBe('option2');
  });
});
