// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from 'vitest';

import { idOrder } from '../../../src/domain/actions/effects/create.js';
import { compareKeys } from '../../../src/domain/actions/order.js';

// Cards k and m are at tree positions 0 and 1.
const position = (cardKey: string) => ({ m: 1, k: 0 })[cardKey];

describe('idOrder', () => {
  it.each<[string, number[]]>([
    ['k', [0, 0]],
    ['m', [0, 1]],
    ['-1', [1, -1]],
    ['0', [1, 0]],
    ['10', [1, 10]],
    ['007', [2]],
    ['1.5', [2]],
    ['none', [2]],
    ['a b', [2]],
    ['', [2]],
  ])('gives %j the key %j', (id, key) => {
    expect(idOrder(id, position)).toEqual(key);
  });

  // The rest tie here: their atoms order them.
  it('orders card Ids by tree position, then integers by value, then the rest', () => {
    const ids = ['10', 'y', '9', 'm', '-1', 'j', '007', 'k'];

    expect(
      ids.toSorted((a, b) =>
        compareKeys(idOrder(a, position), idOrder(b, position)),
      ),
    ).toEqual(['k', 'm', '-1', '9', '10', 'y', 'j', '007']);
  });
});

describe('compareKeys', () => {
  it.each<[(string | number)[], (string | number)[], number]>([
    [[], [], 0],
    [['a', 1], ['a', 1], 0],
    [['a'], ['b'], -1],
    [['b'], ['a'], 1],
    [['B'], ['a'], -1],
    [[2], [10], -1],
    [['2'], ['10'], 1],
    [['a', 2], ['a', 10], -1],
    [['a', 0, 5], ['a', 1, 0], -1],
    [['a', 2], ['b', 1], -1],
    [[1], ['a'], -1],
    [['a'], [1], 1],
    [['a'], ['a', 0], -1],
    [['a', 0], ['a'], 1],
  ])('orders %j and %j as %i', (a, b, order) => {
    expect(Math.sign(compareKeys(a, b))).toBe(order);
  });
});
