// testing
import { expect } from 'chai';

import { deepCompare, singularType } from '../../src/utils/common-utils.js';

describe('common utils', () => {
  it('change plural type name to singular', async () => {
    const types = ['cardtypes', 'fieldtypes', 'linktypes', 'workflows'];
    const expectedTypes = ['cardtype', 'fieldtype', 'linktype', 'workflow'];
    let index = 0;
    for (const type of types) {
      const singular = singularType(type);
      expect(expectedTypes[index]).to.equal(singular);
      ++index;
    }
  });

  describe('deep compare', () => {
    it('different objects', () => {
      const obj1 = { key: 'value' };
      const obj2 = { anotherKey: 'value' };
      const result = deepCompare(obj1, obj2);
      expect(result).to.equal(false);
    });
    it('same objects, but different values', () => {
      const obj1 = { key: 'value' };
      const obj2 = { key: 'value2' };
      const result = deepCompare(obj1, obj2);
      expect(result).to.equal(false);
    });
    it('same objects', () => {
      const obj1 = { key: 'value' };
      const obj2 = { key: 'value' };
      const result = deepCompare(obj1, obj2);
      expect(result).to.equal(true);
    });
    it('object and array', () => {
      const obj1 = { key: 'value' };
      const arr = [{ key: 'value' }];
      const result = deepCompare(obj1, arr);
      expect(result).to.equal(false);
    });
    it('same arrays', () => {
      const arr1 = [{ key: 'value' }];
      const arr2 = [{ key: 'value' }];
      const result = deepCompare(arr1, arr2);
      expect(result).to.equal(true);
    });
    it('different arrays', () => {
      const arr1 = [{ key: 'value' }];
      const arr2 = [{ key: 'anotherValue' }];
      const result = deepCompare(arr1, arr2);
      expect(result).to.equal(false);
    });
    it('empty objects', () => {
      const result = deepCompare({}, {});
      expect(result).to.equal(true);
    });
  });
});
