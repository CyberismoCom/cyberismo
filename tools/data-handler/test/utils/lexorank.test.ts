import {
  enbase,
  getRankBetween,
  getRankAfter,
  rebalanceRanks,
  getRankBefore,
} from '../../src/utils/lexorank.js';
import { expect, it, describe } from 'vitest';

describe('lexorank', () => {
  describe('getRankBetween', () => {
    it.each([
      ['0|a', '0|b', '0|an'],
      ['0|a', '0|c', '0|b'],
      ['0|b', '0|c', '0|bn'],
      ['0|a', '0|z', '0|m'],
      ['0|a', '0|ba', '0|an'],
      ['0|a', '0|bb', '0|an'],
      ['0|a', '0|bc', '0|ao'],
    ])(
      'when provided %s and %s it should return %s',
      (rank1, rank2, expected) => {
        expect(getRankBetween(rank1, rank2)).to.equal(expected);
      },
    );

    it('throws error if rank1 is greater than rank2', () => {
      expect(() => getRankBetween('b', 'a')).toThrow(
        'Rank1 must be smaller than rank2',
      );
    });

    it('throws error if rank1 is equal to rank2', () => {
      expect(() => getRankBetween('a', 'a')).toThrow(
        'Rank1 must be smaller than rank2',
      );
    });
  });

  describe('enbase', () => {
    it.each([
      [0, 'a'],
      [13, 'n'],
      [25, 'z'],
      [26, 'ba'],
      [52, 'ca'],
      [53, 'cb'],
      [26 * 3 + 25, 'dz'],
    ])('when provided %d it should return %s', (n, expected) => {
      expect(enbase(n)).toBe(expected);
    });
  });

  describe('getRankAfter', () => {
    it.each([
      ['0|a', '0|b'],
      ['0|b', '0|c'],
      ['0|z', '0|zn'],
      ['0|ba', '0|bb'],
    ])('when provided %s it should return %s', (rank, expected) => {
      expect(getRankAfter(rank)).toBe(expected);
    });
  });

  describe('getRankBefore', () => {
    it.each([
      ['0|b', '0|a'],
      ['0|c', '0|b'],
      ['0|zn', '0|zm'],
      ['0|bb', '0|ba'],
    ])('when provided %s it should return %s', (rank, expected) => {
      expect(getRankBefore(rank)).toBe(expected);
    });

    it('throws an error if the previous rank is negative', () => {
      expect(() => getRankBefore('0|a')).to.throw('Rank cannot be negative');
    });
  });

  describe('rebalanceRanks', () => {
    it(`rebalanceRanks(1 level)`, () => {
      const ranks = 3;
      const expected = ['0|a', '0|m', '0|z'];

      expect(rebalanceRanks(ranks)).toEqual(expected);
    });
    it(`rebalanceRanks(2 levels)`, () => {
      const ranks = 26 * 6;

      const rebalanced = rebalanceRanks(ranks);

      expect(rebalanced).toHaveLength(ranks);
      expect(rebalanced[0]).toEqual('0|aa');
      expect(rebalanced[rebalanced.length - 1]).toEqual('0|zz');
    });
    it('rebalanceRanks with 0 items', () => {
      expect(rebalanceRanks(0)).toEqual([]);
    });

    it('rebalanceRanks with 1 item', () => {
      expect(rebalanceRanks(1)).toEqual(['0|a']);
    });
  });
});
