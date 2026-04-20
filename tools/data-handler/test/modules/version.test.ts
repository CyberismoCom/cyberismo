import { describe, expect, it } from 'vitest';

import {
  assertSatisfies,
  pickVersion,
  satisfies,
  tagToVersion,
  versionToTag,
} from '../../src/modules/version.js';
import { toVersionRange } from '../../src/modules/types.js';

// Pure helpers — no fixtures, no async. Keep the suite light; integration
// behaviour lives on resolver/source suites.

describe('modules/version', () => {
  describe('tag helpers', () => {
    it('versionToTag prefixes a version with v', () => {
      expect(versionToTag('1.2.3')).toBe('v1.2.3');
    });

    it('tagToVersion strips a leading v', () => {
      expect(tagToVersion('v1.2.3')).toBe('1.2.3');
    });

    it('tagToVersion passes through a string that has no v prefix', () => {
      // Phase 2 doc: the helper intentionally does not validate the tail,
      // so non-semver refs survive the round-trip unchanged.
      expect(tagToVersion('1.2.3')).toBe('1.2.3');
      expect(tagToVersion('main')).toBe('main');
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

  describe('satisfies', () => {
    it('returns true when the version is inside the range', () => {
      expect(satisfies('1.5.0', toVersionRange('^1.0.0'))).toBe(true);
    });

    it('returns false when the version is outside the range', () => {
      expect(satisfies('2.0.0', toVersionRange('^1.0.0'))).toBe(false);
    });
  });

  describe('assertSatisfies', () => {
    it('is a no-op when the version satisfies the range', () => {
      expect(() =>
        assertSatisfies('1.5.0', '^1.0.0', 'imported by project'),
      ).not.toThrow();
    });

    it('throws with the supplied context interpolated into the message', () => {
      expect(() =>
        assertSatisfies('2.0.0', '^1.0.0', 'imported by project'),
      ).toThrow(/imported by project/);
    });

    it('includes the offending version and range in the error', () => {
      expect(() => assertSatisfies('2.0.0', '^1.0.0', 'ctx')).toThrow(
        /'2\.0\.0'.*'\^1\.0\.0'/,
      );
    });
  });
});
