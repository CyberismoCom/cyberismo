/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2025
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero
  General Public License for more details. You should have received a copy of
  the GNU Affero General Public License along with this program. If not, see
  <https://www.gnu.org/licenses/>.
*/

import { expect } from 'chai';
import { describe, it } from 'mocha';

import {
  hasCode,
  errorFunction,
  errorMessage,
} from '../../src/utils/error-utils.js';

describe('error utils', () => {
  describe('hasCode type guard', () => {
    it('should return true for error with code property', () => {
      const error = new Error('test error');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (error as any).code = 'ENOENT';
      const result = hasCode(error);
      expect(result).to.equal(true);

      if (hasCode(error)) {
        expect(error.code).to.equal('ENOENT');
      }
    });

    it('should return false for regular error without code', () => {
      const error = new Error('test error');
      const result = hasCode(error);
      expect(result).to.equal(false);
    });

    it('should return false for non-error objects', () => {
      const nullResult = hasCode(null);
      expect(nullResult).to.equal(false);
      const undefinedResult = hasCode(undefined);
      expect(undefinedResult).to.equal(false);
      const stringResult = hasCode('string');
      expect(stringResult).to.equal(false);
      const numberResult = hasCode(123);
      expect(numberResult).to.equal(false);
      const objectResult = hasCode({});
      expect(objectResult).to.equal(false);
      const objectWithCodeResult = hasCode({ code: 'ENOENT' });
      expect(objectWithCodeResult).to.equal(false);
    });
  });

  describe('errorFunction', () => {
    it('should handle Error objects', () => {
      const error = new Error('test error message');
      const result = errorFunction(error);
      expect(result).to.equal('test error message');
    });

    it('should handle string errors', () => {
      const result = errorFunction('string error');
      expect(result).to.equal('string error');
    });

    it('should handle non-error objects', () => {
      const result = errorFunction({ some: 'object' });
      expect(result).to.include('errorFunction called without an error object');
      expect(result).to.include('{"some":"object"}');
    });
  });

  describe('errorMessage', () => {
    it('should return message without replacement', () => {
      const result = errorMessage('test message');
      expect(result).to.equal('test message');
    });

    it('should replace substring when specified', () => {
      const result = errorMessage('test message', 'test', 'demo');
      expect(result).to.equal('demo message');
    });

    it('should handle empty replacement parameters', () => {
      const result = errorMessage('test message', '', '');
      expect(result).to.equal('test message');
    });
  });
});
