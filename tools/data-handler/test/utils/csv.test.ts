import { expect, describe, it } from 'vitest';

import { escapeCsvField, readCsvFile } from '../../src/utils/csv.js';

describe('should read csv file', () => {
  it('read a csv file', async () => {
    const file = 'test/test-data/valid.csv';
    await expect(readCsvFile(file)).resolves.toEqual([
      { test: '1', test2: '1' },
      { test: '2', test2: '3' },
    ]);
  });
  it('should reject when trying to read csv if headers and data do not match', async () => {
    const file = 'test/test-data/invalid-mismatch.csv';

    await expect(readCsvFile(file)).rejects.toThrow('Invalid Record Length');
  });
  it('should reject when trying to read csv if headers are not unique', async () => {
    const file = 'test/test-data/invalid-unique.csv';
    await expect(readCsvFile(file)).rejects.toThrow('Error parsing header');
  });
  it('should reject when trying to read csv that does not exist', async () => {
    const file = 'test/test-data/invalid-path.csv';
    await expect(readCsvFile(file)).rejects.toThrow(
      'ENOENT: no such file or directory',
    );
  });
  it('should escape double quotes by doubling them', () => {
    const input = 'Text with "quotes"';
    const result = escapeCsvField(input);
    expect(result).toBe('Text with ""quotes""');
  });
  it('should not modify field with comma (caller wraps)', () => {
    const input = 'Text, with comma';
    const result = escapeCsvField(input);
    expect(result).toBe('Text, with comma');
  });
  it('should not modify field with newline (caller wraps)', () => {
    const input = 'Line 1\nLine 2';
    const result = escapeCsvField(input);
    expect(result).toBe('Line 1\nLine 2');
  });
  it('should not modify field with carriage return (caller wraps)', () => {
    const input = 'Line 1\rLine 2';
    const result = escapeCsvField(input);
    expect(result).toBe('Line 1\rLine 2');
  });
  it('should handle multiple special characters (only escapes quotes)', () => {
    const input = 'Text with "quotes", comma\nand newline';
    const result = escapeCsvField(input);
    expect(result).toBe('Text with ""quotes"", comma\nand newline');
  });
  it('should not wrap simple text without special characters', () => {
    const input = 'Simple text';
    const result = escapeCsvField(input);
    expect(result).toBe('Simple text');
  });
  it('handles empty string', () => {
    const result = escapeCsvField('');
    expect(result).toBe('');
  });
  it('handles field with only quotes', () => {
    const input = '"""';
    const result = escapeCsvField(input);
    // Three quotes become six quotes (doubled)
    expect(result).toBe('""""""');
  });
});
