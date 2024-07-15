import {
  enbase,
  getRankBetween,
  getRankAfter,
  rebalanceRanks,
  getRankBefore,
} from '../../src/utils/lexorank.js';
import { expect } from 'chai';

// list different test cases
// getRankBetween returns the rank between two ranks(e.g. 'a' and 'b' returns 'an')

const getRankBetweenTests = [
  ['0|a', '0|b', '0|an'],
  ['0|a', '0|c', '0|b'],
  ['0|b', '0|c', '0|bn'],
  ['0|a', '0|z', '0|m'],
  ['0|a', '0|ba', '0|an'],
  ['0|a', '0|bb', '0|an'],
  ['0|a', '0|bc', '0|ao'],
];

const enbaseTests = [
  [0, 'a'],
  [13, 'n'],
  [25, 'z'],
  [26, 'ba'],
  [52, 'ca'],
  [53, 'cb'],
  [26 * 3 + 25, 'dz'],
];

const getRankeAfterTests = [
  ['0|a', '0|b'],
  ['0|b', '0|c'],
  ['0|z', '0|zn'],
  ['0|ba', '0|bb'],
];

const getRankBeforeTests = [
  ['0|b', '0|a'],
  ['0|c', '0|b'],
  ['0|zn', '0|zm'],
  ['0|bb', '0|ba'],
];

describe('lexorank', () => {
  getRankBetweenTests.forEach(([a, b, expected]) => {
    it(`getRankBetween(${a}, ${b})`, () => {
      expect(getRankBetween(a, b)).to.equal(expected);
    });
  });

  it('getRankBetween throws error if rank1 is greater than rank2', () => {
    expect(() => getRankBetween('b', 'a')).to.throw(
      'Rank1 must be smaller than rank2',
    );
  });

  it('getRankBetween throws error if rank1 is equal to rank2', () => {
    expect(() => getRankBetween('a', 'a')).to.throw(
      'Rank1 must be smaller than rank2',
    );
  });

  enbaseTests.forEach(([n, expected]) => {
    it(`enbase(${n})`, () => {
      expect(enbase(n as number)).to.equal(expected);
    });
  });

  getRankeAfterTests.forEach(([rank, expected]) => {
    it(`getRankAfter(${rank})`, () => {
      expect(getRankAfter(rank)).to.equal(expected);
    });
  });

  getRankBeforeTests.forEach(([rank, expected]) => {
    it(`getRankBefore(${rank})`, () => {
      expect(getRankBefore(rank)).to.equal(expected);
    });
  });

  it('getRankBefore(a) throws error', () => {
    expect(() => getRankBefore('0|a')).to.throw('Rank cannot be negative');
  });

  it(`rebalanceRanks(1 level)`, () => {
    const ranks = 3;
    const expected = ['0|a', '0|m', '0|z'];

    expect(rebalanceRanks(ranks)).to.deep.equal(expected);
  });
  it(`rebalanceRanks(2 levels)`, () => {
    const ranks = 26 * 6;

    const rebalanced = rebalanceRanks(ranks);

    expect(rebalanced.length).to.equal(ranks);
    expect(rebalanced[0]).to.equal('0|aa');
    expect(rebalanced[rebalanced.length - 1]).to.equal('0|zz');
  });
  it('rebalanceRanks with 0 items', () => {
    expect(rebalanceRanks(0)).to.deep.equal([]);
  });

  it('rebalanceRanks with 1 item', () => {
    expect(rebalanceRanks(1)).to.deep.equal(['0|a']);
  });
});
