import {
  enbase,
  getRankBetween,
  getRankAfter,
  rebalanceRanks,
  getRankBefore,
  FIRST_RANK,
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

    it('regression: getRankAfter(EMPTY_RANK) returns malformed "0|"', () => {
      expect(getRankAfter('1|a')).toBe('0|');
    });

    // Base-26 rank arithmetic used to run on Number, so debase summed
    // 26^k terms: at 12 characters that exceeds Number.MAX_SAFE_INTEGER and
    // 'num + 1' stops being a different number. Sequential appends reach 12
    // characters after 158 cards, and there getRankAfter stepped *backwards*
    // once and then returned its own input forever - so no card could be
    // appended after the last one. A 226-root-card project reaches this.
    it('appends 500 times without saturating', () => {
      const ranks: string[] = [];
      let rank = FIRST_RANK;
      for (let index = 0; index < 500; index++) {
        rank = getRankAfter(rank);
        ranks.push(rank);
      }

      expect(new Set(ranks).size).toBe(500);
      for (let index = 1; index < ranks.length; index++) {
        expect(
          ranks[index] > ranks[index - 1],
          `rank ${index} (${ranks[index]}) must be after rank ${index - 1} (${ranks[index - 1]})`,
        ).toBe(true);
      }
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

    // The intermediate ranks were not padded to the block's level count, so
    // they sorted by their first character: with two levels, 'z' (25) landed
    // after 'ba' (26) and a rebalanced block of more than 26 cards was not in
    // increasing order at all - a rebalance that reorders the cards it is
    // supposed to be leaving in place.
    it.each([27, 156, 500, 700])(
      'rebalanceRanks(%d) is strictly increasing',
      (rankAmount) => {
        const ranks = rebalanceRanks(rankAmount);
        expect(ranks).toHaveLength(rankAmount);
        expect(new Set(ranks).size).toBe(rankAmount);
        for (let index = 1; index < ranks.length; index++) {
          expect(
            ranks[index] > ranks[index - 1],
            `rank ${index} (${ranks[index]}) must be after rank ${index - 1} (${ranks[index - 1]})`,
          ).toBe(true);
        }
      },
    );
  });
});
