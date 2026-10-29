// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { expect, describe, it } from 'vitest';

import {
  hasCode,
  errorFunction,
} from '../../../src/shared/utils/error-utils.js';

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
