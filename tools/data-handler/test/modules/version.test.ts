import { describe, expect, it } from 'vitest';

import {
  pickVersion,
  stripTagPrefix,
  validateVersionAgainstConstraints,
  versionToTag,
} from '../../src/modules/version.js';
import { toVersionRange } from '../../src/modules/types.js';

describe('modules/version', () => {
  describe('tag helpers', () => {
    it('versionToTag prefixes a version with v', () => {
      expect(versionToTag('1.2.3')).toBe('v1.2.3');
    });

    it('stripTagPrefix strips a leading v', () => {
      expect(stripTagPrefix('v1.2.3')).toBe('1.2.3');
    });

    it('stripTagPrefix passes through a string that has no v prefix', () => {
      // The helper does not validate the tail; non-semver refs survive.
      expect(stripTagPrefix('1.2.3')).toBe('1.2.3');
      expect(stripTagPrefix('main')).toBe('main');
    });
  });

  describe('pickVersion', () => {
    it('returns undefined for an empty list', () => {
      expect(pickVersion([])).toBeUndefined();
      expect(pickVersion([], toVersionRange('^1.0.0'))).toBeUndefined();
    });

    it('returns the highest version when no range is given', () => {
      expect(pickVersion(['2.0.0', '1.5.0', '1.0.0'])).toBe('2.0.0');
    });

    it('returns the highest version satisfying the range', () => {
      expect(
        pickVersion(['2.0.0', '1.5.0', '1.0.0'], toVersionRange('^1.0.0')),
      ).toBe('1.5.0');
    });

    it('returns undefined when nothing satisfies the range', () => {
      expect(pickVersion(['2.0.0'], toVersionRange('^3.0.0'))).toBeUndefined();
    });

    it('accepts a raw string range (callers not yet branded)', () => {
      expect(pickVersion(['1.2.3', '1.2.4'], '~1.2.0')).toBe('1.2.4');
    });
  });

  describe('validateVersionAgainstConstraints', () => {
    it('accepts a version that satisfies every constraint', () => {
      expect(() =>
        validateVersionAgainstConstraints('base', '1.2.3', [
          { range: '^1.0.0', source: 'project' },
          { range: '>=1.2.0', source: 'other' },
        ]),
      ).not.toThrow();
    });

    it('rejects a version that violates any constraint', () => {
      expect(() =>
        validateVersionAgainstConstraints('base', '2.0.0', [
          { range: '^1.0.0', source: 'project' },
        ]),
      ).toThrow(/does not satisfy constraint '\^1\.0\.0'/);
    });

    it('accepts when the constraint list is empty', () => {
      expect(() =>
        validateVersionAgainstConstraints('base', '1.0.0', []),
      ).not.toThrow();
    });
  });
});
