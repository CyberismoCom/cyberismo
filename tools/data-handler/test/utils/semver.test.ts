/* eslint-disable @typescript-eslint/no-unused-expressions */

// testing
import { expect } from 'chai';
import { describe, it } from 'mocha';

import {
  parseSemver,
  formatSemver,
  bumpSemver,
  formatTag,
  parseTag,
  compareSemver,
} from '../../src/utils/semver.js';

describe('semver utilities', () => {
  describe('parseSemver', () => {
    it('should parse a valid semver string', () => {
      expect(parseSemver('1.2.3')).to.deep.equal({
        major: 1,
        minor: 2,
        patch: 3,
      });
    });

    it('should parse 0.0.0', () => {
      expect(parseSemver('0.0.0')).to.deep.equal({
        major: 0,
        minor: 0,
        patch: 0,
      });
    });

    it('should parse large numbers', () => {
      expect(parseSemver('100.200.300')).to.deep.equal({
        major: 100,
        minor: 200,
        patch: 300,
      });
    });

    it('should throw on invalid input', () => {
      expect(() => parseSemver('not-a-version')).to.throw('Invalid semver');
      expect(() => parseSemver('1.2')).to.throw('Invalid semver');
      expect(() => parseSemver('v1.2.3')).to.throw('Invalid semver');
      expect(() => parseSemver('1.2.3-beta')).to.throw('Invalid semver');
      expect(() => parseSemver('')).to.throw('Invalid semver');
    });
  });

  describe('formatSemver', () => {
    it('should format a SemVer object to string', () => {
      expect(formatSemver({ major: 1, minor: 2, patch: 3 })).to.equal('1.2.3');
    });
  });

  describe('bumpSemver', () => {
    it('should bump patch', () => {
      expect(bumpSemver('1.2.3', 'patch')).to.equal('1.2.4');
    });

    it('should bump minor and reset patch', () => {
      expect(bumpSemver('1.2.3', 'minor')).to.equal('1.3.0');
    });

    it('should bump major and reset minor+patch', () => {
      expect(bumpSemver('1.2.3', 'major')).to.equal('2.0.0');
    });

    it('should handle bump from 0.0.0', () => {
      expect(bumpSemver('0.0.0', 'patch')).to.equal('0.0.1');
      expect(bumpSemver('0.0.0', 'minor')).to.equal('0.1.0');
      expect(bumpSemver('0.0.0', 'major')).to.equal('1.0.0');
    });

    it('should handle bump from 1.0.0', () => {
      expect(bumpSemver('1.0.0', 'patch')).to.equal('1.0.1');
      expect(bumpSemver('1.0.0', 'minor')).to.equal('1.1.0');
      expect(bumpSemver('1.0.0', 'major')).to.equal('2.0.0');
    });
  });

  describe('formatTag', () => {
    it('should prefix version with v', () => {
      expect(formatTag('1.2.3')).to.equal('v1.2.3');
    });
  });

  describe('parseTag', () => {
    it('should extract version from a valid tag', () => {
      expect(parseTag('v1.2.3')).to.equal('1.2.3');
    });

    it('should return null for invalid tags', () => {
      expect(parseTag('1.2.3')).to.be.null;
      expect(parseTag('version-1.2.3')).to.be.null;
      expect(parseTag('v1.2')).to.be.null;
      expect(parseTag('vabc')).to.be.null;
      expect(parseTag('')).to.be.null;
    });
  });

  describe('compareSemver', () => {
    it('should compare equal versions', () => {
      expect(compareSemver('1.2.3', '1.2.3')).to.equal(0);
    });

    it('should compare by major version', () => {
      expect(compareSemver('2.0.0', '1.0.0')).to.be.greaterThan(0);
      expect(compareSemver('1.0.0', '2.0.0')).to.be.lessThan(0);
    });

    it('should compare by minor version', () => {
      expect(compareSemver('1.2.0', '1.1.0')).to.be.greaterThan(0);
      expect(compareSemver('1.1.0', '1.2.0')).to.be.lessThan(0);
    });

    it('should compare by patch version', () => {
      expect(compareSemver('1.2.4', '1.2.3')).to.be.greaterThan(0);
      expect(compareSemver('1.2.3', '1.2.4')).to.be.lessThan(0);
    });

    it('should handle sorting an array', () => {
      const versions = ['2.0.0', '1.0.0', '1.1.0', '1.0.1'];
      versions.sort(compareSemver);
      expect(versions).to.deep.equal(['1.0.0', '1.0.1', '1.1.0', '2.0.0']);
    });
  });
});
