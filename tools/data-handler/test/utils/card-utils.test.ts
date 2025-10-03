import { expect } from 'chai';
import { findParentPath, sortCards } from '../../src/utils/card-utils.js';
import { sep } from 'path';

describe('card utils', () => {
  it('buildCardHierarchy', () => {});
  it('cardPathParts', () => {});

  it('findParentPath', () => {
    const parent = findParentPath(`cardRoot${sep}card_1${sep}c${sep}card_2`);
    expect(parent).to.equal(`cardRoot${sep}card_1`);
    const noChildren = findParentPath(`cardRoot${sep}card_1`);
    expect(noChildren).to.equal(null);
  });

  it('flattenCardArray', () => {});
  it('isModuleCard', () => {});
  it('isTemplateCard', () => {});
  it('moduleNameFromCardKey', () => {});
  it('parentCard', () => {});

  it('sort cards', () => {
    const cards = ['aaa_999', 'aaa_111', 'zzz_111', 'zzz_999', 'aaa_999'];
    cards.sort(sortCards);
    expect(cards.at(0)).to.equal('aaa_111');
    expect(cards.at(1)).to.equal('aaa_999');
    expect(cards.at(2)).to.equal('aaa_999');
    expect(cards.at(3)).to.equal('zzz_111');
    expect(cards.at(4)).to.equal('zzz_999');
  });
});
