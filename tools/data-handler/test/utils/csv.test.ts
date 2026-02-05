import { expect, use } from 'chai';
import chaiAsPromised from 'chai-as-promised';

import { escapeCsvField, readCsvFile } from '../../src/utils/csv.js';

use(chaiAsPromised);

describe('should read csv file', () => {
  it('read a csv file', () => {
    const file = 'test/test-data/valid.csv';
    return expect(readCsvFile(file)).to.eventually.deep.equal([
      { test: '1', test2: '1' },
      { test: '2', test2: '3' },
    ]);
  });
  it('should reject when trying to read csv if headers and data do not match', () => {
    const file = 'test/test-data/invalid-mismatch.csv';
    return expect(readCsvFile(file)).to.be.rejectedWith(
      'Invalid Record Length',
    );
  });
  it('should reject when trying to read csv if headers are not unique', () => {
    const file = 'test/test-data/invalid-unique.csv';
    return expect(readCsvFile(file)).to.be.rejectedWith('Error parsing header');
  });
  it('should reject when trying to read csv that does not exist', () => {
    const file = 'test/test-data/invalid-path.csv';
    return expect(readCsvFile(file)).to.be.rejectedWith(
      'ENOENT: no such file or directory',
    );
  });
  it('should escape double quotes by doubling them', () => {
    const input = 'Text with "quotes"';
    const result = escapeCsvField(input);
    expect(result).to.equal('Text with ""quotes""');
  });
  it('should not modify field with comma (caller wraps)', () => {
    const input = 'Text, with comma';
    const result = escapeCsvField(input);
    expect(result).to.equal('Text, with comma');
  });
  it('should not modify field with newline (caller wraps)', () => {
    const input = 'Line 1\nLine 2';
    const result = escapeCsvField(input);
    expect(result).to.equal('Line 1\nLine 2');
  });
  it('should not modify field with carriage return (caller wraps)', () => {
    const input = 'Line 1\rLine 2';
    const result = escapeCsvField(input);
    expect(result).to.equal('Line 1\rLine 2');
  });
  it('should handle multiple special characters (only escapes quotes)', () => {
    const input = 'Text with "quotes", comma\nand newline';
    const result = escapeCsvField(input);
    expect(result).to.equal('Text with ""quotes"", comma\nand newline');
  });
  it('should not wrap simple text without special characters', () => {
    const input = 'Simple text';
    const result = escapeCsvField(input);
    expect(result).to.equal('Simple text');
  });
  it('handles empty string', () => {
    const result = escapeCsvField('');
    expect(result).to.equal('');
  });
  it('handles field with only quotes', () => {
    const input = '"""';
    const result = escapeCsvField(input);
    // Three quotes become six quotes (doubled)
    expect(result).to.equal('""""""');
  });
});
