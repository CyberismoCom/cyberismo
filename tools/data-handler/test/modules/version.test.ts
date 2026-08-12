import { describe, expect, it } from 'vitest';

import {
  pickVersion,
  stripTagPrefix,
  validateVersionAgainstConstraints,
  versionToTag,
} from '../../src/modules/version.js';

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
    });

    it('returns the highest version', () => {
      expect(pickVersion(['2.0.0', '1.5.0', '1.0.0'])).toBe('2.0.0');
    });

    it('ignores entries that are not valid semver', () => {
      expect(pickVersion(['not-a-version', '1.5.0'])).toBe('1.5.0');
      expect(pickVersion(['not-a-version'])).toBeUndefined();
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
