/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { expect } from 'chai';
import { findParentPath, sortCards } from '../../src/utils/card-utils.js';
import { sep } from 'path';

describe('card utils', () => {
  it('findParentPath', () => {
    const parent = findParentPath(`cardRoot${sep}card_1${sep}c${sep}card_2`);
    expect(parent).to.equal(`cardRoot${sep}card_1`);
    const noChildren = findParentPath(`cardRoot${sep}card_1`);
    expect(noChildren).to.equal(null);
  });

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
