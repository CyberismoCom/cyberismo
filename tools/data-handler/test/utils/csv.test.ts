import { readCsvFile } from '../../src/utils/csv.js';
import { expect, use } from 'chai';
import chaiAsPromised from 'chai-as-promised';

use(chaiAsPromised);

describe('readCsvFile', () => {
  it('read a csv file', () => {
    const file = 'test/test-data/valid.csv';
    return expect(readCsvFile(file)).to.eventually.deep.equal([
      { test: '1', test2: '1' },
      { test: '2', test2: '3' },
    ]);
  });
  it('try reading csv if headers and data do not match', () => {
    const file = 'test/test-data/invalid-mismatch.csv';
    return expect(readCsvFile(file)).to.be.rejectedWith(
      'Invalid Record Length',
    );
  });
  it('try reading csv if headers are not unique', () => {
    const file = 'test/test-data/invalid-unique.csv';
    return expect(readCsvFile(file)).to.be.rejectedWith('Error parsing header');
  });
  it('try reading csv that does not exist', () => {
    const file = 'test/test-data/invalid-path.csv';
    return expect(readCsvFile(file)).to.be.rejectedWith(
      'ENOENT: no such file or directory',
    );
  });
});
