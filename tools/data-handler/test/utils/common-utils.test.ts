// testing
import { expect } from 'chai';

import { deepCompare, trimWhitespace } from '../../src/utils/common-utils.js';

describe('common utils', () => {
  describe('deep compare', () => {
    it('should indicate that different objects are different', () => {
      const obj1 = { key: 'value' };
      const obj2 = { anotherKey: 'value' };
      const result = deepCompare(obj1, obj2);
      expect(result).to.equal(false);
    });
    it('should indicate that same objects, but different values are different', () => {
      const obj1 = { key: 'value' };
      const obj2 = { key: 'value2' };
      const result = deepCompare(obj1, obj2);
      expect(result).to.equal(false);
    });
    it('should indicate that same objects are same', () => {
      const obj1 = { key: 'value' };
      const obj2 = { key: 'value' };
      const result = deepCompare(obj1, obj2);
      expect(result).to.equal(true);
    });
    it('should indicate that when comparing object and array they are different', () => {
      const obj1 = { key: 'value' };
      const arr = [{ key: 'value' }];
      const result = deepCompare(obj1, arr);
      expect(result).to.equal(false);
    });
    it('should indicate that same arrays are same', () => {
      const arr1 = [{ key: 'value' }];
      const arr2 = [{ key: 'value' }];
      const result = deepCompare(arr1, arr2);
      expect(result).to.equal(true);
    });
    it('should indicate that different arrays are different', () => {
      const arr1 = [{ key: 'value' }];
      const arr2 = [{ key: 'anotherValue' }];
      const result = deepCompare(arr1, arr2);
      expect(result).to.equal(false);
    });
    it('should indicate that empty objects are same', () => {
      const result = deepCompare({}, {});
      expect(result).to.equal(true);
    });
  });
  describe('trimWhitespace', () => {
    it('should trim leading whitespace', () => {
      const input = '   text';
      const result = trimWhitespace(input);
      expect(result).to.equal('text');
    });

    it('should trim trailing whitespace', () => {
      const input = 'text   ';
      const result = trimWhitespace(input);
      expect(result).to.equal('text');
    });

    it('should trim leading and trailing whitespace', () => {
      const input = '   text   ';
      const result = trimWhitespace(input);
      expect(result).to.equal('text');
    });

    it('should trim leading newlines', () => {
      const input = '\n\ntext';
      const result = trimWhitespace(input);
      expect(result).to.equal('text');
    });

    it('should trim trailing newlines', () => {
      const input = 'text\n\n';
      const result = trimWhitespace(input);
      expect(result).to.equal('text');
    });

    it('should trim mixed whitespace characters', () => {
      const input = ' \n\t text \t\n ';
      const result = trimWhitespace(input);
      expect(result).to.equal('text');
    });

    it('should preserve internal whitespace', () => {
      const input = '  text with  spaces  ';
      const result = trimWhitespace(input);
      expect(result).to.equal('text with  spaces');
    });

    it('should handle empty string', () => {
      const result = trimWhitespace('');
      expect(result).to.equal('');
    });

    it('should handle string with only whitespace', () => {
      const input = '   \n\t  ';
      const result = trimWhitespace(input);
      expect(result).to.equal('');
    });
  });
});
