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

import { expect, describe, it } from 'vitest';

import { hasCode, errorFunction } from '../../src/utils/error-utils.js';

describe('error utils', () => {
  describe('hasCode type guard', () => {
    it('should return true for error with code property', () => {
      const error = new Error('test error');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (error as any).code = 'ENOENT';
      const result = hasCode(error);
      expect(result).toBe(true);
    });

    it('should return false for regular error without code', () => {
      const error = new Error('test error');
      const result = hasCode(error);
      expect(result).toBe(false);
    });

    it.each([null, undefined, 'string', 123, {}, { code: 'ENOENT' }])(
      'should return false for non-error value: %o',
      (value) => {
        const result = hasCode(value);
        expect(result).toBe(false);
      },
    );
  });

  describe('errorFunction', () => {
    it('should handle Error objects', () => {
      const errorMessage = 'test error message';
      const error = new Error(errorMessage);
      const result = errorFunction(error);
      expect(result).toBe(errorMessage);
    });

    it('should handle string errors', () => {
      const errorMessage = 'string error';
      const result = errorFunction(errorMessage);
      expect(result).toBe(errorMessage);
    });

    it('should handle non-error objects', () => {
      const result = errorFunction({ some: 'object' });
      expect(result).includes('errorFunction called without an error object');
      expect(result).includes('{"some":"object"}');
    });

    it('should handle numbers', () => {
      const result = errorFunction(123);
      expect(result).includes('errorFunction called without an error object');
      expect(result).includes('123');
    });
  });
});
